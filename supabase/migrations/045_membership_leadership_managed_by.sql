-- =============================================================================
-- 045_membership_leadership_managed_by.sql
-- =============================================================================
-- RBAC 2.0 — FASE 7 (ÁREA DO LÍDER / SCOPE team): RELAÇÃO DE LIDERANÇA NA
-- MEMBERSHIP + CARGO 'lider' NO BANCO.
--
-- Contexto:
--   As Fases 4-6 fecharam a classificação de liderança NO CARGO (frontend):
--   `isLeadership`/`leadershipLevel` (types.ts), `leadershipAreaOf()`
--   (lider→'team', coordinator→'coordination'), guard `/coordenador` e
--   `minimum Eliderança` NOVAMENTE per-workspace. Porém, server-side:
--     a) o cargo Líder NÃO EXISTE: memberships resolve role→slug determinístico
--        (041) sem 'lider' — um Líder aprovado no app fica SEM memberships;
--     b) NÃO existe relação líder→subordinados (nada liga "quem lidera quem"):
--        `Role.leaderId` é display-only (spec §4.2/§10) e não deve virar a
--        estrutura de autorização (é atributo GLOBAL por cargo).
--
-- Decisão (Fase 7.1, alinhada à spec §10 "liderança como relação na
-- membership, não atributo global"):
--   A liderança vira uma RELAÇÃO ENTRE MEMBERSHIPS do mesmo workspace:
--   `memberships.managed_by` (quem gerencia aquela membership). A equipe de um
--   líder = memberships ativas cujo `managed_by` aponta para a membership dele
--   naquele workspace. É per-workspace (não global), reutiliza 036/041 e escala
--   para o coordenador (Fase 8+): coordenador = membros das unidades.
--
-- ESTRUTURA DESTA MIGRATION:
--   1. Cargo 'lider' (seed blueprint global, SEM Actions — spec §4.2:
--      liderança não auto-concede Actions; o motor RBAC_2_ENABLED=OFF e as
--      Actions do líder nascem na Fase 12).
--   2. profiles_role_check ← aceita 'lider' | 'role-lider' (formato roleId).
--   3. sync_user_memberships (041) ← mapeia 'lider'|'role-lider' → slug 'lider'
--      (CREATE OR REPLACE; o DO UPDATE da 041 NÃO toca managed_by, logo a
--      re-sincronização preserva a relação de gestão).
--   4. memberships.managed_by (FK ON DELETE SET NULL) + CHECK (não auto) +
--      índices + TRIGGER de guarda server-side (mesmo workspace, gestor ativo,
--      sem ciclos) — a UI não é mecanismo de segurança.
--   5. Helpers SECURITY DEFINER (REVOKE anon/PUBLIC, GRANT authenticated —
--      lição 039/040): membership_is_manager_of / user_manages_membership /
--      get_leader_team (leitura ESCOPOADA por RPC, fail-closed).
--   6. Backfill memberships p/ perfis 'lider'/'role-lider' × workspace_ids
--      (espelho 040; idempotente).
--
-- LINHAS VERMELHAS / DECISÕES EXPLÍCITAS:
--   - memberships_select NÃO é fechado nesta fase: hoje qualquer membro do
--     workspace lê o roster de memberships (behaviour preexistente base de
--     UsersPage/044). O SCOPE do líder vive em managed_by + na leitura
--     escopada get_leader_team() — não em esconder linhas de quem já é membro.
--     Geralmente quando o coordenador ganhar gestão de equipe (Fase 8+) o SELECT
--     pode ganhar policy adicional sem quebrar o fluxo (nada consome
--     memberships direto no frontend hoje).
--   - Escrita de managed_by: RLS de memberships é super-admin-only (036) +
--     trigger guard. Coordenador administra equipes quando o motor/UI de
--     Fase 8+ existir.
--   - Super Admin NÃO ganha memberships (041) nem viaja a área /lider
--     (cargo-based). Exceção administrativa, não coordenador/líder automático.
--   - Se um gestor perder a membership (workspace/status/role) a FK
--     ON DELETE SET NULL zera managed_by das dependentes (fail-closed: o time
--     fica órfão e o admin reatribui; comportamento documentado).
--
-- IDEMPOTÊNCIA: replay seguro pelo runner 041+ (IF NOT EXISTS / DROP IF
-- EXISTS / ON CONFLICT / guards). Nada de policy USING(true).
-- =============================================================================

-- =============================================================================
-- 1. Cargo 'lider' (blueprint global) — SEM role_permissions
-- =============================================================================

INSERT INTO public.roles (slug, workspace_id, name, description, is_system, is_default)
VALUES
  ('lider', NULL, 'Líder',
   'Líder de equipe em uma unidade (scope team). Cargo de liderança de nível 1; liderança é relação per-workspace (memberships.managed_by), não auto-concede Actions.',
   true, false)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

COMMENT ON TABLE public.roles IS
  'RBAC 2.0 roles. workspace_id NULL = global blueprint; set = workspace role. '
  'system roles (is_system) are seeds and are not editable by the app.';

-- =============================================================================
-- 2. profiles_role_check ← 'lider' | 'role-lider'
-- =============================================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'admin', 'technician', 'viewer', 'coordinator', 'lider',
    'role-admin', 'role-technician', 'role-viewer', 'role-coordinator', 'role-lider'
  ));

