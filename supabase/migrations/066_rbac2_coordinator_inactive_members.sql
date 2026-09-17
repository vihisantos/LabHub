-- =============================================================================
-- 066_rbac2_coordinator_inactive_members.sql
-- =============================================================================
-- RBAC 2.0 — FASE 10 (MEMBROS INATIVOS NA ÁREA DO COORDENADOR): leitura
-- ESCOPOADA das memberships `suspended`/`removed` da unidade + restauração de
-- `suspended` → `active`, e endurecimento das transições administrativas.
--
-- Contexto (Fase 9 / migration 065):
--   O coordenador já aprova/rejeita/suspende/restaura/remove memberships da
--   unidade e troca cargo, sempre por RPC SECURITY DEFINER fail-closed por
--   `public.is_coordinator_of(workspace)` (047). Porém:
--     (a) NENHUMA RPC devolvia memberships `suspended`/`removed` — elas saem do
--         escopo ativo (047) e ficavam invisíveis ao coordenador;
--     (b) `coordinator_get_requests` devolvia apenas a linha da membership e a
--         UI buscava `profiles` via SELECT direto. A RLS `profiles_select` (044)
--         exige ALVO ativo (`profile_visible_to_me`), então perfis de memberships
--         `pending`/`suspended`/`removed` vêm vazios por RLS. Este é o caminho
--         correto: a RPC projeta o perfil DENTRO do SQL com SECURITY DEFINER
--         (owner sem RLS), sem afrouxar policy nenhuma e sem SELECT amplo no
--         frontend;
--     (c) `coordinator_suspend_membership`/`_remove_membership`/
--         `_restore_membership` NÃO bloqueavam alvos `adm`/`coordinator` (par),
--         embora `coordinator_set_role`/`set_manager` bloqueiem. Fechamos a
--         linha vermelha: o coordenador não suspende/remove/restaura um
--         administrador de workspace nem um par de coordenação.
--
-- Decisões (Fase 10, aprovadas):
--   1. Nova leitura `coordinator_get_inactive_members(p_workspace_id)` retorna
--      SOMENTE `suspended`/`removed` da unidade e SOMENTE se o chamador a
--      coordena ativamente. A projeção inclui os campos de perfil necessários
--      à UI (nome/e-mail/status/role) porque a RLS de `profiles` os esconde
--      para memberships não-ativas.
--   2. `coordinator_get_requests` passa a projetar o perfil (mesmo motivo):
--      DROP + CREATE (mudança de tipo de retorno não é `CREATE OR REPLACE`ável).
--      Autorização idêntica à 065 (escopo + `status = 'pending'`).
--   3. Restaurar `removed` NÃO é permitido: `removed` é terminal/histórico
--      (a linha/perfil/Auth permanecem) e restaurar ressuscitaria acesso sem
--      decisão administrativa. Nesta fase, `removed` é apenas informativo.
--   4. Restaurar NÃO recria `managed_by` (a estrutura é reconstruída via
--      `coordinator_set_manager`, 047) e NÃO toca `profiles.role`/Auth.
--   5. AUDITORIA: reutiliza `app_audit_logs`/trigger da 054+065. Restaurar é um
--      UPDATE `suspended→active` já auditado como `membership_changed`; NÃO há
--      trilha nova nem inserts manuais.
--   6. Hardening de cargo nas transições: `adm`/`coordinator` não podem ser
--      suspensos/removidos/restaurados por RPC de coordenador.
--
-- LINHAS VERMELHAS (invariantes da Fase 10):
--   - Coordenador NUNCA: age fora das unidades que coordena; alcança
--     administrador de workspace ou par de coordenação; altera
--     `profiles.role`/`is_super_admin`/Auth; recria `managed_by` ao restaurar;
--     restaura `removed`; cria Super Admin; burla RLS/RBAC.
--   - Nenhuma policy/RLS/tabela nova. `coordinator_set_manager` (047) intocado.
--
-- IDEMPOTÊNCIA: `CREATE OR REPLACE` (exceto `coordinator_get_requests`, que usa
-- `DROP FUNCTION IF EXISTS` + `CREATE FUNCTION` por trocar o retorno) + ACL
-- REVOKE/GRANT idempotentes. Replay seguro pelo runner. Helpers SECURITY DEFINER
-- com `search_path = public` (lição 039/040/045/046/047/065).
-- =============================================================================

