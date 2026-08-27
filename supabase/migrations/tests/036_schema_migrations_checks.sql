-- =============================================================================
-- tests/036_schema_migrations_checks.sql
-- =============================================================================
-- Assertion script for the migration runner's history table (schema_migrations).
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER the runner has
-- created public.schema_migrations. Every check RAISEs an exception on drift; a
-- clean run ends with "OK: 036 checks passed".
--
-- These are catalog-level checks (structure + constraint). Behavioral checks
-- (order, baseline, pending detection) are covered by the runner's automated
-- tests in scripts/tests/test_migrations.py.
-- =============================================================================

DO $$
DECLARE
  v_count integer;
BEGIN

-- ── 1. Table exists ───────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'schema_migrations'
) THEN
  RAISE EXCEPTION 'FAIL: table public.schema_migrations is missing';
END IF;

-- ── 2. Expected columns exist ────────────────────────────────────────────────
SELECT count(*) INTO v_count
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'schema_migrations'
  AND column_name IN ('version','filename','applied_at','duration_ms');

IF v_count <> 4 THEN
  RAISE EXCEPTION 'FAIL: schema_migrations columns drifted (expected 4, found %)', v_count;
END IF;

-- ── 3. version is the primary key ────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public' AND rel.relname = 'schema_migrations'
    AND con.contype = 'p'
) THEN
  RAISE EXCEPTION 'FAIL: schema_migrations.version must be PRIMARY KEY';
END IF;

-- ── 4. No migration ever re-applied (no duplicate versions possible) ─────────
SELECT count(*) INTO v_count
FROM (
  SELECT version FROM public.schema_migrations
  GROUP BY version HAVING count(*) > 1
) dup;

IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL: duplicate versions found in schema_migrations (%)', v_count;
END IF;

RAISE NOTICE 'OK: 036 checks passed';
END $$;
