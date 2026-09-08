-- =============================================================================
-- 047_rbac2_coordinator_scope.sql
-- =============================================================================
-- RBAC 2.0 — FASE 8 (GESTÃO DO COORDENADOR / SCOPE coordination): ESCOPO DO
-- COORDENADOR NO BANCO + ESCRITA ESCOPOADA DA RELAÇÃO DE GESTÃO.
--
-- Contexto (mapa Fase 8.1):
--   A Fase 7.7 fechou a base da liderança-como-relação: `memberships.managed_by`
--   com trigger guarda server-side (046) e leitura escopada `get_leader_team`
--   (só cargo 'lider'). Isto FALTAVA para o coordenador:
--     a) NÃO existia predicado "é coordenador desta unidade" (`is_coordinator_of`);
--     b) NÃO existia leitura escopada do escopo de coordenação (unidades que
--        coordeno → lideranças subordinadas → equipes das lideranças);
--     c) A escrita de `managed_by` era super-admin-only (036 RLS) e não havia
--        caminho para o coordenador montar/ajustar a estrutura DENTRO das
--        próprias unidades.
--
-- Decisões (Fase 8.2, aprovadas):
--   1. ESCRITA ESCOPOADA VIA RPC: `coordinator_set_manager(membership, manager)`
--      — o coordenador re-parenta memberships nas unidades onde tem membership
--      ATIVA de coordenação; a criação de memberships/cargos continua
--      super-admin-only (036). O RPC é SECURITY DEFINER com autorização
--      explícita (não afrouxa RLS) e DELEGA a validação estrutural à trigger
--      guarda 046 (mesmo workspace, gestor ativo e de liderança, sem ciclos,
--      sem lider→lider). `NULL` remove o membro da equipe.
--   2. LEITURA ESCOPOADA via RPCs SETOF / predicado (fail-closed por
--      auth.uid() + cargo 'coordinator' + status active) — a UI NÃO decide
--      escopo.
--   3. Ações de chamados (ticket.* do seed 040) FICAM FORA desta fase (motor
--      já ativo); a tela do coordenador é real e honesta (dados de escopo),
--      sem CTAs falsos de gestão (a gestão via RPC é capacidade do serviço;
--      a UI de gestão vem em fase própria).
--
-- LINHAS VERMELHAS (invariantes da Fase 8):
--   - Coordenação = escopo sobre MEMBERSHIPS/workspaces, NUNCA permissão
--     global; `is_super_admin` continua categoria administrativa separada.
--   - coordinator_set_manager NÃO cria memberships nem altera cargos/status
--     (só managed_by); criação/remoção de memberships segue 036/041 (admin).
--   - A membership de coordenação é RAIZ da unidade: não pode ter gestor
--     (nem ser re-parenteada por este RPC) e não gerencia outra membership de
--     coordenação (coordenadores são pares na mesma unidade).
--   - Gestão restrita à própria árvore: novo gestor = a própria membership de
--     coordenação OU uma liderança já subordinada direta a ela na mesma
--     unidade (`manager.managed_by = coord`). Nada de atravessar o trabalho de
--     outro coordenador da unidade.
--   - RLS de escrita de memberships permanece super-admin-only (036): o RPC é
--     o ÚNICO caminho escopado para `managed_by`.
--
-- IDEMPOTÊNCIA: CREATE OR REPLACE / sem tabelas novas / sem policy — replay
-- seguro pelo runner. Helpers SECURITY DEFINER com search_path=public e
-- REVOKE anon/PUBLIC + GRANT authenticated (lição 039/040/045/046).
-- =============================================================================

-- =============================================================================
-- 1. Predicado is_coordinator_of(p_workspace_id) — o chamador tem membership
--    ATIVA de coordenação na unidade (base de qualquer policy/RPC futura).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_coordinator_of(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.roles r     ON r.id = m.role_id
    JOIN public.profiles pf ON pf.id = m.profile_id
    WHERE m.workspace_id = p_workspace_id
      AND pf.id = auth.uid()
      AND m.status = 'active'
      AND r.slug = 'coordinator'
  );
$$;

-- =============================================================================
-- 2. get_coordinator_units() — SETOF das memberships ATIVAS de coordenação do
--    chamador (as unidades sob a coordenação dele). Fail-closed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_coordinator_units()
RETURNS SETOF public.memberships
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.*
  FROM public.memberships m
  JOIN public.profiles pf ON pf.id = m.profile_id
  JOIN public.roles r     ON r.id = m.role_id
  WHERE pf.id = auth.uid()
    AND m.status = 'active'
    AND r.slug = 'coordinator'
  ORDER BY m.created_at ASC;
