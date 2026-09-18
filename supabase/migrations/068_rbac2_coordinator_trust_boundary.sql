-- =============================================================================
-- 068_rbac2_coordinator_trust_boundary.sql
-- =============================================================================
-- RBAC 2.0 — FASE 5.2 (TRUST BOUNDARY DO COORDENADOR): fecha a ultima linha
-- vermelha que sobrou nas RPCs de APROVACAO/REJEICAO de membership.
--
-- Contexto (065 + 066):
--   A 065 criou o ciclo de vida das memberships pelo Coordenador
--   (`coordinator_approve_membership` / `coordinator_reject_membership` /
--   `_suspend_` / `_restore_` / `_remove_` / `_set_role`), todas SECURITY
--   DEFINER e fail-closed por `public.is_coordinator_of(workspace)` (047).
--   A 066 endureceu `coordinator_suspend_membership` /
--   `coordinator_restore_membership` / `coordinator_remove_membership` para
--   rejeitar alvos `adm`/`coordinator` (linha vermelha: o coordenador NAO
--   alcanca administrador de workspace nem par de coordenacao). Porem
--   `coordinator_approve_membership` e `coordinator_reject_membership`
--   ficaram SEM essa guarda: se existir uma membership PENDING com role
--   `adm` ou `coordinator`, o coordenador ativo da unidade podia ativa-la
--   (approve) ou apaga-la (reject).
--
--   Nenhum caminho de runtime cria PENDING com `adm`/`coordinator` hoje
--   (052 grava sempre `active`; o signup 053 nao cria membership; set_role
--   so atribui tec|vis|est|opv|lider). Ainda assim a guarda e necessaria por
--   construcao: as RPCs sao SECURITY DEFINER e nao devem depender de como a
--   linha PENDING nasceu (DDL administrativa, backfill ou fluxo futuro de
--   solicitacao que venha a aceitar esses cargos).
--
--   Esta migration e EXCLUSIVAMENTE sobre approve/reject. NAO recria
--   `coordinator_set_role` (a limitacao de alvo `adm` em set_role e uma
--   superficie distinta, tratada em fase propria). NAO altera `managed_by`,
--   `profiles`, `auth.users`, `app_audit_logs`, RLS/policies nem tabelas.
--
-- Invariantes apos esta migration (approve/reject):
--   - `adm` e `coordinator`: NAO podem ser aprovados nem rejeitados pelo
--     Coordenador (mesma mensagem/padrao da 066).
--   - `tec`/`vis`/`est`/`opv`/`lider`: comportamento atual preservado.
--   - Escopo por unidade preservado (`is_coordinator_of(v_ws)`, fail-closed).
--   - `pending` continua a UNICA origem valida de approve/reject.
--   - Nenhuma escrita em `profiles.role`/`auth.users`/`managed_by`; auditoria
--     segue via trigger 054+065 (nenhuma action nova, sem inserts manuais).
--
-- IDEMPOTENCIA: CREATE OR REPLACE FUNCTION + ACL REVOKE/GRANT idempotentes.
-- Replay seguro pelo runner. SECURITY DEFINER com search_path = public.
--
-- Requer 047, 054, 065 e 066 aplicadas.
-- =============================================================================

-- =============================================================================
-- 1. coordinator_approve_membership(p_membership_id) — pending → active.
--    Regra de negocio identica a 065, acrescida da linha vermelha: alvo
--    `adm`/`coordinator` NAO pode ser aprovado por RPC de coordenador.
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
  v_target_slug text;
  v_pf_status   text;
  v_is_super    boolean;
BEGIN
  SELECT m.workspace_id, m.status, m.profile_id, r.slug
  INTO v_ws, v_status, v_profile_id, v_target_slug
  FROM public.memberships m
  JOIN public.roles r ON r.id = m.role_id
  WHERE m.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found';
  END IF;

  IF NOT public.is_coordinator_of(v_ws) THEN
    RAISE EXCEPTION 'only an active coordinator of this unit can approve memberships';
  END IF;

  IF v_target_slug IN ('adm', 'coordinator') THEN
    RAISE EXCEPTION 'administrative or coordination memberships cannot be approved by the RPC';
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
  'RBAC 2.0 (065+068): aprova uma membership PENDING da unidade (= pending→active). Autorizacao: coordenador ativo da unidade. Perfil precisa estar ativo e nao ser Super Admin. Alvo adm/coordinator e rejeitado (068).';

-- =============================================================================
-- 2. coordinator_reject_membership(p_membership_id) — rejeita a PENDING,
--    removendo-a fisicamente. Regra identica a 065, acrescida da mesma linha
--    vermelha: alvo `adm`/`coordinator` NAO pode ser rejeitado por RPC.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coordinator_reject_membership(p_membership_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws          uuid;
  v_status      text;
  v_target_slug text;
BEGIN
  SELECT m.workspace_id, m.status, r.slug
  INTO v_ws, v_status, v_target_slug
  FROM public.memberships m
  JOIN public.roles r ON r.id = m.role_id
  WHERE m.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found';
  END IF;

  IF NOT public.is_coordinator_of(v_ws) THEN
    RAISE EXCEPTION 'only an active coordinator of this unit can reject membership requests';
  END IF;

  IF v_target_slug IN ('adm', 'coordinator') THEN
    RAISE EXCEPTION 'administrative or coordination memberships cannot be rejected by the RPC';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'only pending memberships can be rejected (found %)', v_status;
  END IF;

  DELETE FROM public.memberships WHERE id = p_membership_id;
END;
$$;

COMMENT ON FUNCTION public.coordinator_reject_membership(uuid) IS
  'RBAC 2.0 (065+068): rejeita uma solicitacao PENDING removendo a membership. Nao apaga profile/usuario Auth; a trilha segue na auditoria (054+065, membership_removed). Autorizacao: coordenador ativo da unidade. Alvo adm/coordinator e rejeitado (068).';

-- =============================================================================
-- 3. ACL: somente authenticated; anon/PUBLIC revogado (lição 039).
--    As assinaturas nao mudam; REVOKE/GRANT reaplicados por idempotencia.
-- =============================================================================

REVOKE ALL ON FUNCTION public.coordinator_approve_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_approve_membership(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.coordinator_reject_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_reject_membership(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.coordinator_approve_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordinator_reject_membership(uuid) TO authenticated;
