-- =============================================================================
-- 028: Authorization Consolidation
--
-- Consolidates the authorization layer after the full security audit.
--
-- Objects addressed:
--   1. is_super_admin() function — authoritative version + REVOKE anon
--   2. workspaces.disabled_apps column — official migration
--   3. workspaces.color column — official migration
--   4. workspaces.lab_count column — official migration
--   5. profiles policies — role='admin' → is_super_admin()
--   6. workspaces policies — role='admin' → is_super_admin()
--   7. tablet_reservations — CREATE TABLE IF NOT EXISTS + RLS
--   8. TV tables — documented, USING(true) preserved for now
--   9. chamados — REVOKE documented (service_role only)
--
-- Safety:
--   - All CREATE statements use IF NOT EXISTS
--   - All DROP statements use IF EXISTS
--   - All policies are dropped before re-creation
--   - Existing data is never truncated or modified
--   - No frontend or backend code is changed
--
-- Fresh DB compatibility:
--   - is_super_admin() was already created in 024 as a prerequisite for that
--     migration's policies. This is the authoritative version (with REVOKE).
--   - tablet_reservations is created here (IF NOT EXISTS). Migration 011
--     guards its ALTER with a table-existence check.
--
-- Rollback: drop the function, revert policies to role='admin' versions.
-- =============================================================================


-- =============================================================================
-- 1. is_super_admin() — authoritative function definition
-- =============================================================================
-- First defined in migration 024 (prerequisite for assets policies).
-- This is the definitive version: same logic, plus REVOKE from anon
-- as defense-in-depth.
--
-- SECURITY DEFINER: avoids RLS recursion on profiles.
-- search_path = public: prevents search_path injection.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_super_admin FROM public.profiles p WHERE p.id = auth.uid()),
    false
  )
$$;

COMMENT ON FUNCTION public.is_super_admin() IS
  'Returns true if the authenticated user has is_super_admin = true on their profile. '
  'SECURITY DEFINER to avoid RLS recursion on profiles. '
  'First created in migration 024, authoritative version in 028.';

-- Defense-in-depth: anon should never call this function.
-- RLS policies only run for authenticated/service_role contexts,
-- but revoking anon prevents accidental or malicious direct calls.
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC;


-- =============================================================================
-- 2. workspaces — official columns (IF NOT EXISTS for production safety)
-- =============================================================================
-- disabled_apps, color, and lab_count exist in production but were never
-- version-controlled. These ALTER TABLE statements are safe to run on both
-- fresh and existing databases.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS disabled_apps JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '';

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS lab_count SMALLINT NOT NULL DEFAULT 2;

COMMENT ON COLUMN public.workspaces.disabled_apps IS
  'Array of disabled module IDs (e.g. ["tv","stock"]). Empty array = all enabled. '
  'Admin and Dashboard are always enabled (enforced by frontend apps.ts).';

COMMENT ON COLUMN public.workspaces.color IS
  'Display color for the workspace in the UI.';

COMMENT ON COLUMN public.workspaces.lab_count IS
  'Number of labs available at this campus for ReservaLab.';


-- =============================================================================
-- 3. profiles policies — replace role='admin' with is_super_admin()
-- =============================================================================
-- Migration 007 defined INSERT/UPDATE/DELETE policies gated on role='admin'.
-- The application migrated to is_super_admin boolean (migration 019), but the
-- DB policies were never updated, creating a drift where:
--   Frontend: is_super_admin = true  →  allowed
--   RLS:      role != 'admin'        →  blocked
--
-- Drop and re-create using is_super_admin() function.

-- profiles INSERT
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    OR public.is_super_admin()
  );

-- profiles UPDATE
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR public.is_super_admin()
  );

-- profiles DELETE
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (
    auth.uid() = id
    OR public.is_super_admin()
  );


-- =============================================================================
-- 4. workspaces policies — replace role='admin' with is_super_admin()
-- =============================================================================
-- Migration 009 defined INSERT/UPDATE/DELETE policies gated on role='admin'.
-- Same drift as profiles: super admins may be blocked in the DB.

