-- =============================================================================
-- tests/052_admin_set_memberships.sql
-- =============================================================================
-- Asserções da Fase 9.2-C (migration 052): escrita administrativa atômica.
--  1. Função existe: admin_set_user_memberships(uuid, uuid[], text).
--  2. Transacional: memberships + espelho profiles.workspace_ids na mesma
--     função (marcadores); managed_by nunca tocado; reativa como active.
--  3. Validação antes de escrever: perfil inexistente / slug desconhecido
--     abrem exceção (marcadores).
--  4. ACL: somente service_role; anon/PUBLIC/authenticated revogados.
--
-- How to run: paste into the Supabase SQL Editor (or psql) AFTER 052 is applied.
-- Every check raises an exception on drift; a clean run ends with
-- "OK: 052 admin set memberships checks passed".
--
-- Behavior checks (diff/insert/delete/mirror/managed_by preservado) dependem
-- de dados — execute adicionalmente em staging com service_role; aqui os
-- checks são estruturais/catálogo.
-- =============================================================================

DO $$
DECLARE
  v_count integer;
  v_def   text;
BEGIN

-- ── 1. A função existe com a assinatura exata ─────────────────────────────────
SELECT count(*) INTO v_count
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname = 'admin_set_user_memberships'
  AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_workspace_ids uuid[], p_role_slug text';

IF v_count <> 1 THEN
  RAISE EXCEPTION 'FAIL: admin_set_user_memberships signature drifted (expected 1, found %)', v_count;
END IF;

SELECT pg_get_functiondef(p.oid) INTO v_def
FROM pg_proc p
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public' AND p.proname = 'admin_set_user_memberships';

-- ── 2. Transacional: memberships + espelho no mesmo corpo ─────────────────────
IF v_def NOT LIKE '%DELETE FROM public.memberships%' THEN
  RAISE EXCEPTION 'FAIL: missing DELETE of removed memberships';
END IF;
IF v_def NOT LIKE '%INSERT INTO public.memberships%' THEN
  RAISE EXCEPTION 'FAIL: missing INSERT of new memberships';
END IF;
IF v_def NOT LIKE '%UPDATE public.profiles%SET workspace_ids%' THEN
  RAISE EXCEPTION 'FAIL: missing profiles.workspace_ids mirror in the same function';
END IF;

-- ── 3. managed_by nunca tocado; concessões voltam como active ─────────────────
IF v_def LIKE '%managed_by =%' OR v_def LIKE '%SET managed_by%' THEN
  RAISE EXCEPTION 'FAIL: function must never write managed_by';
END IF;
IF v_def NOT LIKE '%status = ''active''%' AND v_def NOT LIKE '%status=''active''%' THEN
  RAISE EXCEPTION 'FAIL: grants must reactivate as active';
END IF;

-- ── 4. Validação antes de qualquer escrita ────────────────────────────────────
IF v_def NOT LIKE '%profile not found%' THEN
  RAISE EXCEPTION 'FAIL: missing profile-exists guard';
END IF;
IF v_def NOT LIKE '%unknown role slug%' THEN
  RAISE EXCEPTION 'FAIL: missing unknown-slug guard';
END IF;

-- ── 5. SECURITY DEFINER com search_path travado ───────────────────────────────
IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
  RAISE EXCEPTION 'FAIL: function must be SECURITY DEFINER';
END IF;
IF v_def NOT LIKE '%SET search_path = public%' THEN
  RAISE EXCEPTION 'FAIL: function must pin search_path=public';
END IF;

-- ── 6. ACL: somente service_role ──────────────────────────────────────────────
SELECT count(*) INTO v_count
FROM information_schema.role_routine_grants g
JOIN pg_proc p ON p.proname = g.routine_name
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname = 'admin_set_user_memberships'
  AND g.grantee = 'service_role'
  AND g.privilege_type = 'EXECUTE';

IF v_count < 1 THEN
  RAISE EXCEPTION 'FAIL: service_role must hold EXECUTE on admin_set_user_memberships';
END IF;

SELECT count(*) INTO v_count
FROM information_schema.role_routine_grants g
JOIN pg_proc p ON p.proname = g.routine_name
JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
WHERE nsp.nspname = 'public'
  AND p.proname = 'admin_set_user_memberships'
  AND g.grantee IN ('anon', 'authenticated', 'PUBLIC');

IF v_count > 0 THEN
  RAISE EXCEPTION 'FAIL: anon/PUBLIC/authenticated must not execute admin_set_user_memberships (found %)', v_count;
END IF;

RAISE NOTICE 'OK: 052 admin set memberships checks passed';
END $$;
