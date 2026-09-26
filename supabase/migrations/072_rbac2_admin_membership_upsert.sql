-- =============================================================================
-- 072: RBAC 2.0 — escrita administrativa de memberships POR UNIDADE
--      (configuração de acesso pós-aprovação, PR #284)
--
-- Contexto:
--   A aprovação global (#283) autoriza a conta (profiles.status pending →
--   active) e NÃO cria memberships. A etapa seguinte — configuração de acesso —
--   precisa de cargo DIFERENTE por unidade (Unidade A → Técnico,
--   Unidade B → Líder), o que a RPC 052 NÃO expressa: ela recebe um único
--   role slug para o conjunto inteiro (contrato pinado por teste + docs 9.3;
--   NÃO alterar a 052).
--
-- Esta migration adiciona primitivas singulares (uma membership por chamada),
--   com os mesmos padrões de segurança da 052/065:
--   - SECURITY DEFINER + SET search_path = public;
--   - SEM GRANT para anon/PUBLIC/authenticated — somente service_role executa
--     (o Flask verifica is_super_admin no JWT antes de chamar);
--   - validação fail-closed ANTES de qualquer escrita;
--   - `managed_by` NUNCA é tocado pelo upsert (relação de gestão preservada;
--     escrita dedicada em admin_set_manager);
--   - espelho `profiles.workspace_ids` recomputado das memberships ativas na
--     mesma transação (compat legada; NUNCA fonte de autorização);
--   - auditoria automática via trigger trg_app_audit_memberships (054/065):
--     membership_added / membership_changed (prev/new role) /
--     membership_removed — nenhum log paralelo.
--
-- Regra de negócio (server-side, não só UI):
--   - conceder/alterar acesso (upsert) e definir gestor exigem conta ATIVA
--     (profiles.status = 'active'): conta pending NÃO recebe membership;
--   - remover acesso não exige conta ativa (limpeza sempre permitida —
--     remoção só reduz acesso).
--
-- IDEMPOTÊNCIA: CREATE OR REPLACE; REVOKE/GRANT idempotentes; replay seguro.
-- =============================================================================

-- =============================================================================
-- 1. admin_upsert_membership(p_user_id, p_workspace_id, p_role_slug)
--    Cria ou atualiza UMA membership (cargo por unidade), sempre como active.
--    Reativar (suspended/removed → active) segue a semântica da 052.
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

  -- Só conta ATIVA recebe membership (pending não ganha acesso operacional).
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'profile is not active (status=%)', v_status;
  END IF;

  -- Cargo precisa existir (slug estável de public.roles).
  SELECT id INTO v_role_id FROM public.roles WHERE slug = p_role_slug;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'unknown role slug: %', p_role_slug;
  END IF;

  -- Unidade precisa existir (a FK abortaria de qualquer forma; mensagem clara).
  PERFORM 1 FROM public.workspaces WHERE id = p_workspace_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace not found: %', p_workspace_id;
  END IF;

  -- UPSERT da membership (managed_by intocado — relação de gestão preservada).
  INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
  VALUES (p_user_id, p_workspace_id, v_role_id, 'active')
  ON CONFLICT (profile_id, workspace_id) DO UPDATE SET
    role_id    = EXCLUDED.role_id,
    status     = 'active',
    updated_at = now();

  -- Espelho de compatibilidade (mesma transação; NUNCA fonte de autorização).
  UPDATE public.profiles
  SET workspace_ids = COALESCE((
        SELECT array_agg(m.workspace_id)
        FROM public.memberships m
        WHERE m.profile_id = p_user_id AND m.status = 'active'
      ), '{}'::uuid[]),
      updated_at = now()
  WHERE id = p_user_id;

  -- Retorno singular (função NÃO-SETOF: SELECT INTO + RETURN, nunca
  -- RETURN QUERY — erro 42804).
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
  'RBAC 2.0 (072, PR #284): upsert administrativo de UMA membership (cargo por unidade), sempre active. Exige conta active (pending não recebe acesso); preserva managed_by; espelha profiles.workspace_ids na mesma transação. Chamado apenas pelo backend (service_role) após checar is_super_admin no JWT. Auditoria via trigger 054/065.';


-- =============================================================================
-- 2. admin_remove_membership(p_user_id, p_workspace_id)
--    Remove UMA membership (acesso da unidade). Dependentes com managed_by
--    apontando para ela caem para NULL via FK ON DELETE SET NULL (045,
--    fail-closed documentado). Espelho recomputado na mesma transação.
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
  -- Perfil precisa existir (a membership pode já não existir — idempotente).
  PERFORM 1 FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found: %', p_user_id;
  END IF;

  DELETE FROM public.memberships m
  WHERE m.profile_id = p_user_id AND m.workspace_id = p_workspace_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Espelho de compatibilidade (mesma transação; NUNCA fonte de autorização).
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
  'RBAC 2.0 (072, PR #284): remoção administrativa de UMA membership. Não exige conta active (limpeza só reduz acesso). Dependentes de managed_by caem para NULL (FK 045). Espelha profiles.workspace_ids na mesma transação. service_role only. Auditoria via trigger 054/065.';


-- =============================================================================
-- 3. admin_set_manager(p_user_id, p_workspace_id, p_manager_membership_id)
--    Define (ou limpa, com NULL) o gestor direto (managed_by) da membership da
--    unidade. A guarda estrutural (mesmo workspace, gestor ativo, sem ciclo,
--    sem auto-gestão) é o trigger trg_memberships_manager_guard (045) — a UI
--    nunca é mecanismo de segurança. Exige conta ATIVA (sem config de
--    liderança em conta pending).
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
  -- membership_id arbitrário: o chamador endereça (usuário, unidade)).
  SELECT m.id INTO v_target_id
  FROM public.memberships m
  WHERE m.profile_id = p_user_id AND m.workspace_id = p_workspace_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found (profile=%, workspace=%)', p_user_id, p_workspace_id;
  END IF;

  -- Só conta ATIVA tem liderança configurada.
  SELECT status INTO v_status FROM public.profiles WHERE id = p_user_id;
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'profile is not active (status=%)', v_status;
  END IF;

  -- Gestor precisa existir quando informado (NULL = sem responsável).
  -- Mesma-unidade / gestor-ativo / sem-ciclo: trigger 045 (não duplicar regra).
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

  -- Retorno singular (função NÃO-SETOF: SELECT INTO + RETURN, nunca
  -- RETURN QUERY — erro 42804).
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