$$;

-- =============================================================================
-- 3. get_coordinator_leaders(p_workspace_id) — SETOF das memberships da unidade
--    geridas DIRETAMENTE pela membership de coordenação do chamador naquela
--    unidade (lideranças e subordinações diretas). Fail-closed: quem não é
--    coordenador ativo da unidade recebe conjunto vazio.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_coordinator_leaders(p_workspace_id uuid)
RETURNS SETOF public.memberships
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.*
  FROM public.memberships m
  JOIN public.memberships me ON me.workspace_id = p_workspace_id
  JOIN public.profiles pf     ON pf.id = me.profile_id
  JOIN public.roles r         ON r.id = me.role_id
  WHERE pf.id = auth.uid()
    AND me.status = 'active'
    AND r.slug = 'coordinator'
    AND m.managed_by = me.id
    AND m.status = 'active'
    AND m.workspace_id = p_workspace_id
  ORDER BY m.created_at ASC;
$$;

-- =============================================================================
-- 4. get_memberships_by_manager(p_manager_membership_id) — SETOF das
--    memberships ATIVAS geridas diretamente por uma membership (a "equipe" de
--    uma liderança na árvore do coordenador). Fail-closed: o chamador precisa
--    ser coordenador ATIVO do workspace do gestor. Mesma regra de escopo do
--    mapa (coord → liderança → equipe; nunca para terceiros).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_memberships_by_manager(
  p_manager_membership_id uuid
)
RETURNS SETOF public.memberships
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.*
  FROM public.memberships m
  JOIN public.memberships mgr ON mgr.id = p_manager_membership_id
  JOIN public.memberships me  ON me.workspace_id = mgr.workspace_id
  JOIN public.profiles pf     ON pf.id = me.profile_id
  JOIN public.roles r         ON r.id = me.role_id
  WHERE pf.id = auth.uid()
    AND me.status = 'active'
    AND r.slug = 'coordinator'
    AND m.managed_by = mgr.id
    AND m.status = 'active'
    AND m.workspace_id = mgr.workspace_id
  ORDER BY m.created_at ASC;
$$;

