-- =============================================================================
-- 102_schema_migrations_lockdown.sql
-- =============================================================================
-- `public.schema_migrations` is the migration runner's history table, not an
-- application/API table; it must not be exposed to PostgREST clients.
--
-- OBSERVED FACTS (read-only catalog check, 2026-10-23, DEV and PROD):
--   - the table is owned by `postgres`;
--   - anon/authenticated/service_role hold every table privilege
--     (SELECT..TRIGGER, plus MAINTAIN on PostgreSQL 17) through platform
--     default privileges, and `PUBLIC` holds none;
--   - there are no RLS policies, and RLS was disabled in production.
--
-- The runner reads and records history through the Supabase Management API
-- (`/database/query`). The PostgreSQL identity used by that endpoint is not
-- documented; from the observed ownership above and the runner's 101+
-- recorded history INSERTs we INFER it executes with owner-equivalent
-- privileges (formal confirmation from Supabase Support is pending).
-- Either way, this migration does not touch the owner path: the REVOKE
-- targets only PUBLIC, anon, authenticated and service_role, and a table
-- owner keeps implicit privileges and ignores RLS unless FORCE is set.
-- The production migrate job is fail-closed: its dry-run (read-only) runs
-- before any write.
--
-- Supabase platform defaults granted broad privileges to anon/authenticated
-- (including write and TRUNCATE), while RLS was disabled. Remove all API-role
-- privileges and enable deny-by-default RLS with no client policies.
-- No rows or migration history are changed by this migration.
-- =============================================================================

REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations
FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
