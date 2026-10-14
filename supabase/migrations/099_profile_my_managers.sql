-- 099 — exibe o gestor direto do próprio usuário no perfil.
-- A RPC só retorna gestores ligados às memberships ativas de auth.uid().
-- O perfil do gestor não fica exposto por SELECT amplo no cliente.
CREATE OR REPLACE FUNCTION public.get_my_membership_managers()
RETURNS TABLE (
  workspace_id uuid,
  manager_name text,
  manager_role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mine.workspace_id,
    manager_profile.name,
    manager_role.name
  FROM public.memberships AS mine
  JOIN public.memberships AS manager
    ON manager.id = mine.managed_by
   AND manager.workspace_id = mine.workspace_id
   AND manager.status = 'active'
  JOIN public.profiles AS manager_profile
    ON manager_profile.id = manager.profile_id
  LEFT JOIN public.roles AS manager_role
    ON manager_role.id = manager.role_id
  WHERE auth.uid() IS NOT NULL
    AND mine.profile_id = auth.uid()
    AND mine.status = 'active'
    AND mine.managed_by IS NOT NULL;
$$;

COMMENT ON FUNCTION public.get_my_membership_managers() IS
  'Retorna apenas o nome e cargo dos gestores vinculados às memberships ativas do usuário autenticado.';

REVOKE ALL ON FUNCTION public.get_my_membership_managers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_membership_managers() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_membership_managers() TO authenticated;