-- workspaces INSERT
DROP POLICY IF EXISTS "workspaces_insert" ON public.workspaces;
CREATE POLICY "workspaces_insert"
  ON public.workspaces FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
  );

-- workspaces UPDATE
DROP POLICY IF EXISTS "workspaces_update" ON public.workspaces;
CREATE POLICY "workspaces_update"
  ON public.workspaces FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
  );

-- workspaces DELETE
DROP POLICY IF EXISTS "workspaces_delete" ON public.workspaces;
CREATE POLICY "workspaces_delete"
  ON public.workspaces FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
  );


-- =============================================================================
-- 5. tablet_reservations — CREATE TABLE IF NOT EXISTS + RLS
-- =============================================================================
-- Migration 011 adds workspace_id to this table but never creates it.
-- The table exists in production (used by ReservaLab tablet module).
-- We create it idempotently with IF NOT EXISTS to avoid breaking fresh DBs.
--
-- Schema matches the application code exactly:
--   Frontend: src/apps/reservalab/types/index.ts (TabletReserva interface)
--   Service:  src/apps/reservalab/services/supabase.ts
--   Insert:   src/apps/reservalab/pages/Tablets.tsx (lines 126-135)
--   Flask:    src/apps/reservalab/api/app.py (lines 753-800)
--
-- Estado de produção: tabela existe com schema PT, acessada pelo Flask via
-- service_role e pelo frontend via Supabase client.
-- RLS status original não confirmado — aplicamos workspace isolation padrão.

CREATE TABLE IF NOT EXISTS public.tablet_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sala TEXT NOT NULL DEFAULT '',
  quantidade_tablets INTEGER NOT NULL DEFAULT 1,
  professor TEXT NOT NULL DEFAULT '',
  horario_inicio TIMESTAMPTZ NOT NULL,
  horario_fim TIMESTAMPTZ NOT NULL,
  finalidade TEXT DEFAULT '',
  reservado_por TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'cancelada', 'concluida'))
);

ALTER TABLE public.tablet_reservations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tablet_reservations_workspace
  ON public.tablet_reservations(workspace_id);

CREATE INDEX IF NOT EXISTS idx_tablet_reservations_status
  ON public.tablet_reservations(status);

CREATE INDEX IF NOT EXISTS idx_tablet_reservations_times
  ON public.tablet_reservations(horario_inicio, horario_fim);

-- RLS: standard workspace isolation
DROP POLICY IF EXISTS "tablet_reservations_select" ON public.tablet_reservations;
CREATE POLICY "tablet_reservations_select"
  ON public.tablet_reservations FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_belongs_to_workspace(workspace_id)
  );

DROP POLICY IF EXISTS "tablet_reservations_insert" ON public.tablet_reservations;
CREATE POLICY "tablet_reservations_insert"
  ON public.tablet_reservations FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.user_belongs_to_workspace(workspace_id)
  );

DROP POLICY IF EXISTS "tablet_reservations_update" ON public.tablet_reservations;
CREATE POLICY "tablet_reservations_update"
  ON public.tablet_reservations FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.user_belongs_to_workspace(workspace_id)
  );

DROP POLICY IF EXISTS "tablet_reservations_delete" ON public.tablet_reservations;
CREATE POLICY "tablet_reservations_delete"
  ON public.tablet_reservations FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
  );


