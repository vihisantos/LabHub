-- =============================================================================
-- 072: RBAC 2.0 ÔÇö escrita administrativa de memberships POR UNIDADE
--      (configura├º├úo de acesso p├│s-aprova├º├úo, PR #284)
--
-- Contexto:
--   A aprova├º├úo global (#283) autoriza a conta (profiles.status pending ÔåÆ
--   active) e N├âO cria memberships. A etapa seguinte ÔÇö configura├º├úo de acesso ÔÇö
--   precisa de cargo DIFERENTE por unidade (Unidade A ÔåÆ T├®cnico,
--   Unidade B ÔåÆ L├¡der), o que a RPC 052 N├âO expressa: ela recebe um ├║nico
--   role slug para o conjunto inteiro (contrato pinado por teste + docs 9.3;
--   N├âO alterar a 052).
--
-- Esta migration adiciona primitivas singulares (uma membership por chamada),
--   com os mesmos padr├Áes de seguran├ºa da 052/065:
--   - SECURITY DEFINER + SET search_path = public;
--   - SEM GRANT para anon/PUBLIC/authenticated ÔÇö somente service_role executa
--     (o Flask verifica is_super_admin no JWT antes de chamar);
--   - valida├º├úo fail-closed ANTES de qualquer escrita;
--   - `managed_by` NUNCA ├® tocado pelo upsert (rela├º├úo de gest├úo preservada;
--     escrita dedicada em admin_set_manager);
--   - espelho `profiles.workspace_ids` recomputado das memberships ativas na
--     mesma transa├º├úo (compat legada; NUNCA fonte de autoriza├º├úo);
--   - auditoria autom├ítica via trigger trg_app_audit_memberships (054/065):
--     membership_added / membership_changed (prev/new role) /
--     membership_removed ÔÇö nenhum log paralelo.
--
-- Regra de neg├│cio (server-side, n├úo s├│ UI):
--   - conceder/alterar acesso (upsert) e definir gestor exigem conta ATIVA
--     (profiles.status = 'active'): conta pending N├âO recebe membership;
--   - remover acesso n├úo exige conta ativa (limpeza sempre permitida ÔÇö
--     remo├º├úo s├│ reduz acesso).
--
-- IDEMPOT├èNCIA: CREATE OR REPLACE; REVOKE/GRANT idempotentes; replay seguro.
-- =============================================================================

-- =============================================================================
-- 1. admin_upsert_membership(p_user_id, p_workspace_id, p_role_slug)
--    Cria ou atualiza UMA membership (cargo por unidade), sempre como active.
--    Reativar (suspended/removed ÔåÆ active) segue a sem├óntica da 052.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_upsert_membership(
  p_user_id uuid,
  p_workspace_id uuid,
  p_role_slug text
)
RETURNS public.memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_status  text;
  v_row     public.memberships;
BEGIN
  -- Perfil precisa existir.
  SELECT status INTO v_status FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found: %', p_user_id;
  END IF;

  -- S├│ conta ATIVA recebe membership (pending n├úo ganha acesso operacional).
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'profile is not active (status=%)', v_status;
  END IF;

  -- Cargo precisa existir (slug est├ível de public.roles).
  SELECT id INTO v_role_id FROM public.roles WHERE slug = p_role_slug;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'unknown role slug: %', p_role_slug;
  END IF;

  -- Unidade precisa existir (a FK abortaria de qualquer forma; mensagem clara).
  PERFORM 1 FROM public.workspaces WHERE id = p_workspace_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace not found: %', p_workspace_id;
  END IF;

  -- UPSERT da membership (managed_by intocado ÔÇö rela├º├úo de gest├úo preservada).
  INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
  VALUES (p_user_id, p_workspace_id, v_role_id, 'active')
  ON CONFLICT (profile_id, workspace_id) DO UPDATE SET
    role_id    = EXCLUDED.role_id,
    status     = 'active',
    updated_at = now();

  -- Espelho de compatibilidade (mesma transa├º├úo; NUNCA fonte de autoriza├º├úo).
  UPDATE public.profiles
  SET workspace_ids = COALESCE((
        SELECT array_agg(m.workspace_id)
        FROM public.memberships m
        WHERE m.profile_id = p_user_id AND m.status = 'active'
      ), '{}'::uuid[]),
      updated_at = now()
  WHERE id = p_user_id;

  -- Retorno singular (fun├º├úo N├âO-SETOF: SELECT INTO + RETURN).
  SELECT * INTO v_row
  FROM public.memberships
  WHERE profile_id = p_user_id AND workspace_id = p_workspace_id;
  RETURN v_row;
END;
$$;

-- Somente service_role executa (o Flask autoriza is_super_admin no JWT).
REVOKE ALL ON FUNCTION public.admin_upsert_membership(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_membership(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_upsert_membership(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_membership(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.admin_upsert_membership(uuid, uuid, text) IS
  'RBAC 2.0 (072, PR #284): upsert administrativo de UMA membership (cargo por unidade), sempre active. Exige conta active (pending n├úo recebe acesso); preserva managed_by; espelha profiles.workspace_ids na mesma transa├º├úo. Chamado apenas pelo backend (service_role) ap├│s checar is_super_admin no JWT. Auditoria via trigger 054/065.';


-- =============================================================================
-- 2. admin_remove_membership(p_user_id, p_workspace_id)
--    Remove UMA membership (acesso da unidade). Dependentes com managed_by
--    apontando para ela caem para NULL via FK ON DELETE SET NULL (045,
--    fail-closed documentado). Espelho recomputado na mesma transa├º├úo.
--    Idempotente: remover o inexistente retorna false (sem erro).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_remove_membership(
  p_user_id uuid,
  p_workspace_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint := 0;
BEGIN
  -- Perfil precisa existir (a membership pode j├í n├úo existir ÔÇö idempotente).
  PERFORM 1 FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found: %', p_user_id;
  END IF;

  DELETE FROM public.memberships m
  WHERE m.profile_id = p_user_id AND m.workspace_id = p_workspace_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Espelho de compatibilidade (mesma transa├º├úo; NUNCA fonte de autoriza├º├úo).
  UPDATE public.profiles
  SET workspace_ids = COALESCE((
        SELECT array_agg(m.workspace_id)
        FROM public.memberships m
        WHERE m.profile_id = p_user_id AND m.status = 'active'
      ), '{}'::uuid[]),
      updated_at = now()
  WHERE id = p_user_id;

  RETURN v_deleted > 0;
END;
$$;

-- Somente service_role executa (o Flask autoriza is_super_admin no JWT).
REVOKE ALL ON FUNCTION public.admin_remove_membership(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_remove_membership(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_remove_membership(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_membership(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.admin_remove_membership(uuid, uuid) IS
  'RBAC 2.0 (072, PR #284): remo├º├úo administrativa de UMA membership. N├úo exige conta active (limpeza s├│ reduz acesso). Dependentes de managed_by caem para NULL (FK 045). Espelha profiles.workspace_ids na mesma transa├º├úo. service_role only. Auditoria via trigger 054/065.';


-- =============================================================================
-- 3. admin_set_manager(p_user_id, p_workspace_id, p_manager_membership_id)
--    Define (ou limpa, com NULL) o gestor direto (managed_by) da membership da
--    unidade. A guarda estrutural (mesmo workspace, gestor ativo, sem ciclo,
--    sem auto-gest├úo) ├® o trigger trg_memberships_manager_guard (045) ÔÇö a UI
--    nunca ├® mecanismo de seguran├ºa. Exige conta ATIVA (sem config de
--    lideran├ºa em conta pending).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_manager(
  p_user_id uuid,
  p_workspace_id uuid,
  p_manager_membership_id uuid
)
RETURNS public.memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id uuid;
  v_status    text;
  v_row       public.memberships;
BEGIN
  -- Membership alvo precisa existir (resolve por perfil+unidade, sem IDOR por
  -- membership_id arbitr├írio: o chamador endere├ºa (usu├írio, unidade)).
  SELECT m.id INTO v_target_id
  FROM public.memberships m
  WHERE m.profile_id = p_user_id AND m.workspace_id = p_workspace_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found (profile=%, workspace=%)', p_user_id, p_workspace_id;
  END IF;

  -- S├│ conta ATIVA tem lideran├ºa configurada.
  SELECT status INTO v_status FROM public.profiles WHERE id = p_user_id;
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'profile is not active (status=%)', v_status;
  END IF;

  -- Gestor precisa existir quando informado (NULL = sem respons├ível).
  -- Mesma-unidade / gestor-ativo / sem-ciclo: trigger 045 (n├úo duplicar regra).
  IF p_manager_membership_id IS NOT NULL THEN
    PERFORM 1 FROM public.memberships WHERE id = p_manager_membership_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'manager membership not found: %', p_manager_membership_id;
    END IF;
  END IF;

  UPDATE public.memberships
  SET managed_by = p_manager_membership_id,
      updated_at = now()
  WHERE id = v_target_id;

  -- Retorno singular (fun├º├úo N├âO-SETOF: SELECT INTO + RETURN).
  SELECT * INTO v_row FROM public.memberships WHERE id = v_target_id;
  RETURN v_row;
END;
$$;

-- Somente service_role executa (o Flask autoriza is_super_admin no JWT).
REVOKE ALL ON FUNCTION public.admin_set_manager(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_manager(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_manager(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_manager(uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.admin_set_manager(uuid, uuid, uuid) IS
  'RBAC 2.0 (072, PR #284): define/limpa (NULL) o gestor direto da membership da unidade. Exige conta active. Guarda estrutural no trigger 045 (mesmo workspace, gestor ativo, sem ciclo). service_role only. Auditoria via trigger 054/065.';
