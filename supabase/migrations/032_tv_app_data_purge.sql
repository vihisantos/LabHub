-- =============================================================================
-- 032_tv_app_data_purge.sql
-- =============================================================================
-- PR 5 — Purge seguro dos dados de conteúdo da TV Corporativa, com backup
-- obrigatório (app_data_backups) e auditoria (workspace_audit_logs).
--
-- O QUE MUDA:
--   1. app_data_backups ganha expires_at (TTL de 2 dias, mesmo padrão da
--      workspace_backups da 021). Backfill para linhas já existentes.
--   2. workspace_audit_logs ganha details jsonb (contagens/backup_id do purge;
--      inserts antigos continuam válidos — coluna opcional).
--   3. describe_tv_app_data(p_workspace): contagens reais por tabela,
--      escopo explícito no workspace.
--   4. purge_tv_app_data(p_workspace, ...): UMA função = UMA transação:
--        advisory lock (serializa purges concorrentes)
--        → contagens → montagem do payload de backup → guarda de tamanho
--        → INSERT em app_data_backups → DELETEs em ordem FK-segura
--        → INSERT em workspace_audit_logs
--      Qualquer erro ⇒ ROLLBACK total: nunca existe purge parcial sem backup,
--      nem backup órfão dizendo que dados foram removidos.
--
-- ESCOPO DO PURGE (somente conteúdo TV):
--   tv_events, tv_playlists, tv_announcements, tv_galleries,
--   tv_gallery_photos (sem workspace_id — alcançada via pai tv_galleries),
--   tv_music_queues, tv_music_tracks, tv_urgent_announcements,
--   tv_calendar_cache.
--
-- NUNCA TOCA: tv_devices, tv_activation_codes, tv_music_requests,
--   workspace_app_settings, app_data_backups, workspace_audit_logs,
--   linhas de outros workspaces ou linhas com workspace_id IS NULL
--   (NULL ≠ "todos": predicates são sempre `workspace_id = p_workspace`).
--
-- PERMISSÃO SQL: EXECUTE somente para service_role. A autorização HTTP
--   (@require_auth/@require_workspace + gate de admin espelhando
--   can_manage_workspace_apps da 031) vive na API Flask; aqui o isolamento é
--   garantido pelos predicates explícitos — RLS NÃO é a barreira deste fluxo
--   (service_role faz bypass).
--
-- TTL/cron: reaproveita o padrão da 021 — job pg_cron diário das 03:00 para
--   app_data_backups expirados; sem pg_cron, a limpeza fica a cargo do app.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. TTL dos backups de app data (mesmo padrão workspace_backups: 2 dias)
-- -----------------------------------------------------------------------------

ALTER TABLE public.app_data_backups
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE public.app_data_backups
SET expires_at = created_at + interval '2 days'
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_app_data_backups_expires
  ON public.app_data_backups (expires_at);

COMMENT ON COLUMN public.app_data_backups.expires_at IS
  'Retention deadline (2 days after creation, matching workspace_backups). '
  'Purged by the daily pg_cron job below / by the app.';

-- -----------------------------------------------------------------------------
-- 2. Detalhes estruturados na auditoria existente
-- -----------------------------------------------------------------------------

ALTER TABLE public.workspace_audit_logs
  ADD COLUMN IF NOT EXISTS details jsonb;

COMMENT ON COLUMN public.workspace_audit_logs.details IS
  'Optional structured payload for richer actions (e.g. purge_app_data: '
  '{app, tables:{...}, total, backup_id, result}). Legacy rows stay NULL.';

