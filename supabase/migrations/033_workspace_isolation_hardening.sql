-- =============================================================================
-- 033: Workspace Isolation Hardening
-- Corrige a falha estrutural de isolamento por workspace.
--
-- Problema:
--   user_belongs_to_workspace(NULL) retorna true, transformando NULL em
--   "workspace global" acidental. Qualquer registro com workspace_id = NULL
--   é visível por TODOS os usuários autenticados.
--
-- Solução:
--   1. Corrigir user_belongs_to_workspace() para tratar NULL como negação.
--   2. Corrigir can_access_tv_workspace() para tratar NULL como negação.
--   3. Adicionar NOT NULL em todas as tabelas workspace-scoped.
--   4. DELETE registros existentes com NULL (lixo legado sem dono).
--   5. Corrigir tv_music_requests USING(true) → workspace-scoped.
--   6. Corrigir pcare.assets USING(true) → workspace-scoped.
--
-- Exceções (mantêm NULL permitido):
--   - stock.notifications: global por design (approval, system).
--   - workspace_backups, workspace_audit_logs: service_role only, sem RLS.
--   - tv_music_tracks, tv_gallery_photos: filhas via JOIN (sem workspace_id).
-- =============================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- FASE 4: Corrigir user_belongs_to_workspace()
-- NULL → false, '' → false
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ws_id IS NOT NULL
      AND ws_id <> ''
      AND ws_id IN (
        SELECT unnest(workspace_ids)::text
        FROM public.profiles
        WHERE id = auth.uid()
      )
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ws_id IS NOT NULL
      AND ws_id::text IN (
        SELECT unnest(workspace_ids)::text
        FROM public.profiles
        WHERE id = auth.uid()
      )
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- FASE 4b: Corrigir can_access_tv_workspace()
-- ════════════════════════════════════════════════════════════════════════════

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

-- ════════════════════════════════════════════════════════════════════════════
-- FASE 3+5: DELETE NULLs + NOT NULL
-- Registros NULL = legado sem dono. DELETE é seguro porque:
--   - Frontend sempre passa workspace_id (createLocalService auto-stamps)
--   - Backend sempre passa workspace_id (via g.workspace_id)
-- ════════════════════════════════════════════════════════════════════════════

DELETE FROM public.tv_events WHERE workspace_id IS NULL;
DELETE FROM public.tv_playlists WHERE workspace_id IS NULL;
DELETE FROM public.tv_music_queues WHERE workspace_id IS NULL;
DELETE FROM public.tv_announcements WHERE workspace_id IS NULL;
DELETE FROM public.tv_galleries WHERE workspace_id IS NULL;
DELETE FROM public.tv_calendar_cache WHERE workspace_id IS NULL;
DELETE FROM public.tv_urgent_announcements WHERE workspace_id IS NULL;
DELETE FROM public.tv_devices WHERE workspace_id IS NULL;
DELETE FROM public.tv_music_requests WHERE workspace_id IS NULL;
DELETE FROM public.chamados_tickets WHERE workspace_id IS NULL;
DELETE FROM public.ticket_events WHERE workspace_id IS NULL;
DELETE FROM public.tablet_reservations WHERE workspace_id IS NULL;
DELETE FROM stock.stock_items WHERE workspace_id IS NULL;
DELETE FROM stock.stock_movements WHERE workspace_id IS NULL;
DELETE FROM stock.stock_kits WHERE workspace_id IS NULL;
DELETE FROM stock.stock_maintenance WHERE workspace_id IS NULL;
DELETE FROM stock.stock_inventory_cycles WHERE workspace_id IS NULL;
DELETE FROM stock.stock_inventory_counts WHERE workspace_id IS NULL;
DELETE FROM stock.stock_photos WHERE workspace_id IS NULL;
DELETE FROM pcare.assets WHERE workspace_id IS NULL;
DELETE FROM pcare.pcs WHERE workspace_id IS NULL;
DELETE FROM pcare.parts WHERE workspace_id IS NULL;
DELETE FROM pcare.maintenance WHERE workspace_id IS NULL;
DELETE FROM pcare.part_usage WHERE workspace_id IS NULL;
DELETE FROM pcare.checklist_templates WHERE workspace_id IS NULL;
DELETE FROM pcare.pc_checklists WHERE workspace_id IS NULL;
DELETE FROM pcare.action_logs WHERE workspace_id IS NULL;

-- Public schema — NOT NULL
ALTER TABLE public.tv_events ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_playlists ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_music_queues ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_announcements ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_galleries ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_calendar_cache ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_urgent_announcements ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_devices ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tv_music_requests ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.chamados_tickets ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.ticket_events ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tablet_reservations ALTER COLUMN workspace_id SET NOT NULL;

-- Stock schema — NOT NULL
ALTER TABLE stock.stock_items ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE stock.stock_movements ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE stock.stock_kits ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE stock.stock_maintenance ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE stock.stock_inventory_cycles ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE stock.stock_inventory_counts ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE stock.stock_photos ALTER COLUMN workspace_id SET NOT NULL;

-- Pcare schema — NOT NULL
ALTER TABLE pcare.assets ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE pcare.pcs ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE pcare.parts ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE pcare.maintenance ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE pcare.part_usage ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE pcare.checklist_templates ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE pcare.pc_checklists ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE pcare.action_logs ALTER COLUMN workspace_id SET NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- FASE 6: Corrigir RLS policies
-- ════════════════════════════════════════════════════════════════════════════

-- tv_music_requests: substituir USING(true)
DROP POLICY IF EXISTS "tv_music_requests_select" ON public.tv_music_requests;

CREATE POLICY "tv_music_requests_select"
  ON public.tv_music_requests FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