-- =============================================================================
-- 5. coordinator_set_manager(p_membership_id, p_manager_id) — ESCRITA ESCOPOADA
--    da relação de gestão. SECURITY DEFINER COM AUTORIZAÇÃO EXPLÍCITA (a RLS de
--    membreships NÃO muda: escrita segue super-admin-only fora deste RPC).
--
--    Regras (resumo):
--      - Alvo: membership existente e ATIVA, da unidade onde o chamador é
--        coordenador ativo. Não pode ser a própria membership de coordenação
--        (raiz) nem uma membership de coordenação (coordenadores são pares).
--      - Gestor NULL = remover o membro da equipe (sempre permitido).
--      - Gestor não-NULL: precisa existir, estar na MESMA unidade e pertencer
--        à árvore do chamador ( = a própria membership de coordenação OU uma
--        membership já subordinada direta a ela na unidade).
--      - A trigger guarda 046 revalida a operação (mesmo workspace, gestor
--        ativo e de cargo de liderança, sem ciclos, sem lider→lider).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coordinator_set_manager(
  p_membership_id uuid,
  p_manager_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_status text;
  v_target_slug   text;
  v_ws            uuid;
  v_coord         uuid;
  v_mgr_ws        uuid;
  v_mgr_managed_by uuid;
BEGIN
  -- Alvo: deve existir, estar ativa.
  SELECT m.workspace_id, m.status, r.slug
  INTO v_ws, v_target_status, v_target_slug
  FROM public.memberships m
  JOIN public.roles r ON r.id = m.role_id
  WHERE m.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target membership not found';
  END IF;
  IF v_target_status <> 'active' THEN
    RAISE EXCEPTION 'target membership must be active (found %)', v_target_status;
  END IF;

  -- Chamador: coordenador ATIVO da unidade do alvo.
  SELECT m.id INTO v_coord
  FROM public.memberships m
  JOIN public.roles r     ON r.id = m.role_id
  JOIN public.profiles pf ON pf.id = m.profile_id
  WHERE m.workspace_id = v_ws
    AND pf.id = auth.uid()
    AND m.status = 'active'
    AND r.slug = 'coordinator';

  IF v_coord IS NULL THEN
    RAISE EXCEPTION 'only an active coordinator of this unit can manage its membership structure';
  END IF;

  -- A membership de coordenação é a RAIZ: não se auto-edita. Este check vem
  -- ANTES do "pares" para que a mensagem distingue auto-referência (raiz) de
  -- re-parenting de outro coordenador (pares) — ambos bloqueados.
  IF p_membership_id = v_coord THEN
    RAISE EXCEPTION 'coordination membership is the root of the unit and has no manager';
  END IF;

  IF v_target_slug = 'coordinator' THEN
    RAISE EXCEPTION 'coordinators are peers in a unit — a coordination membership cannot be re-parented by the RPC';
  END IF;

  IF p_manager_id IS NOT NULL THEN
    SELECT m.workspace_id, m.managed_by INTO v_mgr_ws, v_mgr_managed_by
    FROM public.memberships m
    WHERE m.id = p_manager_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'manager membership not found';
    END IF;

    IF v_mgr_ws IS DISTINCT FROM v_ws THEN
      RAISE EXCEPTION 'manager must belong to the same workspace as the target';
    END IF;

    -- Escopo: o gestor pertence à árvore do chamador na unidade (ele mesmo OU
    -- uma liderança já subordinada DIRETA a ele). Não atravessa trabalho de
    -- outro coordenador.
    IF p_manager_id <> v_coord
       AND v_mgr_managed_by IS DISTINCT FROM v_coord THEN
      RAISE EXCEPTION 'manager is outside the coordinator scope in this unit';
    END IF;
  END IF;

  -- A trigger guarda 046 revalida: mesma unidade, gestor ativo e de cargo de
  -- liderança, sem ciclos, sem lider→lider. updated_at é bump manual (não há
  -- trigger de updated_at em memberships).
  UPDATE public.memberships
     SET managed_by = p_manager_id,
         updated_at = now()
   WHERE id = p_membership_id;
END;
$$;

-- =============================================================================
-- 6. ACL: somente authenticated; anon/PUBLIC revogado (lição 039).
-- =============================================================================

REVOKE ALL ON FUNCTION public.is_coordinator_of(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_coordinator_of(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_coordinator_units() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coordinator_units() FROM anon;
REVOKE ALL ON FUNCTION public.get_coordinator_leaders(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coordinator_leaders(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_memberships_by_manager(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_memberships_by_manager(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.coordinator_set_manager(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_set_manager(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_coordinator_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coordinator_units() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coordinator_leaders(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_memberships_by_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordinator_set_manager(uuid, uuid) TO authenticated;

-- =============================================================================
-- 7. Documentação dos invariantes (COMMENT).
-- =============================================================================

COMMENT ON FUNCTION public.is_coordinator_of(uuid) IS
  'RBAC 2.0 (047): o chamador (auth.uid()) tem membership ATIVA de coordenação na unidade. Predicado fail-closed para policies/helpers do escopo de coordenação.';

COMMENT ON FUNCTION public.get_coordinator_units() IS
  'RBAC 2.0 (047): SETOF das memberships ativas de coordenação do chamador — as unidades sob a coordenação dele. Fail-closed: sem membership de coordenação ativa → vazio.';

COMMENT ON FUNCTION public.get_coordinator_leaders(uuid) IS
  'RBAC 2.0 (047): SETOF das memberships ATIVAS da unidade geridas diretamente pela membership de coordenação do chamador naquela unidade (lideranças/subordinações diretas). Fail-closed: sem coordenação ativa na unidade → vazio.';

COMMENT ON FUNCTION public.get_memberships_by_manager(uuid) IS
  'RBAC 2.0 (047): SETOF das memberships ATIVAS geridas diretamente por uma membership (equipe de uma liderança na árvore). Fail-closed: somente coordenador ativo do workspace do gestor.';

COMMENT ON FUNCTION public.coordinator_set_manager(uuid, uuid) IS
  'RBAC 2.0 (047): escrita ESCOPOADA de memberships.managed_by dentro das unidades do chamador. Autorização explícita (SECURITY DEFINER; RLS de memberships permanece super-admin-only). NULL remove o membro da equipe; gestor deve estar na mesma unidade e na árvore do coordenador (a própria membership de coordenação ou subordinação direta). A trigger guarda 046 revalida estrutura (mesma unidade, gestor ativo/liderança, sem ciclos, sem lider→lider).';