COMMENT ON CONSTRAINT profiles_role_check ON public.profiles IS
  'RBAC 2.0 (042+045): valores canônicos + formato roleId do mapeamento determinístico role→slug (036/040/041). Coordenador (042) e Líder (045) incluídos.';

-- =============================================================================
-- 3. sync_user_memberships ← mapeia 'lider'|'role-lider' → slug 'lider'
--    (CREATE OR REPLACE preserva a assinatura e o ACL da 041; o DO UPDATE
--    ignora managed_by → relação de gestão preservada na re-sincronização)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_user_memberships(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_raw    text;
  v_role_slug   text;
  v_is_super    boolean;
  v_status      text;
  v_ws          uuid[];
BEGIN
  SELECT role, is_super_admin, status, COALESCE(workspace_ids, ARRAY[]::uuid[])
  INTO v_role_raw, v_is_super, v_status, v_ws
  FROM public.profiles
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Mapeamento determinístico (legado + formato roleId), mesmo da 036/040/041.
  v_role_slug := CASE
    WHEN v_role_raw IN ('technician', 'role-technician')   THEN 'tec'
    WHEN v_role_raw IN ('viewer', 'role-viewer')           THEN 'vis'
    WHEN v_role_raw IN ('admin', 'role-admin')             THEN 'adm'
    WHEN v_role_raw IN ('coordinator', 'role-coordinator') THEN 'coordinator'
    WHEN v_role_raw IN ('lider', 'role-lider')             THEN 'lider'
    ELSE NULL
  END;

  -- Remove memberships fora do conjunto-alvo (044 regra: active × não-super ×
  -- role conhecida × workspace atribuído). Ao excluir uma membership que era
  -- gestora, a FK ON DELETE SET NULL zera managed_by das dependentes.
  DELETE FROM public.memberships m
  WHERE m.profile_id = p_profile_id
    AND NOT (
      v_status = 'active'
      AND NOT v_is_super
      AND v_role_slug IS NOT NULL
      AND m.workspace_id = ANY (v_ws)
    );

  -- (Re)cria / ajusta memberships do conjunto-alvo. O DO UPDATE NÃO mexe em
  -- managed_by: relação de gestão sobrevive a mudanças de role/status.
  IF v_status = 'active' AND NOT v_is_super AND v_role_slug IS NOT NULL
     AND array_length(v_ws, 1) IS NOT NULL THEN
    INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
    SELECT p_profile_id, ws, r.id, 'active'
    FROM unnest(v_ws) AS ws
    JOIN public.roles r ON r.slug = v_role_slug
    WHERE EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = ws)
    ON CONFLICT (profile_id, workspace_id) DO UPDATE SET
      role_id     = EXCLUDED.role_id,
      status      = 'active',
      updated_at  = now();
  END IF;
END $$;

COMMENT ON FUNCTION public.sync_user_memberships(uuid) IS
  'RBAC 2.0 (041+045): sincroniza memberships com profiles (status, role, workspace_ids, is_super_admin). SECURITY DEFINER; invocada pelo wrapper da trigger e pelo reconcile inicial. 045 adiciona o mapeamento lider/role-lider; preserva managed_by no upsert.';

-- =============================================================================
-- 4. memberships.managed_by — relação de liderança per-workspace
-- =============================================================================

ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS
  managed_by uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

-- Não pode gerenciar a si mesmo (cross-row validado pela trigger).
ALTER TABLE public.memberships DROP CONSTRAINT IF EXISTS memberships_managed_by_not_self;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_managed_by_not_self
  CHECK (managed_by IS NULL OR managed_by <> id);

CREATE INDEX IF NOT EXISTS idx_memberships_managed_by
  ON public.memberships (managed_by);
CREATE INDEX IF NOT EXISTS idx_memberships_workspace_managed
  ON public.memberships (workspace_id, managed_by);

COMMENT ON COLUMN public.memberships.managed_by IS
  'RBAC 2.0 (045): membership do gestor direto (mesmo workspace, status ative). '
  'Equipe de um líder = memberships ativas com managed_by apontando para a sua membership. '
  'Relação per-workspace (não atributo global); ON DELETE SET NULL = fail-closed se o gestor perder a membership.';

-- -----------------------------------------------------------------------------
-- 4.1 Trigger guarda server-side (UI não é segurança)
-- Regras: gestor existe; mesmo workspace; gestor ativo; sem ciclos de gestão.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_memberships_manager_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws      uuid;
  v_status  text;
  v_loop    int;
  v_depth   int := 64;
