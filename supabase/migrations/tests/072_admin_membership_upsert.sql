-- =============================================================================
-- tests/072_admin_membership_upsert.sql
-- =============================================================================
-- Asserções da Fase PR #284 (migration 072): escrita administrativa de
-- memberships POR UNIDADE (cargo por unidade, sem propagação global).
--   1. Funções existem com as assinaturas exatas:
--      admin_upsert_membership(uuid, uuid, text),
--      admin_remove_membership(uuid, uuid),
--      admin_set_manager(uuid, uuid, uuid).
--   2. Upsert exige conta active (pending não recebe membership); remove não
--      exige (limpeza); set_manager exige conta active.
--   3. Upsert preserva managed_by (nunca escreve a coluna); set_manager é o
--      único escritor dedicado (guarda estrutural no trigger 045).
--   4. Espelho profiles.workspace_ids recomputado na mesma função.
--   5. SECURITY DEFINER + search_path travado.
--   6. ACL: somente service_role; anon/PUBLIC/authenticated revogados.
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 072 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 072 admin membership upsert checks passed".
--
-- Behavior checks (upsert/remove/manager/mirror/audit) dependem de dados —
-- execute adicionalmente em staging com service_role; aqui os checks são
-- estruturais/catálogo.
-- =============================================================================

DO $$
DECLARE
  v_count integer;
  v_def   text;
BEGIN

-- ── 1. Assinaturas exatas ───────────────────────────────────────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname = 'admin_upsert_membership'
  AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_workspace_id uuid, p_role_slug text';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: admin_upsert_membership signature drifted (expected 1, found %)', v_count;
END IF;

SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname = 'admin_remove_membership'
  AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_workspace_id uuid';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: admin_remove_membership signature drifted (expected 1, found %)', v_count;
END IF;

SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname = 'admin_set_manager'
  AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_workspace_id uuid, p_manager_membership_id uuid';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: admin_set_manager signature drifted (expected 1, found %)', v_count;
END IF;

-- ── 2. Conta active exigida no upsert e no set_manager ───────────────────────
SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'admin_upsert_membership';

IF v_def NOT LIKE '%profile is not active%' THEN
  RAISE EXCEPTION 'FAIL: admin_upsert_membership must require an active profile';
END IF;
IF v_def NOT LIKE '%profile not found%' THEN
  RAISE EXCEPTION 'FAIL: admin_upsert_membership missing profile-exists guard';
END IF;
IF v_def NOT LIKE '%unknown role slug%' THEN
  RAISE EXCEPTION 'FAIL: admin_upsert_membership missing unknown-slug guard';
END IF;
IF v_def NOT LIKE '%workspace not found%' THEN
  RAISE EXCEPTION 'FAIL: admin_upsert_membership missing workspace-exists guard';
END IF;

SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'admin_set_manager';

IF v_def NOT LIKE '%profile is not active%' THEN
  RAISE EXCEPTION 'FAIL: admin_set_manager must require an active profile';
END IF;
IF v_def NOT LIKE '%membership not found%' THEN
  RAISE EXCEPTION 'FAIL: admin_set_manager missing membership-exists guard';
END IF;

-- ── 3. managed_by: upsert nunca escreve; set_manager é o escritor ────────────
SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'admin_upsert_membership';

IF v_def LIKE '%managed_by =%' OR v_def LIKE '%SET managed_by%' THEN
  RAISE EXCEPTION 'FAIL: admin_upsert_membership must never write managed_by';
END IF;
IF v_def NOT LIKE '%ON CONFLICT (profile_id, workspace_id)%' THEN
  RAISE EXCEPTION 'FAIL: admin_upsert_membership must upsert on (profile_id, workspace_id)';
END IF;

SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'admin_set_manager';

IF v_def NOT LIKE '%SET managed_by =%' AND v_def NOT LIKE '%SET managed_by=%' THEN
  RAISE EXCEPTION 'FAIL: admin_set_manager must write managed_by';
END IF;

-- ── 4. Espelho workspace_ids recomputado nas escritas ────────────────────────
FOR v_def IN
  SELECT pg_get_functiondef(p.oid)
  FROM pg_proc p
  JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
  WHERE nsp.nspname = 'public'
    AND p.proname IN ('admin_upsert_membership', 'admin_remove_membership')
LOOP
  IF v_def NOT LIKE '%UPDATE public.profiles%SET workspace_ids%' THEN
    RAISE EXCEPTION 'FAIL: missing profiles.workspace_ids mirror in writer';
  END IF;
END LOOP;

-- ── 5. SECURITY DEFINER + search_path + retorno singular ────────────────────
FOR v_def IN
  SELECT pg_get_functiondef(p.oid)
  FROM pg_proc p
  JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
  WHERE nsp.nspname = 'public'
    AND p.proname IN ('admin_upsert_membership', 'admin_remove_membership', 'admin_set_manager')
LOOP
  IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'FAIL: function must be SECURITY DEFINER';
  END IF;
  -- pg_get_functiondef normaliza o SET conforme a versão do PG
  -- ('= public' ou "TO 'public'"): aceitar ambas as formas.
  IF v_def NOT LIKE '%SET search_path = public%'
     AND v_def NOT LIKE '%SET search_path TO %public%' THEN
    RAISE EXCEPTION 'FAIL: function must pin search_path=public';
  END IF;
END LOOP;

-- upsert/set_manager retornam UMA membership (NÃO-SETOF): RETURN QUERY é
-- erro 42804 — retorno via SELECT INTO + RETURN.
FOR v_def IN
  SELECT pg_get_functiondef(p.oid)
  FROM pg_proc p
  JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
  WHERE nsp.nspname = 'public'
    AND p.proname IN ('admin_upsert_membership', 'admin_set_manager')
LOOP
  IF v_def LIKE '%RETURN QUERY%' THEN
    RAISE EXCEPTION 'FAIL: singular function must not use RETURN QUERY (error 42804)';
  END IF;
END LOOP;

-- ── 6. ACL: somente service_role ─────────────────────────────────────────────
SELECT count(*) INTO v_count
FROM information_schema.role_routine_grants g
JOIN pg_proc p ON p.proname = g.routine_name
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname IN ('admin_upsert_membership', 'admin_remove_membership', 'admin_set_manager')
  AND g.grantee = 'service_role'
  AND g.privilege_type = 'EXECUTE';

IF v_count < 3 THEN
  RAISE EXCEPTION 'FAIL: service_role must hold EXECUTE on all three 072 functions (found %)', v_count;
END IF;

SELECT count(*) INTO v_count
FROM information_schema.role_routine_grants g
JOIN pg_proc p ON p.proname = g.routine_name
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname IN ('admin_upsert_membership', 'admin_remove_membership', 'admin_set_manager')
  AND g.grantee IN ('anon', 'authenticated', 'PUBLIC');

IF v_count > 0 THEN
  RAISE EXCEPTION 'FAIL: anon/PUBLIC/authenticated must not execute 072 functions (found %)', v_count;
END IF;

RAISE NOTICE 'OK: 072 admin membership upsert checks passed';
END $$;
