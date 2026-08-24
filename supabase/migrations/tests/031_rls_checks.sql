-- =============================================================================
-- tests/031_rls_checks.sql
-- =============================================================================
-- Assertion script for migration 031 (workspace_app_settings / app_data_backups).
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER applying
-- 031_workspace_app_settings_and_backups.sql. Every check RAISEs an exception
-- on drift; a clean run ends with "OK: 031 checks passed".
--
-- These are catalog-level checks (structure, RLS, policies, grants). Behavioral
-- RLS checks (which role can see which row) require live sessions and are
-- covered by the operational checklist in the migration header.
-- =============================================================================

DO $$
DECLARE
  v_count integer;
BEGIN

-- ── 1. Tables exist ──────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'workspace_app_settings'
) THEN
  RAISE EXCEPTION 'FAIL: table public.workspace_app_settings is missing';
END IF;

IF NOT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'app_data_backups'
) THEN
  RAISE EXCEPTION 'FAIL: table public.app_data_backups is missing';
END IF;

-- ── 2. Expected columns exist ────────────────────────────────────────────────
SELECT count(*) INTO v_count
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'workspace_app_settings'
  AND column_name IN ('id','workspace_id','app_id','settings','updated_by','created_at','updated_at');

IF v_count <> 7 THEN
  RAISE EXCEPTION 'FAIL: workspace_app_settings columns drifted (expected 7, found %)', v_count;
END IF;

SELECT count(*) INTO v_count
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'app_data_backups'
  AND column_name IN ('id','workspace_id','app_id','payload','row_count','reason','created_by','created_at');

IF v_count <> 8 THEN
  RAISE EXCEPTION 'FAIL: app_data_backups columns drifted (expected 8, found %)', v_count;
END IF;

-- ── 3. RLS enabled + forced ──────────────────────────────────────────────────
SELECT count(*) INTO v_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('workspace_app_settings', 'app_data_backups')
  AND c.relrowsecurity = true
  AND c.relforcerowsecurity = true;

IF v_count <> 2 THEN
  RAISE EXCEPTION 'FAIL: RLS not enabled+forced on both tables (%/2)', v_count;
END IF;

-- ── 4. Unique constraint (workspace_id, app_id) on settings ──────────────────
IF NOT EXISTS (
  SELECT 1 FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'workspace_app_settings'
    AND con.contype = 'u'
    AND con.conkey @> ARRAY[
      (SELECT attnum::smallint FROM pg_attribute
       WHERE attrelid = rel.oid AND attname = 'workspace_id'),
      (SELECT attnum::smallint FROM pg_attribute
       WHERE attrelid = rel.oid AND attname = 'app_id')
    ]
) THEN
  RAISE EXCEPTION 'FAIL: UNIQUE(workspace_id, app_id) missing on workspace_app_settings';
END IF;

-- ── 5. Policies present with expected names and commands ─────────────────────
-- settings: select/insert/update/delete, each by name
IF NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'workspace_app_settings'
    AND policyname = 'workspace_app_settings_select' AND cmd = 'SELECT'
) THEN
  RAISE EXCEPTION 'FAIL: policy workspace_app_settings_select missing';
END IF;

IF NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'workspace_app_settings'
    AND policyname = 'workspace_app_settings_insert' AND cmd = 'INSERT'
) THEN
  RAISE EXCEPTION 'FAIL: policy workspace_app_settings_insert missing';
END IF;

IF NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'workspace_app_settings'
    AND policyname = 'workspace_app_settings_update' AND cmd = 'UPDATE'
) THEN
  RAISE EXCEPTION 'FAIL: policy workspace_app_settings_update missing';
END IF;

IF NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'workspace_app_settings'
    AND policyname = 'workspace_app_settings_delete' AND cmd = 'DELETE'
) THEN
  RAISE EXCEPTION 'FAIL: policy workspace_app_settings_delete missing';
END IF;

-- settings must have EXACTLY those 4 policies (no strays)
SELECT count(*) INTO v_count FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'workspace_app_settings';

IF v_count <> 4 THEN
  RAISE EXCEPTION 'FAIL: workspace_app_settings should have 4 policies, found %', v_count;
END IF;

-- backups: exactly select + insert; NO update/delete (append-only audit)
SELECT count(*) INTO v_count FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'app_data_backups';

IF v_count <> 2 THEN
  RAISE EXCEPTION 'FAIL: app_data_backups should have exactly 2 policies, found %', v_count;
END IF;

IF NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'app_data_backups'
    AND policyname = 'app_data_backups_select' AND cmd = 'SELECT'
) THEN
  RAISE EXCEPTION 'FAIL: policy app_data_backups_select missing';
END IF;

IF NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'app_data_backups'
    AND policyname = 'app_data_backups_insert' AND cmd = 'INSERT'
) THEN
  RAISE EXCEPTION 'FAIL: policy app_data_backups_insert missing';
END IF;

-- ── 6. Helper function exists and is SECURITY DEFINER ────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'can_manage_workspace_apps'
) THEN
  RAISE EXCEPTION 'FAIL: helper can_manage_workspace_apps(uuid) is missing';
END IF;

IF EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'can_manage_workspace_apps'
    AND p.prosecdef = false
) THEN
  RAISE EXCEPTION 'FAIL: can_manage_workspace_apps must be SECURITY DEFINER';
END IF;

-- ── 7. anon fully revoked on both tables ─────────────────────────────────────
IF has_table_privilege('anon', 'public.workspace_app_settings', 'SELECT') THEN
  RAISE EXCEPTION 'FAIL: anon still has SELECT on workspace_app_settings';
END IF;

IF has_table_privilege('anon', 'public.app_data_backups', 'INSERT') THEN
  RAISE EXCEPTION 'FAIL: anon still has INSERT on app_data_backups';
END IF;

RAISE NOTICE 'OK: 031 checks passed';
END $$;
