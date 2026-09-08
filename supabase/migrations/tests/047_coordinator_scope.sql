-- =============================================================================
-- tests/047_coordinator_scope.sql
-- =============================================================================
-- Asserções da Fase 8 (migration 047): escopo do coordenador no banco.
--  1. Funções existem: is_coordinator_of(uuid), get_coordinator_units(),
--     get_coordinator_leaders(uuid), get_memberships_by_manager(uuid),
--     coordinator_set_manager(uuid, uuid).
--  2. Leitura fail-closed: todo helper filtra auth.uid() + r.slug='coordinator'
--     + status/escopo por workspace (marcadores nas definições).
--  3. Escrita escopada: coordinator_set_manager tem autorização explícita
--     (coordinator scope via marcadores) E a RLS de memberships continua
--     super-admin-only (036) — o RPC é o único caminho escopado para managed_by.
--  4. ACL: somente authenticated; anon/PUBLIC revogado.
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 047 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 047 coordinator scope checks passed".
--
-- Behavior checks (is_coordinator_of, RPCs fail-closed, coordinator_set_manager
-- e os casos adversariais do mapa) dependem de sessão autenticada — execute
-- adicionalmente como usuário autenticado em staging; aqui os checks são
-- estruturais/catálogo.
-- =============================================================================

DO $$
DECLARE
  v_count integer;
  v_def   text;
  v_t     record;
BEGIN

-- ── 1. As 5 funções da Fase 8 existem ────────────────────────────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname IN (
    'is_coordinator_of',
    'get_coordinator_units',
    'get_coordinator_leaders',
    'get_memberships_by_manager',
    'coordinator_set_manager'
  );

IF v_count <> 5 THEN
  RAISE EXCEPTION 'FAIL: coordinator scope helpers drifted (expected 5, found %)', v_count;
END IF;

-- ── 2. Leitura: todo helper é fail-closed (auth.uid + cargo coordinator) ─────
SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'is_coordinator_of';

IF v_def IS NULL THEN
  RAISE EXCEPTION 'FAIL: is_coordinator_of function is missing';
END IF;
IF v_def NOT LIKE '%auth.uid()%' OR v_def NOT LIKE '%r.slug = ''coordinator''%' THEN
  RAISE EXCEPTION 'FAIL: is_coordinator_of is not fail-closed (auth.uid + cargo coordinator)';
END IF;

SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'get_coordinator_units';

IF v_def IS NULL THEN
  RAISE EXCEPTION 'FAIL: get_coordinator_units function is missing';
END IF;
IF v_def NOT LIKE '%auth.uid()%' OR v_def NOT LIKE '%r.slug = ''coordinator''%' THEN
  RAISE EXCEPTION 'FAIL: get_coordinator_units does not scope to the caller coordinator memberships';
END IF;

SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'get_coordinator_leaders';

IF v_def IS NULL THEN
  RAISE EXCEPTION 'FAIL: get_coordinator_leaders function is missing';
END IF;
IF v_def NOT LIKE '%auth.uid()%' OR v_def NOT LIKE '%r.slug = ''coordinator''%' THEN
  RAISE EXCEPTION 'FAIL: get_coordinator_leaders does not require a coordinator membership';
END IF;
IF v_def NOT LIKE '%m.managed_by = me.id%' THEN
  RAISE EXCEPTION 'FAIL: get_coordinator_leaders does not scope to memberships managed directly by the coordinator';
END IF;
IF v_def NOT LIKE '%m.workspace_id = p_workspace_id%' THEN
  RAISE EXCEPTION 'FAIL: get_coordinator_leaders does not scope rows to p_workspace_id explicitly';
END IF;

SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'get_memberships_by_manager';

IF v_def IS NULL THEN
  RAISE EXCEPTION 'FAIL: get_memberships_by_manager function is missing';
END IF;
IF v_def NOT LIKE '%auth.uid()%' OR v_def NOT LIKE '%r.slug = ''coordinator''%' THEN
  RAISE EXCEPTION 'FAIL: get_memberships_by_manager does not require caller to be coordinator of the manager workspace';
END IF;
IF v_def NOT LIKE '%m.workspace_id = mgr.workspace_id%' THEN
  RAISE EXCEPTION 'FAIL: get_memberships_by_manager does not scope rows to the manager workspace explicitly';
END IF;

-- ── 3. Escrita escopada: autorização explícita + RLS inalterada ─────────────
SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'coordinator_set_manager';

IF v_def IS NULL THEN
  RAISE EXCEPTION 'FAIL: coordinator_set_manager function is missing';
END IF;
IF v_def NOT LIKE '%auth.uid()%' OR v_def NOT LIKE '%r.slug = ''coordinator''%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_set_manager does not authorize by the caller coordinator membership';
END IF;
IF v_def NOT LIKE '%manager is outside the coordinator scope in this unit%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_set_manager does not restrict the manager to the coordinator tree (same unit)';
END IF;
IF v_def NOT LIKE '%coordinators are peers in a unit%' THEN
  RAISE EXCEPTION 'FAIL: coordinator_set_manager does not block re-parenting a coordination membership';
END IF;

-- A RLS de escrita de memberships continua super-admin-only (036): policy
-- memberships_update deve existir como UPDATE/ALL para is_super_admin.
SELECT count(*) INTO v_count
FROM pg_policies p
WHERE p.schemaname = 'public' AND p.tablename = 'memberships'
  AND p.policyname = 'memberships_update';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: memberships_update policy drifted — RLS escrita deve permanecer super-admin-only (found %)', v_count;
END IF;

SELECT p.cmd INTO v_t FROM pg_policies p
WHERE p.schemaname = 'public' AND p.tablename = 'memberships'
  AND p.policyname = 'memberships_update';
IF v_t.cmd NOT IN ('UPDATE', 'ALL') THEN
  RAISE EXCEPTION 'FAIL: memberships_update policy is not an UPDATE/ALL policy (cmd=%)', v_t.cmd;
END IF;

-- ── 4. ACL: somente authenticated; anon/PUBLIC revogado ──────────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, '{}'::aclitem[])) acl
WHERE nsp.nspname = 'public'
  AND p.proname IN (
    'is_coordinator_of',
    'get_coordinator_units',
    'get_coordinator_leaders',
    'get_memberships_by_manager',
    'coordinator_set_manager'
  )
  AND (acl.grantee = 'anon'::regrole OR acl.grantee = 0);

IF v_count <> 0 THEN
  RAISE EXCEPTION 'FAIL: anon/PUBLIC can execute coordinator scope helpers — must be revoked (found %)', v_count;
END IF;

RAISE NOTICE 'OK: 047 coordinator scope checks passed';

END $$;