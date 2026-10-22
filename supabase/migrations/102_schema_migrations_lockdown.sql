-- =============================================================================
-- 102_schema_migrations_lockdown.sql
-- =============================================================================
-- The migration runner accesses this table through the Supabase Management API
-- as the database owner. It is not an application/API table and must not be
-- exposed to PostgREST clients.
--
-- Supabase platform defaults granted broad privileges to anon/authenticated
-- (including write and TRUNCATE), while RLS was disabled. Remove all API-role
-- privileges and enable deny-by-default RLS with no client policies.
-- No rows or migration history are changed. The postgres owner/Management API
-- runner retains the access required to read and record migration history.
-- =============================================================================

REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations
FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
