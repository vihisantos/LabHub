-- 115_chamados_workflow_outbox.sql
-- Outbox DEDICADA ao agendamento de Workflows de Chamados.
--
-- Esta tabela NÃO é a notification_outbox (113/114): aquela transporta eventos
-- de Push. Aqui gravamos apenas pedidos de agendamento no PostgreSQL, dentro
-- da mesma transação lógica da criação/reabertura do Chamado. O QStash é
-- publicado depois, por um dispatcher, com tentativas limitadas e backoff.
--
-- Nada é lido ou escrito na tabela de notificações. Todas as funções são
-- SECURITY INVOKER e acessíveis somente a service_role.

CREATE TABLE IF NOT EXISTS public.chamados_workflow_outbox (
  job_id          uuid PRIMARY KEY,
  ticket_id       uuid NOT NULL,
  workspace_id    uuid NOT NULL,
  cycle_key       text NOT NULL CHECK (cycle_key ~ '^[a-f0-9]{64}$'),
  dedup_key       text NOT NULL UNIQUE,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'publishing', 'published', 'dead')),
  attempts        integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  available_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  locked_by       text,
  lock_token      uuid,
  lock_expires_at timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  published_at    timestamptz
);

-- Fila de publicação: somente linhas vencidas, nunca uma varredura de chamados.
CREATE INDEX IF NOT EXISTS idx_chamados_workflow_outbox_due
  ON public.chamados_workflow_outbox (available_at, created_at)
  WHERE status IN ('pending', 'publishing');

-- Consulta de ciclo vigente (autoridade para Workflows antigos).
CREATE INDEX IF NOT EXISTS idx_chamados_workflow_outbox_scope
  ON public.chamados_workflow_outbox (ticket_id, workspace_id, created_at DESC, job_id DESC);

ALTER TABLE public.chamados_workflow_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chamados_workflow_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.chamados_workflow_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chamados_workflow_outbox TO service_role;