-- =============================================================================
-- 6. TV tables — documented, USING(true) preserved
-- =============================================================================
-- KNOWN SECURITY DEBT:
-- TV tables (tv_events, tv_playlists, tv_music_queues, etc.) have
-- USING(true) policies that allow any authenticated or anonymous user full
-- read/write/delete access. This is a known vulnerability.
--
-- WHY DEFERRED:
-- The TV kiosk displays run WITHOUT authentication (anon session).
-- They need to read events, playlists, announcements, etc.
-- Replacing USING(true) with workspace isolation would break all kiosk
-- displays immediately. The fix requires architectural changes:
--   1. Kiosk authentication (service key or limited role)
--   2. Replace USING(true) with workspace-based policies
--   3. Move TV CRUD to authenticated-only endpoints
--
-- Tables affected (all in public schema):
--   tv_events, tv_playlists, tv_music_queues, tv_music_tracks,
--   tv_announcements, tv_galleries, tv_gallery_photos,
--   tv_calendar_cache, tv_urgent_announcements, tv_devices
--
-- Current policies: USING(true) WITH CHECK(true) — no restriction.
-- This migration does NOT change TV policies.
-- Will be addressed in a dedicated TV Authorization PR.


-- =============================================================================
-- 7. TV activation codes — documented
-- =============================================================================
-- Table: tv_activation_codes
-- Source: src/apps/tv/supabase-activation-codes.sql (run manually)
-- RLS: enabled, no policies for anon/authenticated (service_role only)
-- This migration does NOT re-create this table.
-- The table definition lives outside supabase/migrations/ by design.


-- =============================================================================
-- 8. Chamados — REVOKE documented
-- =============================================================================
-- Tables: chamados_tickets, ticket_events
-- RLS: REVOKE ALL FROM anon, authenticated, PUBLIC
-- Access: Flask backend via service_role (bypasses RLS)
--
-- Current authorization:
--   - chamados creation: public (rate-limited, require_module check)
--   - all other operations: NO authentication in Flask layer
--   - data isolation: NONE (Flask does not validate workspace per request)
--
-- This migration does NOT change chamados authorization.
-- See: PR 2 — Backend Authorization Layer for endpoint protection.
--
-- NOTE: The chamados_tickets and ticket_events tables are created at
-- runtime by api/app.py via the pg_sql RPC. The REVOKE statements are
-- embedded in the same DDL (api/app.py:780-784). This ensures that
-- even if the migration is not applied, the tables are protected when
-- created by the backend.


-- =============================================================================
-- 9. Audit trail — document all objects and their final state
-- =============================================================================
-- This migration ensures the following objects are version-controlled:
--
-- FUNCTIONS:
--   public.is_super_admin()          — first defined in 024, authoritative here
--   public.user_belongs_to_workspace(text) — EXISTS in 027
--   public.user_belongs_to_workspace(uuid) — EXISTS in 027
--   public.handle_new_user()         — EXISTS in 026
--   public.pg_sql(text)              — EXISTS in 023, locked in 025
--
-- COLUMNS (workspaces):
--   disabled_apps JSONB              — NEW (was missing from repo)
--   color TEXT                       — NEW (was missing from repo)
--   lab_count SMALLINT               — NEW (was missing from repo)
--
-- TABLES:
--   tablet_reservations              — NEW (was only ALTER'd in 011)
--
-- POLICIES CHANGED:
--   profiles_insert                  — role='admin' → is_super_admin()
--   profiles_update                  — role='admin' → is_super_admin()
--   profiles_delete                  — role='admin' → is_super_admin()
--   workspaces_insert                — role='admin' → is_super_admin()
--   workspaces_update                — role='admin' → is_super_admin()
--   workspaces_delete                — role='admin' → is_super_admin()
--
-- POLICIES PRESERVED (no change):
--   profiles_select                  — USING(true) for all authenticated
--   workspaces_select                — USING(true) for all authenticated
--   stock.* (14 tables)             — is_super_admin() OR user_belongs_to_workspace()
--   pcare.* (7 tables)              — is_super_admin() OR user_belongs_to_workspace()
--   assets (1 table)                — is_super_admin() OR workspace_id IN (...)
--   tv_music_requests               — authenticated SELECT, owner INSERT, super_admin UPDATE
--   TV tables (9 tables)            — USING(true) — DEFERRED (security debt)
--   tv_activation_codes             — no policies (service_role only)
--   chamados_tickets                — REVOKE ALL (service_role only)
--   ticket_events                   — REVOKE ALL (service_role only)
-- =============================================================================
