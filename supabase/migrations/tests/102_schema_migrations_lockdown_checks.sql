-- =============================================================================
-- 102_schema_migrations_lockdown_checks.sql
-- Assertions for migration 102; run after the migration chain in ephemeral CI.
-- =============================================================================
DO $$
DECLARE
    role_name text;
    privilege_name text;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'schema_migrations'
          AND c.relkind = 'r'
          AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'public.schema_migrations must exist with RLS enabled';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'schema_migrations'
    ) THEN
        RAISE EXCEPTION 'public.schema_migrations must not expose client policies';
    END IF;

    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        FOREACH privilege_name IN ARRAY ARRAY[
            'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
        ] LOOP
            IF has_table_privilege(role_name, 'public.schema_migrations', privilege_name) THEN
                RAISE EXCEPTION 'unexpected % privilege on public.schema_migrations for %',
                    privilege_name, role_name;
            END IF;
        END LOOP;
    END LOOP;

    -- PostgreSQL 17 added the MAINTAIN table privilege; `REVOKE ALL PRIVILEGES`
    -- revokes it there as well. Guarded by server version because the CI
    -- ephemeral image (postgres:16) does not recognize 'MAINTAIN'.
    IF current_setting('server_version_num')::int >= 170000 THEN
        FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
            IF has_table_privilege(role_name, 'public.schema_migrations', 'MAINTAIN') THEN
                RAISE EXCEPTION 'unexpected MAINTAIN privilege on public.schema_migrations for %',
                    role_name;
            END IF;
        END LOOP;
    END IF;
END
$$;