BEGIN
  IF NEW.managed_by IS NULL THEN
    RETURN NEW; -- remover da equipe: sempre permitido
  END IF;

  IF NEW.managed_by = NEW.id THEN
    RAISE EXCEPTION 'membership cannot manage itself (managed_by = id)';
  END IF;

  SELECT m.workspace_id, m.status INTO v_ws, v_status
  FROM public.memberships m
  WHERE m.id = NEW.managed_by;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'managed_by must reference an existing membership';
  END IF;

  IF v_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'manager must belong to the same workspace (managed_by % is in %)',
      NEW.managed_by, v_ws;
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'manager membership must be active (found %)', v_status;
  END IF;

  -- Detecção de ciclo (UPDATE): o novo gestor não pode ser descendente de si.
  IF TG_OP = 'UPDATE' THEN
    WITH RECURSIVE ancestors(mgr, depth) AS (
      SELECT m.managed_by, 1
      FROM public.memberships m
      WHERE m.id = NEW.managed_by
      UNION ALL
      SELECT m.managed_by, a.depth + 1
      FROM public.memberships m
      JOIN ancestors a ON m.id = a.mgr
      WHERE a.depth < v_depth
    )
    SELECT count(*) INTO v_loop FROM ancestors WHERE mgr = NEW.id;
    IF v_loop > 0 THEN
      RAISE EXCEPTION 'management cycle detected (managed_by chain would loop)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_memberships_manager_guard ON public.memberships;
CREATE TRIGGER trg_memberships_manager_guard
  BEFORE INSERT OR UPDATE OF managed_by
  ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_memberships_manager_guard();

REVOKE ALL ON FUNCTION public.trg_memberships_manager_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_memberships_manager_guard() FROM anon;
GRANT EXECUTE ON FUNCTION public.trg_memberships_manager_guard() TO authenticated;

COMMENT ON FUNCTION public.trg_memberships_manager_guard() IS
  'RBAC 2.0 (045): guarda estrutural de memberships.managed_by — mesmo workspace, gestor ativo, sem ciclo. SECURITY DEFINER (owner = dono da migration); RLS já é super-admin-only no write.';

-- =============================================================================
-- 5. Helpers SECURITY DEFINER — predicados e leitura escopada
-- =============================================================================

-- 5.1 membership_is_manager_of(gestor, membro): relação direta de gestão.
CREATE OR REPLACE FUNCTION public.membership_is_manager_of(
  p_manager_membership uuid,
  p_membership uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.id = p_membership
      AND m.managed_by = p_manager_membership
      AND m.status = 'active'
  );
$$;

-- 5.2 user_manages_membership(p_membership): o chamador (auth.uid()) é o
--     gestor direto daquela membership (mesmo workspace).
CREATE OR REPLACE FUNCTION public.user_manages_membership(p_membership uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.memberships mgr ON mgr.id = m.managed_by
    JOIN public.profiles pf     ON pf.id = mgr.profile_id
    WHERE m.id = p_membership
      AND pf.id = auth.uid()
      AND mgr.status = 'active'
      AND m.workspace_id = mgr.workspace_id
  );
$$;

-- 5.3 get_leader_team(p_workspace_id): LEITURA ESCOPOADA — a equipe direta
--     (memberships ativas com managed_by = membership ativa do chamador naquele
--     workspace, cargo lider). Fail-closed: chamador sem membership de lider na
--     unidade → conjunto vazio.
CREATE OR REPLACE FUNCTION public.get_leader_team(p_workspace_id uuid)
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
    AND r.slug = 'lider'
    AND m.managed_by = me.id
    AND m.status = 'active'
  ORDER BY m.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.membership_is_manager_of(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.membership_is_manager_of(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_manages_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_manages_membership(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_leader_team(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_leader_team(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.membership_is_manager_of(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_manages_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leader_team(uuid) TO authenticated;

COMMENT ON FUNCTION public.membership_is_manager_of(uuid, uuid) IS
  'RBAC 2.0 (045): predicate — p_manager_membership é o gestor direto de p_membership (mesmo workspace, membro ativo).';
COMMENT ON FUNCTION public.user_manages_membership(uuid) IS
  'RBAC 2.0 (045): o chamador (auth.uid()) é gestor direto de p_membership via membership ativa no mesmo workspace.';
COMMENT ON FUNCTION public.get_leader_team(uuid) IS
  'RBAC 2.0 (045): equipe direta do líder chamador na unidade — memberships ativas managed_by = membership ativa dele (cargo lider). Fail-closed: sem membership de lider → vazio.';

-- =============================================================================
-- 6. Backfill memberships p/ perfis 'lider'/'role-lider' (espelho 040)
--    profiles.workspace_ids / profiles.role permanecem intocados.
-- =============================================================================

DO $$
DECLARE
  v_ct integer := 0;
BEGIN
  INSERT INTO public.memberships (profile_id, workspace_id, role_id, status)
  SELECT p.id, ws, r.id, 'active'
  FROM public.profiles p
  CROSS JOIN LATERAL unnest(p.workspace_ids) AS ws
  JOIN public.roles r ON r.slug = 'lider'
  WHERE p.role IN ('lider', 'role-lider')
  ON CONFLICT (profile_id, workspace_id) DO NOTHING;
  GET DIAGNOSTICS v_ct = ROW_COUNT;
  RAISE NOTICE 'rbac2 lider backfill: % memberships created (idempotent)', v_ct;
END $$;