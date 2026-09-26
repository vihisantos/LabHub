-- =============================================================================
-- 071_rbac2_coordinator_members.sql
-- =============================================================================
-- RBAC 2.0 — FASE 11 (MEMBROS ATIVOS NA ÁREA DO COORDENADOR): leitura ESCOPOADA
-- de TODAS as memberships `active` da unidade coordenada — inclusive as sem
-- responsável (`managed_by = NULL`), que ficavam invisíveis no diretório Pessoal.
--
-- Contexto (migration 066):
--   A central do coordenador monta o diretório Pessoal sobre leituras
--   fail-closed existentes (047/065/066):
--     · `units[].leaders` + `members`  → membros ativos geridos pela coordenação
--       ou por uma liderança (get_coordinator_leaders / get_memberships_by_manager);
--     · `requestsByUnit`               → memberships PENDING (065);
--     · `inactiveByUnit`               → memberships SUSPENDED/REMOVED (066).
--   NENHUMA dessas fontes devolve o membro ATIVO com `managed_by = NULL`: ele não
--   é liderança direta, não é equipe de liderança, não está pendente nem inativo.
--   Consequência: membros sem responsável definido não apareciam no Pessoal.
--
-- Decisão (Fase 11, aprovada):
--   1. Nova leitura `coordinator_get_members(p_workspace_id)` projeta SOMENTE
--      memberships `active` DA unidade, se e somente se o chamador a coordena
--      ativamente (`is_coordinator_of`, 047). Mesmo padrão da 066: projeção de
--      perfil (nome/e-mail/status/role) DENTRO do SECURITY DEFINER porque a RLS
--      de `profiles` (044) pode esconder alvos; nenhum SELECT direto no frontend.
--   2. Linha vermelha preservada: o coordenador NUNCA alcança administrador de
--      workspace (`adm`) nem par de coordenação (`coordinator`) — essas
--      memberships são EXCLUÍDAS do retorno pelo slug do cargo. A própria
--      membership do coordenador é excluída por este mesmo filtro.
--   3. Nenhum status além de `active` volta nesta RPC: PENDING continua com
--      `coordinator_get_requests` (065) e SUSPENDED/REMOVED com
--      `coordinator_get_inactive_members` (066). A UI desduplica por
--      `membership.id` e as fontes se complementam no diretório.
--   4. `role_id` (uuid) volta no retorno — o rótulo de cargo é resolvido pela
--      mesa `rolesById` já carregada; o slug é usado SOMENTE no filtro de
--      segurança server-side (o mesmo r.slug que o RPC 047 usa para autorizar).
--
-- LINHAS VERMELHAS (invariantes, continuam valendo): coordenador NUNCA age fora
-- das unidades que coordena; NUNCA alcança adm/coordinator; NUNCA altera
-- profiles/Auth; NENHUMA policy/RLS/tabela nova; NENHUM SELECT amplo no
-- frontend. A autoridade permanece server-side (auth.uid + is_coordinator_of).
--
-- IDEMPOTÊNCIA: `CREATE OR REPLACE` + ACL REVOKE/GRANT idempotentes. Replay
-- seguro pelo runner. Helper SECURITY DEFINER com `search_path = public`
-- (lição 039/040/044/045/046/047/065/066).
-- =============================================================================

-- =============================================================================
-- 1. coordinator_get_members(p_workspace_id) — memberships ATIVAS da unidade,
--    com a projeção de perfil necessária à UI e o filtro de linha vermelha.
--    Fail-closed: só um coordenador ATIVO da unidade (is_coordinator_of, 047)
--    recebe linhas; fora do escopo, vazio. `adm`/`coordinator` excluídos.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coordinator_get_members(p_workspace_id uuid)
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
  LEFT JOIN public.roles r ON r.id = m.role_id
  LEFT JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.workspace_id = p_workspace_id
    AND m.status = 'active'
    AND COALESCE(r.slug, '') NOT IN ('adm', 'coordinator')
    AND public.is_coordinator_of(p_workspace_id)
  ORDER BY m.updated_at DESC;
$$;

COMMENT ON FUNCTION public.coordinator_get_members(uuid) IS
  'RBAC 2.0 (071): projeta TODAS as memberships ATIVAS de uma unidade com os campos de perfil (nome/e-mail/status/role) — inclusive as sem responsável (managed_by = NULL) — porque a RLS de profiles (044) pode esconder perfis e a UI não faz SELECT direto. Fail-closed: só um coordenador ATIVO da unidade (is_coordinator_of, 047) recebe linhas; adm e coordinator são sempre excluídos (linha vermelha).';

-- =============================================================================
-- 2. ACL: leitura somente `authenticated`; anon/PUBLIC revogado.
--    (CREATE OR REPLACE preserva grants existentes; reaplicamos por
--     idempotência/explícito, mesmo padrão da 066.)
-- =============================================================================

REVOKE ALL ON FUNCTION public.coordinator_get_members(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_get_members(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.coordinator_get_members(uuid) TO authenticated;