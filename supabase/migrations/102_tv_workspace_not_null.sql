-- ===============================================================================
-- 102 — TV CORPORATIVA: REMOVER FALLBACK workspace_id IS NULL + NOT NULL
-- ===============================================================================
-- Diagnóstico (SELECT apenas; não altera dados):
--   SELECT 'tv_events' AS tbl, count(*) FILTER (WHERE workspace_id IS NULL) AS null_rows
--     FROM public.tv_events
--   UNION ALL SELECT 'tv_playlists', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_playlists
--   UNION ALL SELECT 'tv_music_queues', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_music_queues
--   UNION ALL SELECT 'tv_announcements', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_announcements
--   UNION ALL SELECT 'tv_galleries', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_galleries
--   UNION ALL SELECT 'tv_calendar_cache', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_calendar_cache
--   UNION ALL SELECT 'tv_urgent_announcements', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_urgent_announcements
--   UNION ALL SELECT 'tv_devices', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_devices
--   UNION ALL SELECT 'tv_music_requests', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_music_requests
--   UNION ALL SELECT 'tv_schedules', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_schedules
--   UNION ALL SELECT 'tv_station', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_station;
--
-- Regra de segurança:
--   a) Se existir qualquer linha NULL, a migration ABORTA (ROLLBACK) e reporta
--      as contagens. Nenhum dado é apagado; nenhuma alteração estrutural parcial.
--   b) Se não houver NULL, remove o fallback `workspace_id IS NULL` de
--      `can_access_tv_workspace` e adiciona NOT NULL nas tabelas de conteúdo.
--   Cautela: o fallback legado foi útil para bases antigas; depois desta
--   migration, todo conteúdo TV precisa estar vinculado a um workspace.
-- ===============================================================================

BEGIN;

DO $$
DECLARE
  v_counts text;
BEGIN
  SELECT string_agg(format('%s=%s', t.tbl, t.c), ', ')
    INTO v_counts
  FROM (
    SELECT 'tv_events' AS tbl, count(*) FILTER (WHERE workspace_id IS NULL) AS c FROM public.tv_events
    UNION ALL SELECT 'tv_playlists', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_playlists
    UNION ALL SELECT 'tv_music_queues', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_music_queues
    UNION ALL SELECT 'tv_announcements', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_announcements
    UNION ALL SELECT 'tv_galleries', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_galleries
    UNION ALL SELECT 'tv_calendar_cache', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_calendar_cache
    UNION ALL SELECT 'tv_urgent_announcements', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_urgent_announcements
    UNION ALL SELECT 'tv_devices', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_devices
    UNION ALL SELECT 'tv_music_requests', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_music_requests
    UNION ALL SELECT 'tv_schedules', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_schedules
    UNION ALL SELECT 'tv_station', count(*) FILTER (WHERE workspace_id IS NULL) FROM public.tv_station
  ) t
  WHERE t.c > 0;

  IF v_counts IS NOT NULL THEN
    RAISE EXCEPTION 'TV_WORKSPACE_NULL_ROWS_FOUND: %', v_counts
      USING ERRCODE = '23514';
  END IF;
END $$;

-- Remove fallback de workspace NULL (regra de visibilidade legada).
CREATE OR REPLACE FUNCTION public.can_access_tv_workspace(p_ws uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_ws IS NOT NULL
     AND (
       is_super_admin()
       OR user_belongs_to_workspace(p_ws)
       OR EXISTS (
         SELECT 1 FROM public.tv_devices d
         WHERE d.user_id = auth.uid() AND d.workspace_id = p_ws
       )
     )
$$;

-- NOT NULL nas tabelas de conteúdo (apenas se não houve aborto acima).
ALTER TABLE public.tv_events ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_playlists ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_music_queues ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_announcements ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_galleries ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_calendar_cache ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_urgent_announcements ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_devices ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_music_requests ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_schedules ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_station ALTER COLUMN workspace_id SET NOT NULL;

COMMIT;

-- ===============================================================================
-- VERIFICAÇÃO PÓS-APLICAÇÃO:
--   * A diag query acima deve retornar todas as contagens = 0.
--   * \d+ public.tv_events: workspace_id NOT NULL
--   * can_access_tv_workspace(NULL) deve retornar false.
-- ===============================================================================