-- Idempotência por Chamado + ciclo. A primeira gravação vence e devolve o
-- job_id existente, para que tentativas repetidas reutilizem o mesmo dedup id
-- do QStash e não criem dois Workflows.
CREATE OR REPLACE FUNCTION public.chamados_workflow_outbox_enqueue(
  p_job_id uuid,
  p_ticket_id uuid,
  p_workspace_id uuid,
  p_cycle_key text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_dedup_key text;
  v_job_id uuid;
BEGIN
  IF p_job_id IS NULL OR p_ticket_id IS NULL OR p_workspace_id IS NULL
     OR p_cycle_key IS NULL OR p_cycle_key !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid chamados workflow outbox job';
  END IF;

  v_dedup_key := p_ticket_id::text || ':' || p_cycle_key;

  INSERT INTO public.chamados_workflow_outbox (job_id, ticket_id, workspace_id, cycle_key, dedup_key)
  VALUES (p_job_id, p_ticket_id, p_workspace_id, p_cycle_key, v_dedup_key)
  ON CONFLICT (dedup_key) DO NOTHING;

  SELECT o.job_id INTO v_job_id
  FROM public.chamados_workflow_outbox AS o
  WHERE o.dedup_key = v_dedup_key;

  RETURN v_job_id;
END;
$$;

-- Reserva um lote pequeno e exclusivo. Também recupera leases expirados de
-- publicações que morreram no meio do caminho. Nenhuma linha é apagada.
CREATE OR REPLACE FUNCTION public.chamados_workflow_outbox_claim(
  p_worker_id text,
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (
  job_id uuid,
  ticket_id uuid,
  workspace_id uuid,
  cycle_key text,
  attempts integer,
  lock_token uuid
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 25);
  v_lease integer := least(greatest(coalesce(p_lease_seconds, 120), 30), 600);
BEGIN
  UPDATE public.chamados_workflow_outbox AS o
  SET status = 'dead',
      locked_by = NULL,
      lock_token = NULL,
      lock_expires_at = NULL,
      last_error = left(coalesce(o.last_error, 'attempts exhausted'), 200),
      updated_at = clock_timestamp()
  WHERE o.status = 'publishing'
    AND o.lock_expires_at <= clock_timestamp()
    AND o.attempts >= 5;

  RETURN QUERY
  WITH picked AS (
    SELECT o.job_id
    FROM public.chamados_workflow_outbox AS o
    WHERE (o.status = 'pending' AND o.available_at <= clock_timestamp())
       OR (o.status = 'publishing' AND o.lock_expires_at <= clock_timestamp())
    ORDER BY o.available_at, o.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  )
  UPDATE public.chamados_workflow_outbox AS o
  SET status = 'publishing',
      attempts = o.attempts + 1,
      locked_by = left(coalesce(nullif(btrim(p_worker_id), ''), 'worker'), 128),
      lock_token = gen_random_uuid(),
      lock_expires_at = clock_timestamp() + make_interval(secs => v_lease),
      updated_at = clock_timestamp()
  FROM picked
  WHERE o.job_id = picked.job_id
  RETURNING o.job_id, o.ticket_id, o.workspace_id, o.cycle_key, o.attempts, o.lock_token;
END;
$$;

-- QStash aceitou a mensagem: encerra a fila deste ciclo.
CREATE OR REPLACE FUNCTION public.chamados_workflow_outbox_mark_published(
  p_job_id uuid,
  p_lock_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.chamados_workflow_outbox
  SET status = 'published',
      published_at = clock_timestamp(),
      locked_by = NULL,
      lock_token = NULL,
      lock_expires_at = NULL,
      last_error = NULL,
      updated_at = clock_timestamp()
  WHERE job_id = p_job_id
    AND status = 'publishing'
    AND lock_token = p_lock_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- Falha na publicação: devolve com backoff exponencial limitado ou marking
-- dead após 5 tentativas. `p_error` recebe somente a classe da exceção.
CREATE OR REPLACE FUNCTION public.chamados_workflow_outbox_release(
  p_job_id uuid,
  p_lock_token uuid,
  p_error text,
  p_delay_seconds integer DEFAULT 15
)
-- 'pending' = volta com backoff; 'dead' = esgotou tentativas; '' = token inválido.
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_row public.chamados_workflow_outbox%ROWTYPE;
  v_backoff integer;
BEGIN
  SELECT * INTO v_row
  FROM public.chamados_workflow_outbox
  WHERE job_id = p_job_id
    AND status = 'publishing'
    AND lock_token = p_lock_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN '';
  END IF;

  IF v_row.attempts >= 5 THEN
    UPDATE public.chamados_workflow_outbox
    SET status = 'dead',
        locked_by = NULL,
        lock_token = NULL,
        lock_expires_at = NULL,
        last_error = left(coalesce(p_error, 'publish failed'), 200),
        updated_at = clock_timestamp()
    WHERE job_id = p_job_id;
    RETURN 'dead';
  ELSE
    v_backoff := least(
      300,
      greatest(1, coalesce(p_delay_seconds, 15))
        * power(2, least(4, greatest(0, v_row.attempts - 1)))::integer
    );
    UPDATE public.chamados_workflow_outbox
    SET status = 'pending',
        available_at = clock_timestamp() + make_interval(secs => v_backoff),
        locked_by = NULL,
        lock_token = NULL,
        lock_expires_at = NULL,
        last_error = left(coalesce(p_error, 'publish failed'), 200),
        updated_at = clock_timestamp()
    WHERE job_id = p_job_id;
  END IF;

  RETURN 'pending';
END;
$$;

-- Ciclo vigente de um Chamado/workspace. Usado pelo Workflow para descartar
-- execuções antigas após reabertura, troca de responsável ou workspace.
CREATE OR REPLACE FUNCTION public.chamados_workflow_outbox_current(
  p_ticket_id uuid,
  p_workspace_id uuid
)
RETURNS uuid
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT o.job_id
  FROM public.chamados_workflow_outbox AS o
  WHERE o.ticket_id = p_ticket_id
    AND o.workspace_id = p_workspace_id
  ORDER BY o.created_at DESC, o.job_id DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.chamados_workflow_outbox_enqueue(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamados_workflow_outbox_claim(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamados_workflow_outbox_mark_published(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamados_workflow_outbox_release(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamados_workflow_outbox_current(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.chamados_workflow_outbox_enqueue(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.chamados_workflow_outbox_claim(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.chamados_workflow_outbox_mark_published(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.chamados_workflow_outbox_release(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.chamados_workflow_outbox_current(uuid, uuid) TO service_role;
