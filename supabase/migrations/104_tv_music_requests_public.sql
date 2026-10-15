-- ===============================================================================
-- 104 — TV CORPORATIVA: PEDIDOS PÚBLICOS VIA QR (FASE 4)
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
CREATE UNIQUE INDEX IF NOT EXISTS tv_music_requests_pending_dedupe_idx
  ON public.tv_music_requests (workspace_id, youtube_video_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS tv_music_requests_workspace_status_idx
  ON public.tv_music_requests (workspace_id, status);

-- Policy de INSERT existente (auth.uid() = requested_by) é MANTIDA intencionalmente:
-- inserts anon/diretos continuam proibidos; gravação pública ocorre via service_role
-- no backend.

COMMIT;