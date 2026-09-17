-- =============================================================================
-- 065_rbac2_coordinator_membership_management.sql
-- =============================================================================
-- RBAC 2.0 — FASE 9 (GESTÃO DE MEMBERSHIPS PELO COORDENADOR): ciclo de vida
-- (aprovar/rejeitar/suspender/restaurar/remover), troca de cargo ESCOPOADA e
-- leitura de solicitações pendentes — SEMPRE dentro das unidades do chamador.
--
-- Contexto (Fase 8 deixou apenas a relação de gestão — 047):
--   O coordenador já podia re-parentear `managed_by` (coordinator_set_manager,
--   047) e ler o próprio escopo (get_coordinator_units/leaders/by_manager).
--   FALTAVA o ciclo de vida das memberships da unidade: aprovar/rejeitar uma
--   entrada pendente, suspender/restaurar/remover um membro e ajustar o cargo
--   dentro do conjunto permitido. Tudo isto é AUTORIDADE SERVER-SIDE.
--
-- Decisões (Fase 9, aprovadas):
--   1. RPCs SECURITY DEFINER com autorização EXPLÍCITA e fail-closed por
--      `public.is_coordinator_of(workspace)` (047). A RLS de escrita de
--      memberships permanece super-admin-only (036): o coordenador só age
--      pelos RPCs abaixo.
--   2. Escopo = UNIDADE coordenada (não a árvore): o coordenador administra as
--      memberships da unidade onde tem membership ATIVA de coordenação. Ele não
--      alcança unidades que não coordena, nem a própria membership de
--      coordenação (raiz), nem outro coordenador (par).
--   3. Cargos atribuíveis: tec | vis | est | opv | lider. NUNCA adm nem
--      coordinator (linhas vermelhas): o RPC altera apenas `memberships.role_id`
--      e JAMAIS `profiles.role` (o cargo global do perfil não é tocado).
--   4. Rejeição = NULL não existe: a solicitação pendente é REMOVIDA
--      fisicamente (permissão da Fase 9). O perfil e o usuário Auth permanecem;
--      a trilha fica em `app_audit_logs` (trigger 054, action
--      'membership_removed').
--   5. Suspensão/remoção de quem é GESTOR neutraliza os dependentes
--      (`managed_by = NULL`) — fail-closed: ninguém fica subordinado a uma
--      membership inativa. Restauração NÃO recria `managed_by`.
--   6. AUDITORIA: sem terceira tabela e sem linhas duplicadas. Reutiliza
--      `public.app_audit_logs` (054) via o trigger `audit_memberships_change`,
--      que já distingue aprovação (pending→active), suspensão
--      (active→suspended), restauração (suspended→active), remoção
--      (status→removed), rejeição (DELETE) e troca de cargo
--      (prev_role/new_role). Esta migration APENAS enriquece o `meta` do UPDATE
--      com `managed_by`/`prev_managed_by` (gap da 054) — as `action` existentes
--      NÃO mudam, portanto a visão de auditoria do /admin não é alterada.
--   7. Tentativas NEGADAS não são auditadas por design: os RPCs levantam
--      exception e a transação inteira (incluindo qualquer INSERT de auditoria)
--      é revertida — não há caminho seguro DENTRO da mesma transação para
--      registrar o deny. A cobertura desses caminhos é feita por testes
--      (scripts/validate_rbac2_coordinator_065_dev.py).
--
-- LINHAS VERMELHAS (invariantes da Fase 9):
--   - Coordenador NUNCA: age fora das unidades que coordena; altera a própria
--     membership de coordenação/par; concede adm/coordinator; toca
--     `profiles.role`/`is_super_admin`/permissões globais; apaga usuário Auth
--     ou perfil; cria Super Admin; burla RLS/RBAC.
--   - `coordinator_set_manager` (047) NÃO é recriado nem alterado.
--   - Nenhuma policy/RLS existente é alterada; nenhuma tabela nova.
--
-- IDEMPOTÊNCIA: CREATE OR REPLACE / DROP TRIGGER IF EXISTS / sem tabelas novas.
-- Replay seguro pelo runner. Helpers SECURITY DEFINER com search_path=public e
-- REVOKE anon/PUBLIC + GRANT authenticated (lição 039/040/045/046/047).
-- =============================================================================

