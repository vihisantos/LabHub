-- =============================================================================
-- tests/046_audit_fase7_closing.sql
-- =============================================================================
-- Asserções da auditoria 7.7 (migration 046): reforço da guarda de managed_by.
--  1. get_leader_team filtra EXPLICITAMENTE m.workspace_id = p_workspace_id
--     (defense-in-depth — o escopo da equipe é a unidade consultada).
--  2. trigger dispara em UPDATE OF managed_by, workspace_id (mover membership
--     de unidade revalida o vínculo — sem órfão cross-workspace).
--  3. gestão só por cargos de liderança ('lider'|'coordinator') e SEM
--     lider→lider na mesma unidade (marcadores na definição da função).
--  4. RLS/RPC continuam fail-closed: helpers executáveis por authenticated,
--     NÃO por anon/PUBLIC.
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 046 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 046 audit checks passed".
--
-- Behavior checks (get_leader_team fail-closed, guard cross-workspace, ciclos)
-- depend of an authenticated session — execute additionally as an authenticated
-- user in staging; here the checks are structural/catalog-level.
-- =============================================================================

DO $$
DECLARE
  v_count integer;
  v_def   text;
  v_trg   text;
  v_t     record;
BEGIN

-- ── 1. get_leader_team: escopo por workspace explícito + cargo lider ────────
SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'get_leader_team';

IF v_def IS NULL THEN
  RAISE EXCEPTION 'FAIL: get_leader_team function is missing';
END IF;
IF v_def NOT LIKE '%m.workspace_id = p_workspace_id%' THEN
  RAISE EXCEPTION 'FAIL: get_leader_team does not scope team rows by p_workspace_id explicitly';
END IF;
IF v_def NOT LIKE '%r.slug = ''lider''%' THEN
  RAISE EXCEPTION 'FAIL: get_leader_team does not require a lider membership for the caller';
END IF;

-- ── 2. Trigger: UPDATE OF managed_by, workspace_id (sem órfão cross-workspace) ──
SELECT count(*) INTO v_count
FROM pg_trigger t
JOIN pg_class rel ON rel.oid = t.tgrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public' AND rel.relname = 'memberships'
  AND t.tgname = 'trg_memberships_manager_guard'
  AND NOT t.tgisinternal;

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: guard trigger trg_memberships_manager_guard is missing or duplicated (found %)', v_count;
END IF;

SELECT t.tgenabled, t.tgtype,
       CASE WHEN t.tgtype & 1 = 1 THEN 'row' ELSE 'stmt' END,
       CASE WHEN t.tgtype & 2 = 2 THEN 'before' ELSE 'after' END,
       CASE WHEN t.tgtype & 4 = 4 THEN 'insert' ELSE '' END,
       CASE WHEN t.tgtype & 16 = 16 THEN 'update' ELSE '' END
INTO v_t
FROM pg_trigger t
JOIN pg_class rel ON rel.oid = t.tgrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public' AND rel.relname = 'memberships'
  AND t.tgname = 'trg_memberships_manager_guard'
  AND NOT t.tgisinternal;

IF v_t.tgenabled <> 'O' THEN
  RAISE EXCEPTION 'FAIL: guard trigger is not enabled (tgenabled=%)', v_t.tgenabled;
END IF;
IF v_t.tgtype & 1 <> 1 OR v_t.tgtype & 2 <> 2
   OR v_t.tgtype & 4 <> 4 OR v_t.tgtype & 16 <> 16 THEN
  RAISE EXCEPTION 'FAIL: guard trigger must be a ROW-level BEFORE INSERT/UPDATE (tgtype=%)', v_t.tgtype;
END IF;

SELECT pg_get_triggerdef(t.oid) INTO v_trg
FROM pg_trigger t
JOIN pg_class rel ON rel.oid = t.tgrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public' AND rel.relname = 'memberships'
  AND t.tgname = 'trg_memberships_manager_guard'
  AND NOT t.tgisinternal;

IF v_trg IS NULL OR v_trg NOT LIKE '%UPDATE OF managed_by, workspace_id%' THEN
  RAISE EXCEPTION 'FAIL: guard trigger does not fire on UPDATE OF managed_by, workspace_id (vínculo cross-workspace ficaria sem guarda) — %', v_trg;
END IF;

-- ── 3. Regras na função da trigger: gestor liderança + sem lider→lider ──────
SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'trg_memberships_manager_guard';

IF v_def IS NULL THEN
  RAISE EXCEPTION 'FAIL: trg_memberships_manager_guard function is missing';
END IF;
IF v_def NOT LIKE '%NOT IN (''lider'', ''coordinator'')%' THEN
  RAISE EXCEPTION 'FAIL: manager role is not restricted to leadership roles (lider/coordinator)';
END IF;
IF v_def NOT LIKE '%a lider cannot directly manage another lider%' THEN
  RAISE EXCEPTION 'FAIL: lider→lider in the same workspace is not blocked by the guard';
END IF;
IF v_def LIKE '%TG_OP = ''UPDATE''%' THEN
  RAISE EXCEPTION 'FAIL: cycle detection is gated by TG_OP=UPDATE — INSERT-explicit-id cycle is not covered';
END IF;

-- ── 4. Helpers executáveis por authenticated, não por anon/PUBLIC ───────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname IN ('membership_is_manager_of', 'user_manages_membership', 'get_leader_team');

IF v_count <> 3 THEN
  RAISE EXCEPTION 'FAIL: leadership helpers drifted (expected 3, found %)', v_count;
END IF;

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

RAISE NOTICE 'OK: 046 audit checks passed';

END $$;