-- pcare.assets: remover policy legada assets_all + criar policies workspace-scoped
DROP POLICY IF EXISTS "assets_all" ON pcare.assets;
DROP POLICY IF EXISTS "pcare_assets_select" ON pcare.assets;
DROP POLICY IF EXISTS "pcare_assets_insert" ON pcare.assets;
DROP POLICY IF EXISTS "pcare_assets_update" ON pcare.assets;
DROP POLICY IF EXISTS "pcare_assets_delete" ON pcare.assets;

CREATE POLICY "pcare_assets_select"
  ON pcare.assets FOR SELECT
  USING (is_super_admin() OR user_belongs_to_workspace(workspace_id));

CREATE POLICY "pcare_assets_insert"
  ON pcare.assets FOR INSERT
  WITH CHECK (is_super_admin() OR user_belongs_to_workspace(workspace_id));

CREATE POLICY "pcare_assets_update"
  ON pcare.assets FOR UPDATE
  USING (is_super_admin() OR user_belongs_to_workspace(workspace_id))
  WITH CHECK (is_super_admin() OR user_belongs_to_workspace(workspace_id));

CREATE POLICY "pcare_assets_delete"
  ON pcare.assets FOR DELETE
  USING (is_super_admin());

-- stock.notifications: recriar policies (mantém NULL permitido para global)
DROP POLICY IF EXISTS "notifications_select" ON stock.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON stock.notifications;
DROP POLICY IF EXISTS "notifications_update" ON stock.notifications;
DROP POLICY IF EXISTS "notifications_delete" ON stock.notifications;

CREATE POLICY "notifications_select"
  ON stock.notifications FOR SELECT
  USING (is_super_admin() OR user_belongs_to_workspace(workspace_id));

CREATE POLICY "notifications_insert"
  ON stock.notifications FOR INSERT
  WITH CHECK (is_super_admin() OR user_belongs_to_workspace(workspace_id));

CREATE POLICY "notifications_update"
  ON stock.notifications FOR UPDATE
  USING (is_super_admin() OR user_belongs_to_workspace(workspace_id))
  WITH CHECK (is_super_admin() OR user_belongs_to_workspace(workspace_id));

CREATE POLICY "notifications_delete"
  ON stock.notifications FOR DELETE
  USING (is_super_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- FUNÇÃO AUXILIAR: smoke test pós-migration
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.workspace_has_null_records()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'tv_events',               (SELECT count(*) FROM public.tv_events WHERE workspace_id IS NULL),
    'tv_playlists',            (SELECT count(*) FROM public.tv_playlists WHERE workspace_id IS NULL),
    'tv_music_queues',         (SELECT count(*) FROM public.tv_music_queues WHERE workspace_id IS NULL),
    'tv_announcements',        (SELECT count(*) FROM public.tv_announcements WHERE workspace_id IS NULL),
    'tv_galleries',            (SELECT count(*) FROM public.tv_galleries WHERE workspace_id IS NULL),
    'tv_calendar_cache',       (SELECT count(*) FROM public.tv_calendar_cache WHERE workspace_id IS NULL),
    'tv_urgent_announcements', (SELECT count(*) FROM public.tv_urgent_announcements WHERE workspace_id IS NULL),
    'tv_devices',              (SELECT count(*) FROM public.tv_devices WHERE workspace_id IS NULL),
    'tv_music_requests',       (SELECT count(*) FROM public.tv_music_requests WHERE workspace_id IS NULL),
    'chamados_tickets',        (SELECT count(*) FROM public.chamados_tickets WHERE workspace_id IS NULL),
    'ticket_events',           (SELECT count(*) FROM public.ticket_events WHERE workspace_id IS NULL),
    'tablet_reservations',     (SELECT count(*) FROM public.tablet_reservations WHERE workspace_id IS NULL),
    'stock_items',             (SELECT count(*) FROM stock.stock_items WHERE workspace_id IS NULL),
    'stock_movements',         (SELECT count(*) FROM stock.stock_movements WHERE workspace_id IS NULL),
    'stock_kits',              (SELECT count(*) FROM stock.stock_kits WHERE workspace_id IS NULL),
    'stock_maintenance',       (SELECT count(*) FROM stock.stock_maintenance WHERE workspace_id IS NULL),
    'stock_inventory_cycles',  (SELECT count(*) FROM stock.stock_inventory_cycles WHERE workspace_id IS NULL),
    'stock_inventory_counts',  (SELECT count(*) FROM stock.stock_inventory_counts WHERE workspace_id IS NULL),
    'stock_photos',            (SELECT count(*) FROM stock.stock_photos WHERE workspace_id IS NULL),
    'pcare_assets',            (SELECT count(*) FROM pcare.assets WHERE workspace_id IS NULL),
    'pcare_pcs',                (SELECT count(*) FROM pcare.pcs WHERE workspace_id IS NULL),
    'pcare_parts',             (SELECT count(*) FROM pcare.parts WHERE workspace_id IS NULL),
    'pcare_maintenance',       (SELECT count(*) FROM pcare.maintenance WHERE workspace_id IS NULL),
    'pcare_part_usage',        (SELECT count(*) FROM pcare.part_usage WHERE workspace_id IS NULL),
    'pcare_checklist_templates',(SELECT count(*) FROM pcare.checklist_templates WHERE workspace_id IS NULL),
    'pcare_pc_checklists',     (SELECT count(*) FROM pcare.pc_checklists WHERE workspace_id IS NULL),
    'pcare_action_logs',       (SELECT count(*) FROM pcare.action_logs WHERE workspace_id IS NULL)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.workspace_has_null_records() FROM anon;
REVOKE EXECUTE ON FUNCTION public.workspace_has_null_records() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_has_null_records() TO service_role;
GRANT EXECUTE ON FUNCTION public.workspace_has_null_records() TO authenticated;

COMMIT;
