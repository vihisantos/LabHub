-- =============================================================================
-- tests/048_rbac2_purge_checks.sql
-- =============================================================================
-- Asserções ESTRUTURAIS para a migration 048 (Fase 9.1-A — purge de UUIDs
-- fantasma em profiles.workspace_ids ao excluir um workspace).
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 048 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 048 checks passed".
--
-- A prova COMPORTAMENTAL (cenário workspace A, múltiplos profiles, múltiplos
-- deletes no mesmo statement, managed_by, ROLLBACK/resíduo zero) roda no DEV
-- via scripts/validate_rbac2_purge_048_dev.py.
-- =============================================================================

DO $$
DECLARE
  v_count   integer;
  v_def     text;
  v_is_def  boolean;
  v_tgtype  smallint;
  v_old_tbl text;
  v_acl     integer;
BEGIN

-- ── 1. Função existe, RETURNS trigger, SECURITY DEFINER, search_path=public ─
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'trg_purge_workspace_ids'
  AND p.prorettype = 'trigger'::regtype;

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: function trg_purge_workspace_ids() (RETURNS trigger) missing (found %)', v_count;
END IF;

SELECT p.prosecdef, p.proconfig::text INTO v_is_def, v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'trg_purge_workspace_ids';

IF NOT v_is_def THEN
  RAISE EXCEPTION 'FAIL: trg_purge_workspace_ids() is NOT SECURITY DEFINER';
END IF;
IF v_def IS NULL OR v_def NOT LIKE '%search_path=public%' THEN
  RAISE EXCEPTION 'FAIL: trg_purge_workspace_ids() search_path is not pinned to public (%)', v_def;
END IF;

-- ── 2. Trigger AFTER DELETE, FOR EACH STATEMENT, transition table ───────────
SELECT t.tgtype, COALESCE(t.tgoldtable, '') INTO v_tgtype, v_old_tbl
FROM pg_trigger t
JOIN pg_class rel ON rel.oid = t.tgrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public' AND rel.relname = 'workspaces'
  AND t.tgname = 'trg_workspaces_purge_workspace_ids'
  AND NOT t.tgisinternal;

IF v_tgtype IS NULL THEN
  RAISE EXCEPTION 'FAIL: trigger trg_workspaces_purge_workspace_ids missing on workspaces';
END IF;

-- tgtype: bitmask (1=ROW, 2=BEFORE, 8=DELETE). Esperado AFTER DELETE STATEMENT.
IF (v_tgtype & 8) = 0 THEN
  RAISE EXCEPTION 'FAIL: trigger is not on DELETE (tgtype=%)', v_tgtype;
END IF;
IF (v_tgtype & 1) <> 0 OR (v_tgtype & 2) <> 0 THEN
  RAISE EXCEPTION 'FAIL: trigger must be FOR EACH STATEMENT AFTER DELETE (tgtype=%)', v_tgtype;
END IF;
IF v_old_tbl <> 'deleted_workspaces' THEN
  RAISE EXCEPTION 'FAIL: trigger transition table (OLD TABLE) must be deleted_workspaces (found %)', v_old_tbl;
END IF;

-- ── 3. ACL: anon/PUBLIC revogados; authenticated + service_role concedidos ──
SELECT count(*) INTO v_acl
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, '{}'::aclitem[])) acl
WHERE nsp.nspname = 'public' AND p.proname = 'trg_purge_workspace_ids'
  AND (acl.grantee = 'anon'::regrole OR acl.grantee = 0);

IF v_acl <> 0 THEN
  RAISE EXCEPTION 'FAIL: anon/PUBLIC can execute trg_purge_workspace_ids() — must be revoked (found %)', v_acl;
END IF;

SELECT count(DISTINCT acl.grantee) INTO v_acl
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, '{}'::aclitem[])) acl
WHERE nsp.nspname = 'public' AND p.proname = 'trg_purge_workspace_ids'
  AND acl.grantee IN ('authenticated'::regrole, 'service_role'::regrole);

IF v_acl <> 2 THEN
  RAISE EXCEPTION 'FAIL: authenticated and service_role must BOTH be granted (found %)', v_acl;
END IF;

RAISE NOTICE 'OK: 048 checks passed';

END $$;