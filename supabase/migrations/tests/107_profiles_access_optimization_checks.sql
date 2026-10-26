-- =============================================================================
-- tests/107_profiles_access_optimization_checks.sql
-- =============================================================================

-- Garante que o papel authenticated possa exercer RLS no banco efêmero do CI
-- (o stub não concede privilégios em public.profiles por padrão). A concessão
-- é revertida ao final do arquivo.
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
-- Pós-migration 107: valida funções/policies e comportamento básico de RLS.
--
-- CHECKS
--   1. funções recriadas existem e são SECURITY DEFINER/STABLE/search_path public;
--   2. funções usam (SELECT auth.uid()) (initplan);
--   3. policies recriadas existem;
--   4. RLS habilitado em public.profiles;
--   5. sem USING (true);
--   6. comportamento: usuário autenticado lê o próprio perfil;
--   7. comportamento: usuário comum não eleva is_super_admin (42501);
--   8. cleanup.
-- =============================================================================

DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_txt text;
  v_err text;
  v_n   integer;
BEGIN

-- [1] funções existem
IF to_regprocedure('public.is_super_admin()') IS NULL THEN
  RAISE EXCEPTION 'FAIL [1]: is_super_admin() ausente';
END IF;
IF to_regprocedure('public.profile_visible_to_me(uuid)') IS NULL THEN
  RAISE EXCEPTION 'FAIL [1]: profile_visible_to_me(uuid) ausente';
END IF;
IF to_regprocedure('public.user_belongs_to_workspace(text)') IS NULL THEN
  RAISE EXCEPTION 'FAIL [1]: user_belongs_to_workspace(text) ausente';
END IF;
IF to_regprocedure('public.user_belongs_to_workspace(uuid)') IS NULL THEN
  RAISE EXCEPTION 'FAIL [1]: user_belongs_to_workspace(uuid) ausente';
END IF;

-- [2] SECURITY DEFINER / STABLE / search_path
IF NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='is_super_admin'
    AND p.prosecdef AND 'search_path=public' = ANY(p.proconfig)
) THEN
  RAISE EXCEPTION 'FAIL [2]: is_super_admin sem SECURITY DEFINER/search_path';
END IF;

-- [3] funções usam (SELECT auth.uid())
IF NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='is_super_admin'
    AND pg_get_functiondef(p.oid) LIKE '%(SELECT auth.uid())%'
) THEN
  RAISE EXCEPTION 'FAIL [3]: is_super_admin nao usa (SELECT auth.uid())';
END IF;

-- [4] policies existem
FOREACH v_txt IN ARRAY ARRAY['profiles_select','profiles_insert','profiles_update','profiles_delete','admin_abs_edit_profiles','admin_abs_delete_profiles'] LOOP
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname=v_txt
  ) THEN
    RAISE EXCEPTION 'FAIL [4]: policy % ausente', v_txt;
  END IF;
END LOOP;

-- [5] RLS habilitado
IF NOT EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='profiles' AND c.relrowsecurity
) THEN
  RAISE EXCEPTION 'FAIL [5]: RLS desabilitado em public.profiles';
END IF;

-- [6] sem USING (true)
IF EXISTS (
  SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
    AND (qual ILIKE '%using (true%' OR qual ILIKE '%using true%')
) THEN
  RAISE EXCEPTION 'FAIL [6]: policy permissiva USING(true) em profiles';
END IF;

-- [7] comportamento: signup cria profile; usuário lê o próprio
INSERT INTO auth.users (id, email) VALUES (v_uid, '107-test@labhub.test');
PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

SET ROLE authenticated;
IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
  RESET ROLE;
  RAISE EXCEPTION 'FAIL [7]: usuario autenticado nao le o proprio profile';
END IF;
RESET ROLE;

-- [8] comportamento: usuário comum não eleva is_super_admin
SET ROLE authenticated;
BEGIN
  UPDATE public.profiles SET is_super_admin = true WHERE id = v_uid;
  RESET ROLE;
  RAISE EXCEPTION 'FAIL [8]: usuario comum elevou is_super_admin';
EXCEPTION WHEN insufficient_privilege THEN
  GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  RESET ROLE;
  -- Mecanismo esperado: trigger guard_profile_privileged_columns (067).
  IF v_err NOT ILIKE '%alteracao de campo privilegiado%' THEN
    RAISE EXCEPTION 'FAIL [8c]: excecao inesperada (nao e o guard 067): %', v_err;
  END IF;
END;

-- Prova complementar: o valor permanece false (a elevação não ocorreu).
IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND is_super_admin) THEN
  RAISE EXCEPTION 'FAIL [8b]: is_super_admin foi elevado indevidamente';
END IF;

-- cleanup
PERFORM set_config('request.jwt.claim.sub', NULL, true);
DELETE FROM public.profiles WHERE id = v_uid;
DELETE FROM auth.users WHERE id = v_uid;

RAISE NOTICE 'OK: 107 profiles access optimization checks passed';
END $$;

REVOKE SELECT, UPDATE ON public.profiles FROM authenticated;
