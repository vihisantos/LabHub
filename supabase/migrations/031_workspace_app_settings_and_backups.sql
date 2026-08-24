-- =============================================================================
-- 031_workspace_app_settings_and_backups.sql
-- =============================================================================
-- Foundation for the generic per-workspace app management architecture.
--
-- Tables:
--   workspace_app_settings : one JSONB config document per (workspace, app).
--                            Consumed by WorkspaceAppSheet (PR 3) and by apps
--                            that need configuration (e.g. TV source URL).
--   app_data_backups       : immutable audit trail of pre-purge snapshots.
--                            Written before any destructive "reset app data"
--                            operation. No UPDATE/DELETE policies on purpose:
--                            backups must not be editable or erasable by
--                            regular roles (service_role bypasses RLS when an
--                            operator truly needs cleanup).
--
-- Access model:
--   READ  (both tables):  is_super_admin() OR user_belongs_to_workspace(ws)
--                         (same pair used by all stock/pcare policies in 027)
--   WRITE (settings):     is_super_admin() OR (member AND profile.role='admin')
--                         (mirrors the workspace-management gate of migration
--                         009: configuring an app is workspace administration,
--                         not something every member or device session does)
--   WRITE (backups):      INSERT only, same gate as settings writes.
--   anon:                 fully revoked on both tables.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: who can configure apps inside a workspace?
-- SECURITY DEFINER avoids RLS recursion on profiles; search_path pinned.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_manage_workspace_apps(p_ws uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_ws IS NOT NULL AND (
    public.is_super_admin()
    OR (
      public.user_belongs_to_workspace(p_ws)
      AND EXISTS (
        SELECT 1 FROM public.profiles pr
        WHERE pr.id = auth.uid() AND pr.role = 'admin'
      )
    )
  )
$$;

COMMENT ON FUNCTION public.can_manage_workspace_apps(uuid) IS
  'True if the caller may configure apps (workspace_app_settings, purge flows) '
  'in the given workspace: super admins, or workspace members with the '
  'profile-level admin role. SECURITY DEFINER to avoid profiles RLS recursion.';

REVOKE EXECUTE ON FUNCTION public.can_manage_workspace_apps(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_workspace_apps(uuid) FROM PUBLIC;


-- -----------------------------------------------------------------------------
-- Table: workspace_app_settings
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_app_settings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  app_id       text NOT NULL,
  settings     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_app_settings_ws_app_key UNIQUE (workspace_id, app_id)
);

COMMENT ON TABLE public.workspace_app_settings IS
  'Per-workspace configuration document for each registered app (app_id keys '
  'the frontend appRegistry). One row per (workspace_id, app_id); upserted by '
  'WorkspaceAppSheet. Clients must set updated_at explicitly (no trigger, '
  'matching repo conventions).';

ALTER TABLE public.workspace_app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_app_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_app_settings_select" ON public.workspace_app_settings;
CREATE POLICY "workspace_app_settings_select"
  ON public.workspace_app_settings
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.user_belongs_to_workspace(workspace_id));

DROP POLICY IF EXISTS "workspace_app_settings_insert" ON public.workspace_app_settings;
CREATE POLICY "workspace_app_settings_insert"
  ON public.workspace_app_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace_apps(workspace_id));

DROP POLICY IF EXISTS "workspace_app_settings_update" ON public.workspace_app_settings;
CREATE POLICY "workspace_app_settings_update"
  ON public.workspace_app_settings
  FOR UPDATE TO authenticated
  USING (public.can_manage_workspace_apps(workspace_id))
  WITH CHECK (public.can_manage_workspace_apps(workspace_id));

DROP POLICY IF EXISTS "workspace_app_settings_delete" ON public.workspace_app_settings;
CREATE POLICY "workspace_app_settings_delete"
  ON public.workspace_app_settings
  FOR DELETE TO authenticated
  USING (public.can_manage_workspace_apps(workspace_id));

REVOKE ALL ON public.workspace_app_settings FROM anon;


-- -----------------------------------------------------------------------------
-- Table: app_data_backups
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_data_backups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  app_id       text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count    integer NOT NULL DEFAULT 0,
  reason       text NOT NULL DEFAULT 'pre_purge',
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_data_backups_ws_app
  ON public.app_data_backups (workspace_id, app_id);

COMMENT ON TABLE public.app_data_backups IS
  'Immutable snapshots taken before destructive app-data operations (purge / '
  'reset). payload holds the exported rows as JSON. Deliberately has no '
  'UPDATE or DELETE RLS policies: history must be append-only for non-service '
  'roles.';

ALTER TABLE public.app_data_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_data_backups FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_data_backups_select" ON public.app_data_backups;
CREATE POLICY "app_data_backups_select"
  ON public.app_data_backups
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.user_belongs_to_workspace(workspace_id));

DROP POLICY IF EXISTS "app_data_backups_insert" ON public.app_data_backups;
CREATE POLICY "app_data_backups_insert"
  ON public.app_data_backups
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace_apps(workspace_id));

-- Intentionally no UPDATE / DELETE policies: backups are append-only.

REVOKE ALL ON public.app_data_backups FROM anon;


-- -----------------------------------------------------------------------------
-- Verification checklist (run after applying):
--   SELECT tablename, relrowsecurity FROM pg_class c JOIN pg_tables t
--     ON c.relname = t.tablename WHERE t.schemaname='public'
--     AND t.tablename IN ('workspace_app_settings','app_data_backups');
--     -> both true
--   SELECT * FROM pg_policies WHERE schemaname='public'
--     AND tablename IN ('workspace_app_settings','app_data_backups')
--     ORDER BY tablename, policyname;
--     -> 4 policies on settings, exactly SELECT+INSERT on backups
--   SELECT has_table_privilege('anon','public.workspace_app_settings','SELECT'),
--          has_table_privilege('anon','public.app_data_backups','INSERT');
--     -> false, false
-- -----------------------------------------------------------------------------
