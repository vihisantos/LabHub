-- =============================================================================
-- 069_rbac2_coordinator_set_role_trust_boundary.sql
-- =============================================================================
-- RBAC 2.0 — FASE 5.3 (TRUST BOUNDARY DE coordinator_set_role): fecha o gap
-- HIGH da 065 no RPC de troca de cargo.
--
-- Contexto (065 + 066 + 068):
--   A 065 criou `coordinator_set_role` com whitelist fechada de cargos
--   atribuiveis (tec|vis|est|opv|lider) e bloqueio do ALVO `coordinator`
--   (par/raiz). Porem o ALVO `adm` NAO era bloqueado: um Coordenador podia
--   pegar uma membership ATIVA com cargo `adm` na unidade coordenada e
--   rebaixa-la para `tec`/`vis`/`est`/`opv`/`lider`. Em dois passos
--   (rebaixar p/ `tec` e depois suspender/remover), isso driblava a linha
--   vermelha que a 066 fechou para suspend/restore/remove (alvos
--   `adm`/`coordinator`) e que a 068 fechou para approve/reject.
--
--   Esta migration e EXCLUSIVAMENTE sobre `coordinator_set_role`. NAO recria
--   outras RPCs, NAO altera tabelas, RLS, policies, `profiles`, `auth.users`,
--   `managed_by`, `is_super_admin` nem auditoria.
--
-- Regra apos esta migration:
--   - Input (cargo a ATRIBUIR): inalterado — somente tec|vis|est|opv|lider.
--   - Alvo (cargo ATUAL da membership): `adm` e `coordinator` SAO rejeitados,
--     com a mensagem de `coordinator` preservada (065) + mensagem nova para
--     `adm`. As mensagens seguem o padrao da 066/068.
--   - Escopo, status='active', neutralizacao de dependentes (sair de lideranca)
--     e UPDATE apenas de `memberships.role_id`: preservados da 065.
--
-- IDEMPOTENCIA: unico `CREATE OR REPLACE FUNCTION` + ACL REVOKE/GRANT
-- idempotentes. Replay seguro pelo runner. SECURITY DEFINER com
-- search_path = public.
--
-- Requer 047, 054, 065, 066 e 068 aplicadas.
-- =============================================================================

-- =============================================================================
-- 1. coordinator_set_role(p_membership_id, p_role_slug) — troca ESCOPOADA do
--    cargo da membership. Regra de negocio identica a 065, acrescida da linha
--    vermelha: alvo `adm` NAO pode ter o cargo alterado por RPC de coordenador
--    (o alvo `coordinator` ja era bloqueado na 065).
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

  -- Linha vermelha (069): o coordenador NAO rebaixa/promove um administrador
  -- de workspace da unidade. Fecha o passo 1 do bypass da 066/068.
  IF v_target_slug = 'adm' THEN
    RAISE EXCEPTION 'administrative memberships cannot have their role changed by the RPC';
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
  'RBAC 2.0 (065+069): troca o cargo de uma membership ATIVA da unidade. Permitidos tec|vis|est|opv|lider; NUNCA adm/coordinator. Alvo adm é rejeitado (069); alvo coordinator é rejeitado (065). Não toca profiles.role. Sair de liderança neutraliza dependentes (managed_by = NULL). Autorização: coordenador ativo da unidade.';

-- =============================================================================
-- 2. ACL: somente authenticated; anon/PUBLIC revogado (lição 039).
--    A assinatura não muda; REVOKE/GRANT reaplicados por idempotência.
-- =============================================================================

REVOKE ALL ON FUNCTION public.coordinator_set_role(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_set_role(uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.coordinator_set_role(uuid, text) TO authenticated;