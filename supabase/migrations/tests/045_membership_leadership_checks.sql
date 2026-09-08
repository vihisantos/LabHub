-- =============================================================================
-- tests/045_membership_leadership_checks.sql
-- =============================================================================
-- Asserções para a migration 045 (Fase 7 — área do Líder / scope team):
-- cargo 'lider', profiles_role_check, mapeamento sync lider/role-lider,
-- memberships.managed_by (+ FK, not-self, índices, trigger guard) e helpers
-- SECURITY DEFINER.
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 045 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 045 checks passed".
--
-- Behavioral checks (get_leader_team fail-closed, guard cross-workspace) depend
-- of an authenticated session — execute additionally as an authenticated user
-- in staging; the catalog checks here are structural.
-- =============================================================================

DO $$
DECLARE
  v_count   integer;
  v_def     text;
  v_guard   integer;
BEGIN

-- ── 1. Cargo 'lider' seedado (blueprint global, system) ─────────────────────
IF NOT EXISTS (
  SELECT 1 FROM public.roles
  WHERE slug = 'lider'
    AND workspace_id IS NULL
    AND is_system = true
    AND is_default = false
) THEN
  RAISE EXCEPTION 'FAIL: roles seed "lider" (global blueprint, is_system) is missing or drifted';
END IF;

-- ── 2. profiles_role_check aceita 'lider' e 'role-lider' ────────────────────
SELECT pg_get_constraintdef(con.oid) INTO v_def
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public' AND rel.relname = 'profiles'
  AND con.conname = 'profiles_role_check';

IF v_def IS NULL THEN
  RAISE EXCEPTION 'FAIL: profiles_role_check constraint is missing';
END IF;
IF v_def NOT LIKE '%''lider''%' OR v_def NOT LIKE '%''role-lider''%' THEN
  RAISE EXCEPTION 'FAIL: profiles_role_check does not accept lider/role-lider (%)', v_def;
END IF;

-- ── 3. sync_user_memberships mapeia lider/role-lider → slug lider ───────────
SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'sync_user_memberships';

IF v_def IS NULL THEN
  RAISE EXCEPTION 'FAIL: function sync_user_memberships(uuid) is missing';
END IF;
IF v_def NOT LIKE '%''lider'', %''role-lider''%' THEN
  RAISE EXCEPTION 'FAIL: sync_user_memberships does not map lider/role-lider';
END IF;

-- ── 4. memberships.managed_by existente (coluna + FK + not-self + índices) ──
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'memberships'
    AND column_name = 'managed_by'
) THEN
  RAISE EXCEPTION 'FAIL: memberships.managed_by column is missing';
END IF;

IF NOT EXISTS (
  SELECT 1 FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public' AND rel.relname = 'memberships'
    AND con.contype = 'f' AND con.confrelid = 'public.memberships'::regclass
    AND con.conname = 'memberships_managed_by_fkey'
) THEN
  RAISE EXCEPTION 'FAIL: memberships.managed_by FK is missing';
END IF;

SELECT pg_get_constraintdef(con.oid) INTO v_def
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public' AND rel.relname = 'memberships'
  AND con.conname = 'memberships_managed_by_not_self';

IF v_def IS NULL THEN
  RAISE EXCEPTION 'FAIL: memberships_managed_by_not_self check is missing';
END IF;

SELECT count(*) INTO v_count
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'memberships'
  AND indexname IN ('idx_memberships_managed_by', 'idx_memberships_workspace_managed');
IF v_count <> 2 THEN
  RAISE EXCEPTION 'FAIL: managed_by indexes drifted (expected 2, found %)', v_count;
END IF;

-- ── 5. Trigger guard existente ──────────────────────────────────────────────
SELECT count(*) INTO v_guard
FROM pg_trigger t
JOIN pg_class rel ON rel.oid = t.tgrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public' AND rel.relname = 'memberships'
  AND t.tgname = 'trg_memberships_manager_guard'
  AND NOT t.tgisinternal;

IF v_guard <> 1 THEN
  RAISE EXCEPTION 'FAIL: guard trigger trg_memberships_manager_guard is missing or duplicated (found %)', v_guard;
END IF;

-- ── 6. Helpers SECURITY DEFINER existem ─────────────────────────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname IN ('membership_is_manager_of', 'user_manages_membership', 'get_leader_team');

IF v_count <> 3 THEN
  RAISE EXCEPTION 'FAIL: leadership helpers missing (expected 3, found %) — need membership_is_manager_of, user_manages_membership, get_leader_team', v_count;
END IF;

-- ── 7. Executáveis por authenticated, não por anon ──────────────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, '{}'::aclitem[])) acl
WHERE nsp.nspname = 'public'
  AND p.proname IN ('membership_is_manager_of', 'user_manages_membership', 'get_leader_team')
  AND (
    acl.grantee = 'anon'::regrole OR acl.grantee = 0
  );

IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL: anon/PUBLIC can execute leadership helpers — must be revoked (found %)', v_count;
END IF;

RAISE NOTICE 'OK: 045 checks passed';

END $$;