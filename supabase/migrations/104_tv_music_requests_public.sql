-- ===============================================================================
-- 104 — TV CORPORATIVA: PEDIDOS PÚBLICOS VIA QR (FASE 4)
-- ===============================================================================
-- Preflight de duplicatas: a criação do índice único de deduplicação
-- (tv_music_requests_pending_dedupe_idx) falharia com mensagem críptica
-- ("could not create unique index") se já existirem pedidos pendentes do
-- mesmo vídeo na mesma unidade. O bloco "Preflight" abaixo ABORTA a
-- migration com diagnóstico acionável ANTES de qualquer mutação — a
-- resolução (qual registro preservar/aprovar/rejeitar) é decisão
-- OPERACIONAL manual; nada é apagado ou alterado automaticamente.
--
-- Diagnóstico (SELECT apenas; funciona ANTES e DEPOIS desta migration —
-- não referencia colunas introduzidas aqui, pois após um preflight falho
-- a transação reverte e as colunas novas não existem):
--   SELECT r.workspace_id, w.name AS unidade, r.youtube_video_id,
--          count(*) AS pendentes,
--          min(r.created_at) AS mais_antigo, max(r.created_at) AS mais_recente,
--          array_agg(r.id ORDER BY r.created_at) AS ids
--     FROM public.tv_music_requests r
--     LEFT JOIN public.workspaces w ON w.id = r.workspace_id
--    WHERE r.status = 'pending'
--      AND r.workspace_id IS NOT NULL AND r.youtube_video_id IS NOT NULL
--    GROUP BY r.workspace_id, w.name, r.youtube_video_id
--   HAVING count(*) > 1
--    ORDER BY pendentes DESC;
--
-- A migration é transacional: qualquer falha (incluindo o preflight)
-- reverte TUDO (ROLLBACK completo).
-- ===============================================================================
BEGIN;

-- (1) requested_by passa a NULLABLE (pedido anônimo só via QR)
ALTER TABLE public.tv_music_requests
  ALTER COLUMN requested_by DROP NOT NULL;

-- (2) Novas colunas
ALTER TABLE public.tv_music_requests
  ADD COLUMN IF NOT EXISTS requester_name text;
ALTER TABLE public.tv_music_requests
  ADD COLUMN IF NOT EXISTS ip_hash text;
ALTER TABLE public.tv_music_requests
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'admin';

-- backfill seguro de linhas antigas
UPDATE public.tv_music_requests
   SET source = COALESCE(source, 'admin')
 WHERE source IS NULL;

ALTER TABLE public.tv_music_requests
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN source SET DEFAULT 'admin';

DO $$ BEGIN
  ALTER TABLE public.tv_music_requests
    ADD CONSTRAINT tv_music_requests_source_check
    CHECK (source IN ('admin','qr'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.tv_music_requests
    ADD CONSTRAINT tv_music_requests_requester_name_length
    CHECK (requester_name IS NULL OR char_length(requester_name) <= 30);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.tv_music_requests
    ADD CONSTRAINT tv_music_requests_anon_only_qr
    CHECK (requested_by IS NOT NULL OR source = 'qr');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- (3) Índices
-- (3.1) Preflight fail-closed: espelha a semântica do índice único abaixo
-- (NULLS DISTINCT — linhas com workspace_id ou youtube_video_id NULL nunca
-- colidem, portanto ficam fora do diagnóstico). Se houver duplicatas, aborta
-- com ERRCODE 'P0001' e amostra dos grupos; nada é criado (ROLLBACK).
DO $$
DECLARE
  v_groups integer;
  v_sample text;
BEGIN
  -- Contagem TOTAL de grupos duplicados (sem LIMIT) + amostra de até 20 para exibição.
  -- O LIMIT 20 se aplica apenas à amostra (string_agg), nunca à contagem total.
  -- A contagem total vem de total_groups (sempre uma linha); a amostra é anexada
  -- via LEFT JOIN LATERAL para que, sem duplicatas, a consulta ainda retorne
  -- v_groups = 0 e v_sample = NULL em vez de eliminar a linha externa.
  WITH dup_groups AS (
    SELECT r.workspace_id, r.youtube_video_id, count(*) AS n
      FROM public.tv_music_requests r
     WHERE r.status = 'pending'
       AND r.workspace_id IS NOT NULL
       AND r.youtube_video_id IS NOT NULL
     GROUP BY r.workspace_id, r.youtube_video_id
    HAVING count(*) > 1
  ),
  total_groups AS (
    SELECT count(*) AS total FROM dup_groups
  )
  SELECT t.total,
         coalesce(string_agg(
           format('%s | vídeo=%s | pendentes=%s', d.workspace_id, d.youtube_video_id, d.n),
           E'\n' ORDER BY d.n DESC, d.workspace_id, d.youtube_video_id), '')
    INTO v_groups, v_sample
    FROM total_groups t
    LEFT JOIN LATERAL (
      SELECT workspace_id, youtube_video_id, n
        FROM dup_groups
       ORDER BY n DESC, workspace_id, youtube_video_id
       LIMIT 20
    ) d ON true
   GROUP BY t.total;

  IF v_groups > 0 THEN
    RAISE EXCEPTION
      'TV_MUSIC_REQUESTS_PENDING_DUPLICATES: % grupo(s) de pedidos pendentes duplicados (workspace_id, youtube_video_id) impedem o índice único; amostra:%',
      v_groups, chr(10) || v_sample
      USING
        ERRCODE = 'P0001',
        HINT = 'Resolva MANUALMENTE (aprovar/rejeitar/manter um registro por grupo — decisão de negócio) e reaplique a migration. Nenhum dado foi alterado (ROLLBACK). Diagnóstico completo no cabeçalho deste arquivo.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tv_music_requests_pending_dedupe_idx
  ON public.tv_music_requests (workspace_id, youtube_video_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS tv_music_requests_workspace_status_idx
  ON public.tv_music_requests (workspace_id, status);

-- Policy de INSERT existente (auth.uid() = requested_by) é MANTIDA intencionalmente:
-- inserts anon/diretos continuam proibidos; gravação pública ocorre via service_role
-- no backend.

COMMIT;