-- -----------------------------------------------------------------------------
-- 3. Describe: contagens reais por tabela, sempre workspace-scoped
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.describe_tv_app_data(p_workspace uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_workspace IS NULL THEN
    RAISE EXCEPTION 'WORKSPACE_REQUIRED';
  END IF;

  SELECT jsonb_build_object(
    'tv_events',               (SELECT count(*) FROM tv_events WHERE workspace_id = p_workspace),
    'tv_playlists',            (SELECT count(*) FROM tv_playlists WHERE workspace_id = p_workspace),
    'tv_announcements',        (SELECT count(*) FROM tv_announcements WHERE workspace_id = p_workspace),
    'tv_galleries',            (SELECT count(*) FROM tv_galleries WHERE workspace_id = p_workspace),
    'tv_gallery_photos',       (
      SELECT count(*) FROM tv_gallery_photos p
      JOIN tv_galleries g ON g.id = p.gallery_id
      WHERE g.workspace_id = p_workspace
    ),
    'tv_music_queues',         (SELECT count(*) FROM tv_music_queues WHERE workspace_id = p_workspace),
    'tv_music_tracks',         (
      SELECT count(*) FROM tv_music_tracks t
      JOIN tv_music_queues q ON q.id = t.queue_id
      WHERE q.workspace_id = p_workspace
    ),
    'tv_urgent_announcements', (SELECT count(*) FROM tv_urgent_announcements WHERE workspace_id = p_workspace),
    'tv_calendar_cache',       (SELECT count(*) FROM tv_calendar_cache WHERE workspace_id = p_workspace)
  )
  INTO v_result;

  RETURN jsonb_build_object('tables', v_result, 'total',
    (SELECT COALESCE(SUM(v::numeric), 0) FROM jsonb_each_text(v_result)));
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Purge atômico: backup → deletes → audit numa única transação
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_tv_app_data(
  p_workspace  uuid,
  p_actor_id   uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_max_rows   integer DEFAULT 50000,
  p_max_bytes  integer DEFAULT 33554432  -- 32 MB
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload    jsonb;
  v_total      integer;
  v_backup_id  uuid;
  v_audit_id   uuid;
  v_expires_at timestamptz;
  v_deleted    jsonb := '{}'::jsonb;
  v_ws_name    text;
  v_rows       integer := 0;
BEGIN
  IF p_workspace IS NULL THEN
    RAISE EXCEPTION 'WORKSPACE_REQUIRED';
  END IF;

  -- Serializa purges concorrentes do mesmo workspace (liberada no fim da tx).
  PERFORM pg_advisory_xact_lock(hashtextextended('app_data_purge:' || p_workspace::text, 0));

  SELECT name INTO v_ws_name FROM workspaces WHERE id = p_workspace;
  IF v_ws_name IS NULL THEN
    RAISE EXCEPTION 'WORKSPACE_NOT_FOUND';
  END IF;

  -- ── 4.1 Contagens + snapshot completo (ANTES de qualquer delete) ──────────
  SELECT jsonb_build_object(
    'tv_events',               (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM tv_events t WHERE t.workspace_id = p_workspace),
    'tv_playlists',            (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM tv_playlists t WHERE t.workspace_id = p_workspace),
    'tv_announcements',        (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM tv_announcements t WHERE t.workspace_id = p_workspace),
    'tv_galleries',            (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM tv_galleries t WHERE t.workspace_id = p_workspace),
    'tv_gallery_photos',       (
      SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM tv_gallery_photos p
      JOIN tv_galleries g ON g.id = p.gallery_id
      WHERE g.workspace_id = p_workspace
    ),
    'tv_music_queues',         (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM tv_music_queues t WHERE t.workspace_id = p_workspace),
    'tv_music_tracks',         (
      SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM tv_music_tracks t
      JOIN tv_music_queues q ON q.id = t.queue_id
      WHERE q.workspace_id = p_workspace
    ),
    'tv_urgent_announcements', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM tv_urgent_announcements t WHERE t.workspace_id = p_workspace),
    'tv_calendar_cache',       (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM tv_calendar_cache t WHERE t.workspace_id = p_workspace)
  ) INTO v_payload;

  SELECT COALESCE(SUM((value)::text::bigint), 0)::integer INTO v_total
  FROM jsonb_each_text(v_payload);

  -- Workspace sem dados: nada destrutivo a fazer (idempotente, sem ruído).
  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'result', 'empty',
      'backupId', NULL,
      'auditId', NULL,
      'deleted', '{}'::jsonb,
      'totalDeleted', 0
    );
  END IF;

  -- ── 4.2 Guardas de tamanho: aborta ANTES de apagar qualquer coisa ─────────
  IF v_total > p_max_rows THEN
    RAISE EXCEPTION 'APP_DATA_BACKUP_TOO_LARGE_ROWS';
  END IF;
  IF octet_length(v_payload::text) > p_max_bytes THEN
    RAISE EXCEPTION 'APP_DATA_BACKUP_TOO_LARGE_BYTES';
  END IF;

  -- ── 4.3 Backup obrigatório (mesma transação dos deletes) ──────────────────
  v_expires_at := now() + interval '2 days';

  INSERT INTO app_data_backups (workspace_id, app_id, payload, row_count, reason, created_by, expires_at)
  VALUES (p_workspace, 'tv', v_payload, v_total, 'pre_purge', p_actor_id, v_expires_at)
  RETURNING id INTO v_backup_id;

  IF v_backup_id IS NULL THEN
    RAISE EXCEPTION 'BACKUP_FAILED';
  END IF;

  -- ── 4.4 Deletes em ordem FK-segura, mesmos predicates do snapshot ──────────
  -- Filha sem workspace_id (fotos): seleção parte do pai workspace-scoped.
  DELETE FROM tv_gallery_photos p
  USING tv_galleries g
  WHERE p.gallery_id = g.id AND g.workspace_id = p_workspace;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_deleted := jsonb_build_object('tv_gallery_photos', v_rows);

  DELETE FROM tv_music_tracks t
  USING tv_music_queues q
  WHERE t.queue_id = q.id AND q.workspace_id = p_workspace;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('tv_music_tracks', v_rows);

  DELETE FROM tv_events WHERE workspace_id = p_workspace;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('tv_events', v_rows);

  DELETE FROM tv_playlists WHERE workspace_id = p_workspace;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('tv_playlists', v_rows);

  DELETE FROM tv_announcements WHERE workspace_id = p_workspace;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('tv_announcements', v_rows);

  DELETE FROM tv_music_queues WHERE workspace_id = p_workspace;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('tv_music_queues', v_rows);

  DELETE FROM tv_galleries WHERE workspace_id = p_workspace;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('tv_galleries', v_rows);

  DELETE FROM tv_calendar_cache WHERE workspace_id = p_workspace;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('tv_calendar_cache', v_rows);

  DELETE FROM tv_urgent_announcements WHERE workspace_id = p_workspace;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('tv_urgent_announcements', v_rows);

  -- ── 4.5 Auditoria (falhar aqui derruba a transação inteira: sem audit,
  --       sem purge) ──────────────────────────────────────────────────────────
  INSERT INTO workspace_audit_logs
    (action, workspace_id, workspace_name, actor_id, actor_name, details)
  VALUES
    ('purge_app_data', p_workspace, v_ws_name, p_actor_id, p_actor_name,
     jsonb_build_object(
       'app', 'tv',
       'tables', v_deleted,
       'total', (SELECT SUM((value)::text::bigint)::integer FROM jsonb_each_text(v_deleted)),
       'backup_id', v_backup_id,
       'result', 'success'
     ))
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'result', 'purged',
    'backupId', v_backup_id,
    'backupExpiresAt', v_expires_at,
    'auditId', v_audit_id,
    'deleted', v_deleted,
    'totalDeleted', (SELECT SUM((value)::text::bigint)::integer FROM jsonb_each_text(v_deleted))
  );
END;
$$;

-- Somente service_role executa o purge/describe (a API Flask decide QUANDO).
REVOKE ALL ON FUNCTION public.describe_tv_app_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.describe_tv_app_data(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.purge_tv_app_data(uuid, uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_tv_app_data(uuid, uuid, text, integer, integer)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 5. Limpeza diária dos backups expirados (mesmo padrão da 021 para
--    workspace_backups; sem pg_cron, o app pode podar manualmente)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  PERFORM cron.unschedule('clean-expired-app-data-backups');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job ainda não existe
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'clean-expired-app-data-backups',
    '30 3 * * *',
    $del$ DELETE FROM app_data_backups WHERE expires_at < now(); $del$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron nao disponivel: limpeza de app_data_backups ficara a cargo do app.';
END $$;

COMMIT;

-- =============================================================================
-- VERIFICAÇÃO PÓS-APLICAÇÃO:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='app_data_backups' AND column_name='expires_at';  -> 1 linha
--   SELECT proacl FROM pg_proc WHERE proname IN
--     ('describe_tv_app_data','purge_tv_app_data');  -> somente service_role
--   SELECT * FROM cron.job WHERE jobname='clean-expired-app-data-backups';
-- =============================================================================