-- =============================================================================
-- 1. coordinator_get_inactive_members(p_workspace_id) — memberships SUSPENDED
--    e REMOVED da unidade, com a projeção de perfil necessária à UI.
--    Fail-closed: só um coordenador ATIVO da unidade (is_coordinator_of, 047)
--    recebe linhas; fora do escopo, vazio.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coordinator_get_inactive_members(p_workspace_id uuid)
RETURNS TABLE (
  membership_id  uuid,
  profile_id     uuid,
  workspace_id   uuid,
  role_id        uuid,
  status         text,
  managed_by     uuid,
  created_at     timestamptz,
  updated_at     timestamptz,
  profile_name   text,
  profile_email  text,
  profile_status text,
  profile_role   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.profile_id,
    m.workspace_id,
    m.role_id,
    m.status::text,
    m.managed_by,
    m.created_at,
    m.updated_at,
    p.name,
    p.email,
    p.status,
    p.role
  FROM public.memberships m
  LEFT JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.workspace_id = p_workspace_id
    AND m.status IN ('suspended', 'removed')
    AND public.is_coordinator_of(p_workspace_id)
  ORDER BY m.status, m.updated_at DESC;
$$;

COMMENT ON FUNCTION public.coordinator_get_inactive_members(uuid) IS
  'RBAC 2.0 (066): projeta as memberships SUSPENDED/REMOVED de uma unidade com os campos de perfil (nome/e-mail/status/role) — a RLS de profiles (044) esconde perfis de memberships não-ativas, então o JOIN ocorre dentro do SECURITY DEFINER. Fail-closed: só um coordenador ATIVO da unidade (is_coordinator_of, 047) recebe linhas.';

-- =============================================================================
-- 2. coordinator_get_requests(p_workspace_id) — REESCRITA: mesmas solicitações
--    PENDING da unidade, agora com a projeção de perfil embutida. A assinatura
--    de entrada não muda; o retorno deixa de ser SETOF memberships (exige DROP).
--    Autorização inalterada: escopo ativo + status = 'pending'.
-- =============================================================================

DROP FUNCTION IF EXISTS public.coordinator_get_requests(uuid);

CREATE FUNCTION public.coordinator_get_requests(p_workspace_id uuid)
RETURNS TABLE (
  membership_id  uuid,
  profile_id     uuid,
  workspace_id   uuid,
  role_id        uuid,
  status         text,
  managed_by     uuid,
  created_at     timestamptz,
  updated_at     timestamptz,
  profile_name   text,
  profile_email  text,
  profile_status text,
  profile_role   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.profile_id,
    m.workspace_id,
    m.role_id,
    m.status::text,
    m.managed_by,
    m.created_at,
    m.updated_at,
    p.name,
    p.email,
    p.status,
    p.role
  FROM public.memberships m
  LEFT JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.workspace_id = p_workspace_id
    AND m.status = 'pending'
    AND public.is_coordinator_of(p_workspace_id)
  ORDER BY m.created_at ASC;
$$;

COMMENT ON FUNCTION public.coordinator_get_requests(uuid) IS
  'RBAC 2.0 (065+066): projeta as memberships PENDING de uma unidade com os campos de perfil (nome/e-mail/status/role) dentro do SECURITY DEFINER, porque a RLS de profiles (044) esconde perfis de memberships não-ativas. Fail-closed: só um coordenador ATIVO da unidade recebe linhas.';

-- =============================================================================
-- 3. Hardening de cargo — coordinator_suspend_membership.
--    Regra de negócio idêntica à 065, acrescida da linha vermelha: alvo
--    `adm`/`coordinator` NÃO pode ser suspenso por RPC de coordenador.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coordinator_suspend_membership(p_membership_id uuid)
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
    RAISE EXCEPTION 'only an active coordinator of this unit can suspend memberships';
  END IF;

  IF v_target_slug IN ('adm', 'coordinator') THEN
    RAISE EXCEPTION 'administrative or coordination memberships cannot be suspended by the RPC';
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
  'RBAC 2.0 (065+066): suspende uma membership ATIVA da unidade (= active→suspended) e neutraliza os dependentes (managed_by = NULL). Alvo adm/coordinator é rejeitado. Autorização: coordenador ativo da unidade.';

-- =============================================================================
-- 4. Hardening de cargo — coordinator_restore_membership.
--    Regra idêntica à 065 (só suspended→active, sem mexer em managed_by),
--    acrescida de: alvo `adm`/`coordinator` NÃO pode ser restaurado por RPC.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coordinator_restore_membership(p_membership_id uuid)
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
    RAISE EXCEPTION 'only an active coordinator of this unit can restore memberships';
  END IF;

  IF v_target_slug IN ('adm', 'coordinator') THEN
    RAISE EXCEPTION 'administrative or coordination memberships cannot be restored by the RPC';
  END IF;

  IF v_status <> 'suspended' THEN
    RAISE EXCEPTION 'only suspended memberships can be restored (found %)', v_status;
  END IF;

  -- Restauração NÃO recria managed_by (nem toca perfil/Auth/cargo).
  UPDATE public.memberships
     SET status = 'active',
         updated_at = now()
   WHERE id = p_membership_id;
END;
$$;

COMMENT ON FUNCTION public.coordinator_restore_membership(uuid) IS
  'RBAC 2.0 (065+066): restaura uma membership SUSPENSA da unidade (= suspended→active). Não recria managed_by (reconstruído via coordinator_set_manager, 047). Alvo adm/coordinator é rejeitado. Autorização: coordenador ativo da unidade.';

-- =============================================================================
-- 5. Hardening de cargo — coordinator_remove_membership.
--    Regra idêntica à 065 (só active→removed, neutraliza dependentes),
--    acrescida de: alvo `adm`/`coordinator` NÃO pode ser removido por RPC.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coordinator_remove_membership(p_membership_id uuid)
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
    RAISE EXCEPTION 'only an active coordinator of this unit can remove memberships';
  END IF;

  IF v_target_slug IN ('adm', 'coordinator') THEN
    RAISE EXCEPTION 'administrative or coordination memberships cannot be removed by the RPC';
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
  'RBAC 2.0 (065+066): remove uma membership ATIVA da unidade (= active→removed), preservando a linha/perfil/usuário (histórico consultável) e neutralizando dependentes (managed_by = NULL). Alvo adm/coordinator é rejeitado. Autorização: coordenador ativo da unidade.';

-- =============================================================================
-- 6. ACL: projeções e transições somente `authenticated`; anon/PUBLIC revogado.
--    (CREATE OR REPLACE preserva os grants já existentes; reaplicamos por
--     idempotência/explícito. O DROP de get_requests remove os grants da 065,
--     por isso são reconcedidos abaixo.)
-- =============================================================================

REVOKE ALL ON FUNCTION public.coordinator_get_inactive_members(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_get_inactive_members(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.coordinator_get_inactive_members(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.coordinator_get_requests(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_get_requests(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.coordinator_get_requests(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.coordinator_suspend_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_suspend_membership(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.coordinator_suspend_membership(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.coordinator_restore_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_restore_membership(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.coordinator_restore_membership(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.coordinator_remove_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_remove_membership(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.coordinator_remove_membership(uuid) TO authenticated;
