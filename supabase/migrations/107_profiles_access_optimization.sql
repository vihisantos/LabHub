-- 107_profiles_access_optimization.sql
-- Auditoria de acessos a public.profiles — otimizacao de RLS e helpers.
--
-- Objetivo: reduzir reavaliacao por linha de funcoes de autenticacao e
-- consultas redundantes a public.profiles, sem alterar semantica de
-- autorizacao (RBAC 2.0, RLS, isolamento por workspace, super admin).
--
-- Mudancas:
--   1. auth.uid() passa a ser avaliado via (select auth.uid()) dentro dos
--      helpers SECURITY DEFINER, permitindo initplan (uma vez por statement).
--   2. Chamadas sem argumento (is_super_admin) passam a ser envolvidas por
--      (select ...) nas policies de profiles, evitando reexecucao por linha.
--   3. Nenhuma policy e removida; nenhuma coluna/tabela/index e alterado.
--   4. Nenhum enfraquecimento de RLS: predicados equivalentes.

-- ---------------------------------------------------------------------------
-- 1. Helpers (recriacao semantica equivalente, auth.uid() via subselect)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT p.is_super_admin FROM public.profiles p WHERE p.id = (SELECT auth.uid())),
    false
  )
$function$;

CREATE OR REPLACE FUNCTION public.profile_visible_to_me(target_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT target_user IS NOT NULL AND (
    target_user = (SELECT auth.uid())
    OR COALESCE((
      SELECT p.is_super_admin
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
    ), false)
    OR EXISTS (
      SELECT 1
      FROM public.memberships m_mine
      JOIN public.memberships m_other
        ON m_other.workspace_id = m_mine.workspace_id
      WHERE m_mine.profile_id = (SELECT auth.uid())
        AND m_mine.status = 'active'
        AND m_other.profile_id = target_user
        AND m_other.status = 'active'
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ws_id IS NOT NULL
     AND ws_id <> ''
     AND EXISTS (
       SELECT 1
       FROM public.memberships m
       WHERE m.profile_id = (SELECT auth.uid())
         AND m.workspace_id::text = ws_id
         AND m.status = 'active'
     )
$function$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ws_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.memberships m
       WHERE m.profile_id = (SELECT auth.uid())
         AND m.workspace_id = ws_id
         AND m.status = 'active'
     )
$function$;

-- ---------------------------------------------------------------------------
-- 2. Policies de public.profiles (recriacao com (select auth.uid()) e
--    (select is_super_admin()) para evitar reavaliacao por linha)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    (id = (SELECT auth.uid()))
    OR (SELECT public.is_super_admin())
    OR public.profile_visible_to_me(id)
  );

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    ((SELECT auth.uid()) = id)
    OR (SELECT public.is_super_admin())
  );

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    ((SELECT auth.uid()) = id)
    OR (SELECT public.is_super_admin())
  )
  WITH CHECK (
    ((SELECT auth.uid()) = id)
    OR (SELECT public.is_super_admin())
  );

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete"
  ON public.profiles FOR DELETE
  TO authenticated
  USING ((SELECT public.is_super_admin()));

-- Politicas administrativas (super admin) — mesma otimizacao.
DROP POLICY IF EXISTS "admin_abs_edit_profiles" ON public.profiles;
CREATE POLICY "admin_abs_edit_profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS "admin_abs_delete_profiles" ON public.profiles;
CREATE POLICY "admin_abs_delete_profiles"
  ON public.profiles FOR DELETE
  TO authenticated
  USING ((SELECT public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- ROLLBACK (executar manualmente apenas em emergência, em ordem):
--   1. Recriar policies originais (044/067/073):
--      profiles_select  : USING (id = auth.uid() OR is_super_admin() OR profile_visible_to_me(id))
--      profiles_insert  : WITH CHECK (auth.uid() = id OR is_super_admin())
--      profiles_update  : USING/CHECK (auth.uid() = id OR is_super_admin())
--      profiles_delete  : USING (is_super_admin())
--      admin_abs_edit_profiles   : USING/CHECK (is_super_admin())
--      admin_abs_delete_profiles : USING (is_super_admin())
--   2. Recriar helpers originais com auth.uid() direto (sem subselect).
--   3. Reverter commits frontend (ThemeContext polling 15s; auth service).
-- Nenhuma coluna, tabela ou índice é alterado por esta migration.
