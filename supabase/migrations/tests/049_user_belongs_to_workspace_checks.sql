-- =============================================================================
-- tests/049_user_belongs_to_workspace_checks.sql
-- =============================================================================
-- Asserções ESTRUTURAIS para a migration 049 (Fase 9.1-B — unificar
-- user_belongs_to_workspace() para ler memberships active).
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 049 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 049 checks passed".
--
-- A prova COMPORTAMENTAL (circularidade RLS, status fail-closed, cross-workspace,
-- super admin, consumidores indiretos, antes/depois das policies) roda no DEV
-- via scripts/validate_rbac2_ubtw_049_dev.py.
-- =============================================================================

DO $$
DECLARE
  v_overloads integer;
  v_nsp       oid;
  v_def       text;
  v_is_def    boolean;
  v_src       text;
  v_acl       integer;
  v_tbl       boolean;
  v_note      text;
BEGIN

-- ── 1. As duas sobrecargas existem ──────────────────────────────────────────
SELECT count(*) INTO v_overloads
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'user_belongs_to_workspace';

IF v_overloads <> 2 THEN
  RAISE EXCEPTION 'FAIL: esperado 2 overloads de user_belongs_to_workspace (text, uuid); encontrado %', v_overloads;
END IF;

SELECT nsp.oid INTO v_nsp
FROM pg_namespace nsp WHERE nsp.nspname = 'public';

-- ── 2. Por overload: SECURITY DEFINER, STABLE, search_path=public, origem ───
FOR v_def, v_is_def, v_src IN
  SELECT p.proname || '/' || pg_get_function_identity_arguments(p.oid)::text,
         p.prosecdef,
         p.prosrc
  FROM pg_proc p
  WHERE p.pronamespace = v_nsp AND p.proname = 'user_belongs_to_workspace'
LOOP
  IF NOT v_is_def THEN
    RAISE EXCEPTION 'FAIL: user_belongs_to_workspace(%) não é SECURITY DEFINER', v_def;
  END IF;

  IF (SELECT p.provolatile FROM pg_proc p
      WHERE p.pronamespace = v_nsp AND p.proname = 'user_belongs_to_workspace'
        AND p.proname || '/' || pg_get_function_identity_arguments(p.oid)::text = v_def) <> 's' THEN
    RAISE EXCEPTION 'FAIL: user_belongs_to_workspace(%) não é STABLE', v_def;
  END IF;

  IF (SELECT p.proconfig::text FROM pg_proc p
      WHERE p.pronamespace = v_nsp AND p.proname = 'user_belongs_to_workspace'
        AND p.proname || '/' || pg_get_function_identity_arguments(p.oid)::text = v_def)
     IS DISTINCT FROM '{search_path=public}' THEN
    RAISE EXCEPTION 'FAIL: user_belongs_to_workspace(%) sem search_path pinado em public', v_def;
  END IF;

  -- Origem NÃO pode mais ler o legado workspace_ids
  IF v_src LIKE '%workspace_ids%' THEN
    RAISE EXCEPTION 'FAIL: user_belongs_to_workspace(%) ainda lê workspace_ids (legado) — unificação incompleta', v_def;
  END IF;

  -- Origem DEVE ler memberships com filtragem por status active
  IF v_src NOT LIKE '%public.memberships%' OR v_src NOT LIKE '%status = ''active''%' THEN
    RAISE EXCEPTION 'FAIL: user_belongs_to_workspace(%) não lê memberships com status active', v_def;
  END IF;
END LOOP;

-- ── 3. ACL: nenhuma sobrecarga executa para anon/PUBLIC ─────────────────────
SELECT count(*) INTO v_acl
FROM pg_proc p
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, '{}'::aclitem[])) acl
WHERE p.pronamespace = v_nsp AND p.proname = 'user_belongs_to_workspace'
  AND (acl.grantee = 'anon'::regrole OR acl.grantee = 0);

IF v_acl <> 0 THEN
  RAISE EXCEPTION 'FAIL: anon/PUBLIC podem executar user_belongs_to_workspace — deve ser REVOKE (found %)', v_acl;
END IF;

-- ── 4. ACL: ambas as sobrecargas concedem authenticated + service_role ──────
SELECT count(*) INTO v_acl
FROM pg_proc p
WHERE p.pronamespace = v_nsp AND p.proname = 'user_belongs_to_workspace'
  AND EXISTS (
    SELECT 1 FROM aclexplode(COALESCE(p.proacl, '{}'::aclitem[])) acl
    WHERE acl.grantee IN ('authenticated'::regrole, 'service_role'::regrole)
      AND acl.privilege_type = 'EXECUTE'
  );

IF v_acl <> 2 THEN
  RAISE EXCEPTION 'FAIL: authenticated/service_role devem ter EXECUTE nas 2 sobrecargas (found %)', v_acl;
END IF;

-- ── 5. Premissa de não-recursão: dono das funções tem BYPASSRLS ─────────────
SELECT count(*) INTO v_acl
FROM pg_proc p
JOIN pg_roles r ON r.oid = p.proowner
WHERE p.pronamespace = v_nsp AND p.proname = 'user_belongs_to_workspace'
  AND r.rolbypassrls;

IF v_acl <> 2 THEN
  RAISE EXCEPTION 'FAIL: dono de user_belongs_to_workspace sem BYPASSRLS — premissa de não-recursão quebrada (found %)', v_acl;
END IF;

-- ── 6. memberships com RLS ativa e policy de leitura dependente do helper ───
SELECT relrowsecurity INTO v_tbl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'memberships';

IF v_tbl IS NOT TRUE THEN
  RAISE EXCEPTION 'FAIL: public.memberships sem ROW LEVEL SECURITY ativa';
END IF;

SELECT count(*) INTO v_acl
FROM pg_policies p
WHERE p.schemaname = 'public' AND p.tablename = 'memberships'
  AND p.policyname = 'memberships_select'
  AND p.qual ILIKE '%user_belongs_to_workspace%';

IF v_acl <> 1 THEN
  RAISE EXCEPTION 'FAIL: memberships_select não depende de user_belongs_to_workspace (found %)', v_acl;
END IF;

RAISE NOTICE 'OK: 049 checks passed';

END $$;