-- =============================================================================
-- 1. Auditoria (054) — enriquecimento aditivo do meta do trigger de memberships
--    com managed_by/prev_managed_by. Corpo idêntico ao da 054 exceto pelas duas
--    chaves novas; `action`/`entity` permanecem iguais (/admin inalterado).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.audit_memberships_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_id    uuid := auth.uid();
  v_actor_name  text := '';
  v_target_name text := '';
  v_ws          uuid;
  v_action      text;
  v_meta        jsonb := '{}'::jsonb;
  v_target      uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ws      := OLD.workspace_id;
    v_action  := 'membership_removed';
    v_target  := OLD.profile_id;
    v_meta    := jsonb_build_object('role_id', OLD.role_id, 'status', OLD.status, 'managed_by', OLD.managed_by);
  ELSE
    v_ws     := NEW.workspace_id;
    v_target := NEW.profile_id;
    v_meta   := jsonb_build_object(
      'role_id', NEW.role_id,
      'status', NEW.status,
      'prev_role', CASE WHEN TG_OP = 'UPDATE' THEN OLD.role_id ELSE NULL END,
      'prev_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      'managed_by', NEW.managed_by,
      'prev_managed_by', CASE WHEN TG_OP = 'UPDATE' THEN OLD.managed_by ELSE NULL END
    );
    v_action := CASE WHEN TG_OP = 'INSERT' THEN 'membership_added' ELSE 'membership_changed' END;
  END IF;

  IF v_actor_id IS NOT NULL THEN
    SELECT name INTO v_actor_name FROM public.profiles WHERE id = v_actor_id;
  END IF;
  SELECT name INTO v_target_name FROM public.profiles WHERE id = v_target;

  INSERT INTO public.app_audit_logs
    (workspace_id, actor_id, actor_name, action, entity, entity_id, entity_label, meta)
  VALUES
    (v_ws, v_actor_id, COALESCE(v_actor_name, ''), v_action, 'user',
     v_target::text, COALESCE(v_target_name, ''), v_meta);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.audit_memberships_change() IS
  'RBAC 2.0 (054+065): auditoria append-only de memberships em app_audit_logs. '
  'Membro adicionado/alterado/removido; o meta de UPDATE inclui prev/new status, '
  'prev/new role e (065) prev/new managed_by. `action` inalterada (compat /admin).';

-- =============================================================================
-- 2. coordinator_get_requests(p_workspace_id) — solicitações PENDENTES da
--    unidade, e somente se o chamador coordena ativamente a unidade.
--    Fonte de verdade = memberships (nunca profiles.workspace_ids legado).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coordinator_get_requests(p_workspace_id uuid)
RETURNS SETOF public.memberships
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.*
  FROM public.memberships m
  WHERE m.workspace_id = p_workspace_id
    AND m.status = 'pending'
    AND public.is_coordinator_of(p_workspace_id)
  ORDER BY m.created_at ASC;
$$;

COMMENT ON FUNCTION public.coordinator_get_requests(uuid) IS
  'RBAC 2.0 (065): SETOF das memberships PENDING de uma unidade. Fail-closed: só um coordenador ATIVO da unidade (is_coordinator_of, 047) recebe linhas; caso contrário, vazio.';

