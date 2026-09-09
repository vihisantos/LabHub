-- =============================================================================
-- tests/050_tablet_reservations_cancel_checks.sql
-- =============================================================================
-- Asserções ESTRUTURAIS para a migration 050 (restringir cancelamento de
-- reserva de tablet ao nível `full` do app ReservaLab).
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 050 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 050 checks passed".
--
-- A prova COMPORTAMENTAL (read cancela? full cancela? cross-workspace leak?
-- super admin?) roda no DEV via scripts/validate_rbac2_...# -- não há validação
-- Python nesta migration; a cobertura comportamental fica nos testes TS do
-- frontend + validação manual no DEV.
-- =============================================================================

DO $$
DECLARE
  v_nsp       oid;
  v_def       text;
  v_is_def    boolean;
  v_src       text;
  v_vol       text;
  v_cfg       text;
  v_acl       integer;
  v_pol       text;
  v_uses_func integer;
  v_uses_ubtw integer;
BEGIN

-- ── 1. A função existe (1 overload uuid) ────────────────────────────────────
SELECT count(*) INTO v_acl
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'user_can_cancel_tablet_reservation';

IF v_acl <> 1 THEN
  RAISE EXCEPTION 'FAIL: esperado 1 overload de user_can_cancel_tablet_reservation; encontrado %', v_acl;
END IF;

SELECT nsp.oid INTO v_nsp
FROM pg_namespace nsp WHERE nsp.nspname = 'public';

-- ── 2. Atributos: SECURITY DEFINER, STABLE, search_path=public, origem ──────
SELECT p.prosecdef, p.provolatile, p.proconfig::text, p.prosrc
  INTO v_is_def, v_vol, v_cfg, v_src
FROM pg_proc p
WHERE p.pronamespace = v_nsp
  AND p.proname = 'user_can_cancel_tablet_reservation';

IF NOT v_is_def THEN
  RAISE EXCEPTION 'FAIL: user_can_cancel_tablet_reservation não é SECURITY DEFINER';
END IF;

IF v_vol <> 's' THEN
  RAISE EXCEPTION 'FAIL: user_can_cancel_tablet_reservation não é STABLE';
END IF;

IF v_cfg IS DISTINCT FROM '{search_path=public}' THEN
  RAISE EXCEPTION 'FAIL: user_can_cancel_tablet_reservation sem search_path pinado em public';
END IF;

-- Deve consultar o override de app (profiles.app_access) e o RBAC 2.0
-- (memberships + role_permissions), com status active.
IF v_src NOT LIKE '%public.profiles%' OR v_src NOT LIKE '%app_access%' THEN
  RAISE EXCEPTION 'FAIL: user_can_cancel_tablet_reservation não lê profiles.app_access (override full)';
END IF;

IF v_src NOT LIKE '%public.memberships%' OR v_src NOT LIKE '%public.role_permissions%' THEN
  RAISE EXCEPTION 'FAIL: user_can_cancel_tablet_reservation não consulta memberships/role_permissions (RBAC 2.0)';
END IF;

IF v_src NOT LIKE '%status = ''active''%' THEN
  RAISE EXCEPTION 'FAIL: user_can_cancel_tablet_reservation não filtra membership por status active';
END IF;

-- ── 3. ACL: sem EXECUTE para anon/PUBLIC ────────────────────────────────────
SELECT count(*) INTO v_acl
FROM pg_proc p
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, '{}'::aclitem[])) acl
WHERE p.pronamespace = v_nsp AND p.proname = 'user_can_cancel_tablet_reservation'
  AND (acl.grantee = 'anon'::regrole OR acl.grantee = 0);

IF v_acl <> 0 THEN
  RAISE EXCEPTION 'FAIL: anon/PUBLIC podem executar user_can_cancel_tablet_reservation (found %)', v_acl;
END IF;

-- ── 4. ACL: authenticated + service_role têm EXECUTE ────────────────────────
SELECT count(*) INTO v_acl
FROM pg_proc p
WHERE p.pronamespace = v_nsp AND p.proname = 'user_can_cancel_tablet_reservation'
  AND EXISTS (
    SELECT 1 FROM aclexplode(COALESCE(p.proacl, '{}'::aclitem[])) acl
    WHERE acl.grantee IN ('authenticated'::regrole, 'service_role'::regrole)
      AND acl.privilege_type = 'EXECUTE'
  );

IF v_acl <> 1 THEN
  RAISE EXCEPTION 'FAIL: authenticated/service_role devem ter EXECUTE em user_can_cancel_tablet_reservation (found %)', v_acl;
END IF;

-- ── 5. Premissa de não-recursão: dono tem BYPASSRLS ─────────────────────────
SELECT count(*) INTO v_acl
FROM pg_proc p
JOIN pg_roles r ON r.oid = p.proowner
WHERE p.pronamespace = v_nsp AND p.proname = 'user_can_cancel_tablet_reservation'
  AND r.rolbypassrls;

IF v_acl <> 1 THEN
  RAISE EXCEPTION 'FAIL: dono de user_can_cancel_tablet_reservation sem BYPASSRLS — não-recursão quebrada';
END IF;

-- ── 6. Policy UPDATE: usa o helper E mantém isolamento por workspace ────────
SELECT count(*) INTO v_uses_func
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'tablet_reservations'
  AND policyname = 'tablet_reservations_update'
  AND (qual ILIKE '%user_can_cancel_tablet_reservation%' OR with_check ILIKE '%user_can_cancel_tablet_reservation%');

IF v_uses_func <> 1 THEN
  RAISE EXCEPTION 'FAIL: tablet_reservations_update não usa user_can_cancel_tablet_reservation';
END IF;

SELECT count(*) INTO v_uses_ubtw
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'tablet_reservations'
  AND policyname = 'tablet_reservations_update'
  AND (qual ILIKE '%user_belongs_to_workspace%' OR with_check ILIKE '%user_belongs_to_workspace%');

IF v_uses_ubtw <> 1 THEN
  RAISE EXCEPTION 'FAIL: tablet_reservations_update perdeu o isolamento por workspace (user_belongs_to_workspace)';
END IF;

-- ── 7. As demais policies (SELECT/INSERT/DELETE) permanecem com RLS ativa ────
SELECT relrowsecurity INTO v_acl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'tablet_reservations';

IF v_acl IS NOT TRUE THEN
  RAISE EXCEPTION 'FAIL: public.tablet_reservations sem ROW LEVEL SECURITY ativa';
END IF;

-- INSERT continua permitindo membro (criar reserva) — regressão não desejada.
SELECT count(*) INTO v_acl
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'tablet_reservations'
  AND policyname = 'tablet_reservations_insert'
  AND with_check ILIKE '%user_belongs_to_workspace%';

IF v_acl <> 1 THEN
  RAISE EXCEPTION 'FAIL: tablet_reservations_insert deve continuar permitindo membro do workspace';
END IF;

-- DELETE permanece super admin only (hard delete nunca exposto).
SELECT count(*) INTO v_acl
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'tablet_reservations'
  AND policyname = 'tablet_reservations_delete'
  AND (qual ILIKE '%is_super_admin%');

IF v_acl <> 1 THEN
  RAISE EXCEPTION 'FAIL: tablet_reservations_delete deve permanecer super admin only';
END IF;

RAISE NOTICE 'OK: 050 checks passed';

END $$;