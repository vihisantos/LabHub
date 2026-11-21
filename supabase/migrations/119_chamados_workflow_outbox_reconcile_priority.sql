-- 119_chamados_workflow_outbox_reconcile_priority.sql
-- Correção da reconciliação introduzida pela 117.
--
-- Problemas observados em revisão:
--   * a 117 selecionava os 20 chamados MAIS RECENTES, mesmo quando o ciclo já
--     estava na outbox; em unidades com muito movimento os mesmos 20 ocupavam
--     todos os ticks e outros chamados nunca eram recuperados;
--   * não havia índice específico para a varredura por `updatedAt`.
--
-- Esta migration NÃO altera a integração QStash. Ela apenas:
--   1. cria índice parcial para a varredura elegível;
--   2. prioriza ciclos AUSENTES na outbox (hash idêntico ao da aplicação);
--   3. pagina a varredura entre ticks, garantindo que nenhum chamado fique
--      preso atrás dos mesmos registros já atendidos.

-- 1) Índice para a janela de reconciliação. O filtro parcial coincide com a
--    condição de elegibilidade da 115/117, mantendo o índice pequeno.
CREATE INDEX IF NOT EXISTS idx_chamados_tickets_workflow_reconcile
  ON public.chamados_tickets ("updatedAt" DESC)
  WHERE status = 'aberto' AND coalesce("assignedToUserId", '') = '';

-- Cursor de paginação: a varredura continua de onde parou no tick anterior.
ALTER TABLE public.chamados_workflow_reconcile_state
  ADD COLUMN IF NOT EXISTS cursor_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS cursor_ticket_id uuid;

-- 2) Hash SHA-256 portável. No Supabase o pgcrypto vive em `extensions`; em
--    PostgreSQL efêmero pode estar em `public`. O wrapper é IMMUTABLE e
--    schema-qualificado porque as funções abaixo usam search_path = ''.
DO $chamados_workflow_hash$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'extensions' AND p.proname = 'digest'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.chamados_workflow_sha256_hex(p_text text)
      RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $body$
        SELECT encode(extensions.digest(convert_to(p_text, 'UTF8'), 'sha256'), 'hex')
      $body$
    $fn$;
  ELSE
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgcrypto';
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.chamados_workflow_sha256_hex(p_text text)
      RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $body$
        SELECT encode(public.digest(convert_to(p_text, 'UTF8'), 'sha256'), 'hex')
      $body$
    $fn$;
  END IF;
END;
$chamados_workflow_hash$;

REVOKE ALL ON FUNCTION public.chamados_workflow_sha256_hex(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chamados_workflow_sha256_hex(text) TO service_role;

-- 3) Seleção priorizada e paginada. O cycle_key é reconstruído em SQL com a
--    MESMA normalização de `chamados_workflow.cycle_key` (UTC + microsegundos
--    + JSON ordenado), então a comparação com a outbox é exata por ticket+ciclo.
--    Sequência: os 20 primeiros do tick N são excluídos no tick N+1, permitindo
--    que os próximos apareçam mesmo que os primeiros já tenham agendamento.
CREATE OR REPLACE FUNCTION public.chamados_workflow_outbox_reconcile_candidates(
  p_lookback_minutes integer DEFAULT 1440,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  ticket_id uuid,
  workspace_id uuid,
  status text,
  assigned_to_user_id text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_cutoff timestamptz;
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_last_at timestamptz;
  v_last_id uuid;
  v_row record;
BEGIN
  v_cutoff := clock_timestamp()
    - make_interval(mins => least(greatest(coalesce(p_lookback_minutes, 1440), 1), 10080));

  SELECT cursor_updated_at, cursor_ticket_id
  INTO v_cursor_at, v_cursor_id
  FROM public.chamados_workflow_reconcile_state
  WHERE singleton;

  -- Cursor fora da janela atual: recomeça pelo chamado mais recente.
  IF v_cursor_at IS NULL OR v_cursor_at < v_cutoff THEN
    v_cursor_at := NULL;
    v_cursor_id := NULL;
  END IF;

  FOR v_row IN
    WITH candidatos AS (
      SELECT t.id AS ticket_id,
             t."workspace_id" AS workspace_id,
             t.status AS status,
             coalesce(t."assignedToUserId", '') AS assigned_to_user_id,
             t."updatedAt" AS updated_at,
             public.chamados_workflow_sha256_hex(
               t.id::text || ':' || t."workspace_id"::text || ':'
               || to_char(
                    t."updatedAt" AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"'
                  )
               || ':{"assignedToUserId": "", "status": "aberto"}'
             ) AS cycle_key
      FROM public.chamados_tickets AS t
      WHERE t.status = 'aberto'
        AND coalesce(t."assignedToUserId", '') = ''
        AND t."updatedAt" >= v_cutoff
    )
    SELECT c.ticket_id, c.workspace_id, c.status, c.assigned_to_user_id, c.updated_at
    FROM candidatos AS c
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.chamados_workflow_outbox AS o
      WHERE o.ticket_id = c.ticket_id
        AND o.cycle_key = c.cycle_key
    )
      AND (
        v_cursor_at IS NULL
        OR (c.updated_at, c.ticket_id) < (v_cursor_at, v_cursor_id)
      )
    ORDER BY c.updated_at DESC, c.ticket_id DESC
    LIMIT v_limit
  LOOP
    v_last_at := v_row.updated_at;
    v_last_id := v_row.ticket_id;
    RETURN NEXT v_row;
  END LOOP;

  UPDATE public.chamados_workflow_reconcile_state
  SET cursor_updated_at = coalesce(v_last_at, clock_timestamp()),
      cursor_ticket_id = v_last_id
  WHERE singleton;
END;
$$;

REVOKE ALL ON FUNCTION public.chamados_workflow_outbox_reconcile_candidates(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chamados_workflow_outbox_reconcile_candidates(integer, integer)
  TO service_role;