-- =============================================================================
-- 3. coordinator_approve_membership(p_membership_id) — pending → active.
--    Escopo: unidade do alvo coordenada pelo chamador. O perfil precisa existir,
--    estar ativo e não ser Super Admin (Super Admin não recebe membership).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coordinator_approve_membership(p_membership_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws          uuid;
  v_status      text;
  v_profile_id  uuid;
  v_pf_status   text;
  v_is_super    boolean;
BEGIN
  SELECT m.workspace_id, m.status, m.profile_id
  INTO v_ws, v_status, v_profile_id
  FROM public.memberships m
  WHERE m.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found';
  END IF;

  IF NOT public.is_coordinator_of(v_ws) THEN
    RAISE EXCEPTION 'only an active coordinator of this unit can approve memberships';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'only pending memberships can be approved (found %)', v_status;
  END IF;

  SELECT status, is_super_admin INTO v_pf_status, v_is_super
  FROM public.profiles WHERE id = v_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target profile not found';
  END IF;
  IF v_is_super THEN
    RAISE EXCEPTION 'super admin is an administrative category, not a membership';
  END IF;
  IF v_pf_status <> 'active' THEN
    RAISE EXCEPTION 'target profile must be active (found %)', v_pf_status;
  END IF;

  UPDATE public.memberships
     SET status = 'active',
         updated_at = now()
   WHERE id = p_membership_id;
END;
$$;

COMMENT ON FUNCTION public.coordinator_approve_membership(uuid) IS
  'RBAC 2.0 (065): aprova uma membership PENDING da unidade (= pending→active). Autorização: coordenador ativo da unidade. Perfil precisa estar ativo e não ser Super Admin.';

-- =============================================================================
-- 4. coordinator_reject_membership(p_membership_id) — rejeita a PENDING,
--    removendo-a fisicamente. NÃO remove profile nem usuário Auth (dados
--    globais permanecem); a trilha fica em app_audit_logs (trigger 054).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coordinator_reject_membership(p_membership_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws     uuid;
  v_status text;
BEGIN
  SELECT workspace_id, status INTO v_ws, v_status
  FROM public.memberships
  WHERE id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found';
  END IF;

  IF NOT public.is_coordinator_of(v_ws) THEN
    RAISE EXCEPTION 'only an active coordinator of this unit can reject membership requests';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'only pending memberships can be rejected (found %)', v_status;
  END IF;

  DELETE FROM public.memberships WHERE id = p_membership_id;
END;
$$;

COMMENT ON FUNCTION public.coordinator_reject_membership(uuid) IS
  'RBAC 2.0 (065): rejeita uma solicitação PENDING removendo a membership. Não apaga profile/usuário Auth; a trilha fica em app_audit_logs (membership_removed). Autorização: coordenador ativo da unidade.';

-- =============================================================================
-- 5. coordinator_suspend_membership(p_membership_id) — active → suspended.
--    Se o alvo é GESTOR, os dependentes são neutralizados (managed_by = NULL).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coordinator_suspend_membership(p_membership_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws     uuid;
  v_status text;
BEGIN
  SELECT workspace_id, status INTO v_ws, v_status
  FROM public.memberships
  WHERE id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found';
  END IF;

  IF NOT public.is_coordinator_of(v_ws) THEN
    RAISE EXCEPTION 'only an active coordinator of this unit can suspend memberships';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'only active memberships can be suspended (found %)', v_status;
  END IF;

  -- Fail-closed: ninguém permanece subordinado a uma membership suspensa.
  UPDATE public.memberships
     SET managed_by = NULL,
         updated_at = now()
   WHERE managed_by = p_membership_id;

  UPDATE public.memberships
     SET status = 'suspended',
         updated_at = now()
   WHERE id = p_membership_id;
END;
$$;

COMMENT ON FUNCTION public.coordinator_suspend_membership(uuid) IS
  'RBAC 2.0 (065): suspende uma membership ATIVA da unidade (= active→suspended) e neutraliza os dependentes (managed_by = NULL). Autorização: coordenador ativo da unidade.';

-- =============================================================================
-- 6. coordinator_restore_membership(p_membership_id) — suspended → active.
--    NÃO restaura managed_by automaticamente (a estrutura é reconstruída pelo
--    coordenador via coordinator_set_manager, 047).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coordinator_restore_membership(p_membership_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws     uuid;
  v_status text;
BEGIN
  SELECT workspace_id, status INTO v_ws, v_status
  FROM public.memberships
  WHERE id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found';
  END IF;

  IF NOT public.is_coordinator_of(v_ws) THEN
    RAISE EXCEPTION 'only an active coordinator of this unit can restore memberships';
  END IF;

  IF v_status <> 'suspended' THEN
    RAISE EXCEPTION 'only suspended memberships can be restored (found %)', v_status;
  END IF;

  UPDATE public.memberships
     SET status = 'active',
         updated_at = now()
   WHERE id = p_membership_id;
END;
$$;

COMMENT ON FUNCTION public.coordinator_restore_membership(uuid) IS
  'RBAC 2.0 (065): restaura uma membership SUSPENSA da unidade (= suspended→active). Não recria managed_by (relação reconstruída via coordinator_set_manager, 047). Autorização: coordenador ativo da unidade.';

-- =============================================================================
-- 7. coordinator_remove_membership(p_membership_id) — active → removed.
--    NÃO apaga perfil/usuário; preserva a linha (histórico consultável) e
--    neutraliza os dependentes se o alvo for gestor.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coordinator_remove_membership(p_membership_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws     uuid;
  v_status text;
BEGIN
  SELECT workspace_id, status INTO v_ws, v_status
  FROM public.memberships
  WHERE id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found';
  END IF;

  IF NOT public.is_coordinator_of(v_ws) THEN
    RAISE EXCEPTION 'only an active coordinator of this unit can remove memberships';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'only active memberships can be removed (found %)', v_status;
  END IF;

  -- Fail-closed: ninguém permanece subordinado a uma membership removida.
  UPDATE public.memberships
     SET managed_by = NULL,
         updated_at = now()
   WHERE managed_by = p_membership_id;

  UPDATE public.memberships
     SET status = 'removed',
         updated_at = now()
   WHERE id = p_membership_id;
END;
$$;

COMMENT ON FUNCTION public.coordinator_remove_membership(uuid) IS
  'RBAC 2.0 (065): remove uma membership ATIVA da unidade (= active→removed), preservando a linha/perfil/usuário (histórico consultável) e neutralizando dependentes (managed_by = NULL). Autorização: coordenador ativo da unidade.';

-- =============================================================================
-- 8. coordinator_set_role(p_membership_id, p_role_slug) — troca ESCOPOADA do
--    cargo da membership. Permitidos: tec | vis | est | opv | lider.
--    NUNCA adm/coordinator; NUNCA toca profiles.role. Alvo não pode ser a
--    membership de coordenação (raiz) nem outro coordenador (par). Trocar para
--    um cargo NÃO-liderança neutraliza os dependentes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coordinator_set_role(
  p_membership_id uuid,
  p_role_slug     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws          uuid;
  v_status      text;
  v_target_slug text;
  v_role_id     uuid;
BEGIN
  -- Linha vermelha: cargos que um coordenador NUNCA pode conceder/trocar.
  IF p_role_slug IS NULL OR p_role_slug NOT IN ('tec', 'vis', 'est', 'opv', 'lider') THEN
    RAISE EXCEPTION 'role % cannot be assigned by a coordinator', p_role_slug;
  END IF;

  SELECT m.workspace_id, m.status, r.slug
  INTO v_ws, v_status, v_target_slug
  FROM public.memberships m
  JOIN public.roles r ON r.id = m.role_id
  WHERE m.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found';
  END IF;

  IF NOT public.is_coordinator_of(v_ws) THEN
    RAISE EXCEPTION 'only an active coordinator of this unit can change membership roles';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'only active memberships can have their role changed (found %)', v_status;
  END IF;

  -- Coordenação é a RAIZ da unidade e pares não se rebaixam/promovem por RPC.
  IF v_target_slug = 'coordinator' THEN
    RAISE EXCEPTION 'a coordination membership role cannot be changed by the RPC';
  END IF;

  SELECT r.id INTO v_role_id FROM public.roles r WHERE r.slug = p_role_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target role % not found', p_role_slug;
  END IF;

  -- Fail-closed: sair de liderança deixa de gerir a equipe.
  IF p_role_slug <> 'lider' THEN
    UPDATE public.memberships
       SET managed_by = NULL,
           updated_at = now()
     WHERE managed_by = p_membership_id;
  END IF;

  -- Só a membership muda: `profiles.role` (cargo global) é intocado.
  UPDATE public.memberships
     SET role_id = v_role_id,
         updated_at = now()
   WHERE id = p_membership_id;
END;
$$;

COMMENT ON FUNCTION public.coordinator_set_role(uuid, text) IS
  'RBAC 2.0 (065): troca o cargo de uma membership ATIVA da unidade. Permitidos tec|vis|est|opv|lider; NUNCA adm/coordinator. Não toca profiles.role. Alvo não pode ser coordenação (raiz/par). Sair de liderança neutraliza dependentes (managed_by = NULL). Autorização: coordenador ativo da unidade.';

-- =============================================================================
-- 9. ACL: somente authenticated; anon/PUBLIC revogado (lição 039).
--    coordinator_set_manager (047) permanece como está — não é recriado.
-- =============================================================================

REVOKE ALL ON FUNCTION public.coordinator_get_requests(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_get_requests(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.coordinator_approve_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_approve_membership(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.coordinator_reject_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_reject_membership(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.coordinator_suspend_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_suspend_membership(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.coordinator_restore_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_restore_membership(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.coordinator_remove_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_remove_membership(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.coordinator_set_role(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_set_role(uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.coordinator_get_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordinator_approve_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordinator_reject_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordinator_suspend_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordinator_restore_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordinator_remove_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordinator_set_role(uuid, text) TO authenticated;
