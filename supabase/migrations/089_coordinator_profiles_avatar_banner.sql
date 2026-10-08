-- =============================================================================
-- 089_coordinator_profiles_avatar_banner.sql
-- =============================================================================
-- Projeção de avatar/banner do perfil nas RPCs de listagem do coordenador
-- (cards de perfil da aba "Pessoal" da Central).
--
-- Contexto:
--   O banco JÁ possui as colunas de imagem do perfil: `profiles.avatar`
--   (001/012) e `profiles.banner` (014) — fotos enviadas pelo próprio usuário
--   via Cloudinary (ProfileSheet). Os cards de perfil da aba Pessoal exibem
--   essas imagens REAIS, com fallback de iniciais quando ausentes.
--   Porém NENHUMA fonte do coordenador as entrega hoje:
--     · `get_coordinator_leaders` / `get_memberships_by_manager` (047) não
--       projetam perfil algum — a UI lê `profiles` por SELECT direto (RLS
--       044/067 cobre co-membros ativos) e passa a pedir avatar/banner nessa
--       leitura (nenhuma mudança de banco para esse caminho);
--     · `coordinator_get_requests` (065/066), `coordinator_get_inactive_members`
--       (066) e `coordinator_get_members` (071) projetam o perfil DENTRO do
--       SECURITY DEFINER (nome/e-mail/status/role) porque a RLS de `profiles`
--       esconde perfis de memberships não-ativas — avatar/banner precisam vir
--       pelo MESMO caminho, senão pendentes/inativos ficam sem imagem no card.
--
-- Decisão:
--   1. As 3 projeções passam a incluir `profile_avatar`/`profile_banner`
--      (`profiles.avatar`/`profiles.banner`). Campos de EXIBIÇÃO — mesma
--      natureza de name/email (audit 044: SAFE_FOR_NORMAL_READ). Nenhuma
--      coluna/tabela/policy nova; NENHUM RPC novo; NENHUMA regra de
--      autorização alterada (mesmos WHERE, mesmo escopo `is_coordinator_of`,
--      mesmas linhas vermelhas adm/coordinator).
--   2. Mudança de tipo de retorno (2 colunas novas) não é `CREATE OR REPLACE`ável
--      (lição 066): `DROP FUNCTION IF EXISTS` + `CREATE FUNCTION` + reconcessão
--      das ACLs.
--   3. Backward compatible: enquanto a migration não roda, o frontend recebe
--      o campo ausente → fallback visual (iniciais/gradiente). Nada quebra.
--
-- LINHAS VERMELHAS (invariantes, intocadas): coordenador NUNCA age fora das
-- unidades que coordena; NUNCA alcança adm/coordinator; NUNCA altera
-- profiles/Auth; NENHUMA policy/RLS/tabela nova; NENHUM SELECT amplo no
-- frontend. A autoridade permanece server-side (auth.uid + is_coordinator_of).
-- =============================================================================

-- =============================================================================
-- 1. coordinator_get_requests(p_workspace_id) — memberships PENDING da unidade,
--    agora com avatar/banner do perfil na projeção. Autorização inalterada
--    (escopo ativo + status = 'pending').
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
  profile_role   text,
  profile_avatar text,
  profile_banner text
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
    p.role,
    p.avatar,
    p.banner
  FROM public.memberships m
  LEFT JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.workspace_id = p_workspace_id
    AND m.status = 'pending'
    AND public.is_coordinator_of(p_workspace_id)
  ORDER BY m.created_at ASC;
$$;

COMMENT ON FUNCTION public.coordinator_get_requests(uuid) IS
  'RBAC 2.0 (065+066+089): projeta as memberships PENDING de uma unidade com os campos de perfil (nome/e-mail/status/role/avatar/banner) dentro do SECURITY DEFINER, porque a RLS de profiles (044) esconde perfis de memberships não-ativas. Fail-closed: só um coordenador ATIVO da unidade recebe linhas.';

-- =============================================================================
-- 2. coordinator_get_inactive_members(p_workspace_id) — memberships SUSPENDED e
--    REMOVED da unidade, com avatar/banner do perfil na projeção. Autorização
--    inalterada (escopo ativo + status IN ('suspended','removed')).
-- =============================================================================

DROP FUNCTION IF EXISTS public.coordinator_get_inactive_members(uuid);

CREATE FUNCTION public.coordinator_get_inactive_members(p_workspace_id uuid)
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
  profile_role   text,
  profile_avatar text,
  profile_banner text
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
    p.role,
    p.avatar,
    p.banner
  FROM public.memberships m
  LEFT JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.workspace_id = p_workspace_id
    AND m.status IN ('suspended', 'removed')
    AND public.is_coordinator_of(p_workspace_id)
  ORDER BY m.status, m.updated_at DESC;
$$;

COMMENT ON FUNCTION public.coordinator_get_inactive_members(uuid) IS
  'RBAC 2.0 (066+089): projeta as memberships SUSPENDED/REMOVED de uma unidade com os campos de perfil (nome/e-mail/status/role/avatar/banner) — a RLS de profiles (044) esconde perfis de memberships não-ativas, então o JOIN ocorre dentro do SECURITY DEFINER. Fail-closed: só um coordenador ATIVO da unidade (is_coordinator_of, 047) recebe linhas.';

-- =============================================================================
-- 3. coordinator_get_members(p_workspace_id) — memberships ATIVAS da unidade,
--    com avatar/banner do perfil na projeção. Autorização inalterada: somente
--    memberships `active` da unidade, `adm`/`coordinator` sempre excluídos.
-- =============================================================================

DROP FUNCTION IF EXISTS public.coordinator_get_members(uuid);

CREATE FUNCTION public.coordinator_get_members(p_workspace_id uuid)
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
  profile_role   text,
  profile_avatar text,
  profile_banner text
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
    p.role,
    p.avatar,
    p.banner
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
  'RBAC 2.0 (071+089): projeta TODAS as memberships ATIVAS de uma unidade com os campos de perfil (nome/e-mail/status/role/avatar/banner) — inclusive as sem responsável (managed_by = NULL) — porque a RLS de profiles (044) pode esconder perfis e a UI não faz SELECT direto. Fail-closed: só um coordenador ATIVO da unidade (is_coordinator_of, 047) recebe linhas; adm e coordinator são sempre excluídos (linha vermelha).';

-- =============================================================================
-- 4. ACL: o DROP acima remove os grants — reconcessão explícita (padrão 066):
--    somente `authenticated`; anon/PUBLIC revogado.
-- =============================================================================

REVOKE ALL ON FUNCTION public.coordinator_get_requests(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_get_requests(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.coordinator_get_requests(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.coordinator_get_inactive_members(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_get_inactive_members(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.coordinator_get_inactive_members(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.coordinator_get_members(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coordinator_get_members(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.coordinator_get_members(uuid) TO authenticated;
