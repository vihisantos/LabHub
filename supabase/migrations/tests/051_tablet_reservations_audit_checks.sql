-- =============================================================================
-- tests/051_tablet_reservations_audit_checks.sql
-- =============================================================================
-- Asserções ESTRUTURAIS para a migration 051 (auditoria de tablet_reservations
-- + notify_settings em profiles).
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 051 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 051 checks passed".
-- =============================================================================

DO $$
DECLARE
  v_missing text := '';
  v_count   integer;
  col       text;
BEGIN

-- ── 1. tablet_reservations: colunas de auditoria ────────────────────────────
FOR col IN
  SELECT unnest(ARRAY['created_by', 'created_at', 'cancelled_by', 'cancelled_at']) AS c
LOOP
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tablet_reservations' AND column_name = col
  ) THEN
    v_missing := coalesce(nullif(v_missing, '') || ', ', '') || 'tablet_reservations.' || col;
  END IF;
END LOOP;

-- ── 2. profiles.notify_settings ─────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'notify_settings'
) THEN
  v_missing := coalesce(nullif(v_missing, '') || ', ', '') || 'profiles.notify_settings';
END IF;

IF v_missing <> '' THEN
  RAISE EXCEPTION 'FAIL: colunas ausentes: %', v_missing;
END IF;

-- ── 3. notify_settings deve ser jsonb NOT NULL com default '{}' ────────────
SELECT count(*) INTO v_count
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
  AND column_name = 'notify_settings'
  AND data_type = 'jsonb'
  AND is_nullable = 'NO'
  AND column_default = '''{}''::jsonb';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: profiles.notify_settings deve ser jsonb NOT NULL DEFAULT ''{}''';
END IF;

-- ── 4. created_by/cancelled_by referenciam auth.users ──────────────────────
-- (pg_constraint: information_schema omite FKs cross-schema no Supabase)
SELECT count(*) INTO v_count
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
JOIN pg_class crel ON crel.oid = con.confrelid
JOIN pg_namespace rnsp ON rnsp.oid = crel.relnamespace
WHERE nsp.nspname = 'public' AND rel.relname = 'tablet_reservations'
  AND con.contype = 'f'
  AND rnsp.nspname = 'auth' AND crel.relname = 'users';

IF v_count < 2 THEN
  RAISE EXCEPTION 'FAIL: created_by/cancelled_by devem ter FK para auth.users(id) (encontradas: %)', v_count;
END IF;

-- ── 5. Índices do cron e de consulta ────────────────────────────────────────
SELECT count(*) INTO v_count
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'tablet_reservations'
  AND indexname IN ('idx_tablet_reservations_cancelled_at', 'idx_tablet_reservations_created_by');

IF v_count <> 2 THEN
  RAISE EXCEPTION 'FAIL: índices idx_tablet_reservations_cancelled_at/created_by ausentes (encontrados: %)', v_count;
END IF;

RAISE NOTICE 'OK: 051 checks passed';
END $$;
