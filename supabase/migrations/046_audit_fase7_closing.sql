-- =============================================================================
-- 046_audit_fase7_closing.sql
-- =============================================================================
-- RBAC 2.0 — FASE 7.7 (AUDITORIA DE FECHAMENTO): REFORÇO DA GUARDA DE
-- `memberships.managed_by` E DA LEITURA ESCOPOADA.
--
-- Resultado da auditoria 7.7 contra a migration 045 e a RLS de 036/044:
--   1. [GAP] Trigger só disparava em `UPDATE OF managed_by`. Um UPDATE de
--      `workspace_id` com managed_by intacto criava um vínculo cross-workspace
--      sem guarda; e `get_leader_team` NÃO filtrava `m.workspace_id` (confiava
--      só no trigger). → UPDATE OF managed_by, workspace_id + filtro explícito.
--   2. [GAP] Detecção de ciclo rodava apenas no UPDATE; INSERT com id
--      já-referenciado (ciclo criado na inserção) passava. → checagem também
--      no INSERT (custo zero em inserts normais: o novo uuid nunca é ancestral).
--   3. [GAP] Cargo 'lider' podia gerenciar outro 'lider' no MESMO workspace
--      (a trigger não validava cargo do gestor). → gestor precisa ser cargo de
--      liderança ('lider'|'coordinator'); 'lider' não gerencia 'lider' na mesma
--      unidade (o coordenador — Fase 8 — gere lideres em outro mecanismo).
--
-- Fechados (auditou OK, sem alteração): RLS write super-admin-only (036);
-- helpers SECURITY DEFINER search_path=public com REVOKE anon/PUBLIC;
-- fail-closed (auth.uid() + slug 'lider' + status active); guard /lider
-- cargo-based; super admin sem memberships (041) e fora das áreas.
--
-- IDEMPOTÊNCIA: CREATE OR REPLACE / DROP TRIGGER IF EXISTS — replay seguro.
-- =============================================================================

-- =============================================================================
-- 1. get_leader_team ← escopo por workspace EXPLÍCITO (defense-in-depth)
--    A equipe devolvida precisa estar na unidade consultada, independente do
--    estado da trigger (linha movida via UPDATE direto, bug futuro, etc.).
-- =============================================================================

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
    AND m.workspace_id = p_workspace_id
  ORDER BY m.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_leader_team(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_leader_team(uuid) FROM anon;

-- =============================================================================
-- 2. Trigger guarda ← UPDATE OF managed_by, workspace_id + ciclo em INSERT +
--       cargo do gestor (liderança; sem lider→lider na mesma unidade)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_memberships_manager_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws          uuid;
  v_status      text;
  v_mgr_role    text;
  v_member_role text;
  v_loop        int;
  v_depth       int := 64;
BEGIN
  IF NEW.managed_by IS NULL THEN
    RETURN NEW; -- remover da equipe / sem gestor: sempre permitido
  END IF;

  IF NEW.managed_by = NEW.id THEN
    RAISE EXCEPTION 'membership cannot manage itself (managed_by = id)';
  END IF;

  SELECT m.workspace_id, m.status, r.slug
  INTO v_ws, v_status, v_mgr_role
  FROM public.memberships m
  JOIN public.roles r ON r.id = m.role_id
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

  -- Gestão é relação entre cargos de liderança. Um 'lider' não gerencia outro
  -- 'lider' na mesma unidade (subordinação de lideres é competência do
  -- coordenador — Fase 8, mecanismo próprio).
  SELECT r.slug INTO v_member_role
  FROM public.roles r
  WHERE r.id = NEW.role_id;

  IF v_mgr_role NOT IN ('lider', 'coordinator') THEN
    RAISE EXCEPTION 'manager must be a leadership role (found %)', v_mgr_role;
  END IF;

  IF v_mgr_role = 'lider' AND v_member_role = 'lider' THEN
    RAISE EXCEPTION 'a lider cannot directly manage another lider in the same workspace';
  END IF;

  -- Detecção de ciclo (INSERT e UPDATE): o novo gestor não pode ser
  -- descendente de si mesmo. Em INSERTs normais o id recém-gerado nunca é
  -- ancestral — a checagem cobre INSERT com id já referenciado (criação de
  -- ciclo explícito), sem custo no caminho comum.
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_memberships_manager_guard ON public.memberships;
CREATE TRIGGER trg_memberships_manager_guard
  BEFORE INSERT OR UPDATE OF managed_by, workspace_id
  ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_memberships_manager_guard();

REVOKE ALL ON FUNCTION public.trg_memberships_manager_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_memberships_manager_guard() FROM anon;
GRANT EXECUTE ON FUNCTION public.trg_memberships_manager_guard() TO authenticated;

COMMENT ON FUNCTION public.trg_memberships_manager_guard() IS
  'RBAC 2.0 (045+046): guarda estrutural de memberships.managed_by — mesmo '
  'workspace (incluindo em UPDATE de workspace_id), gestor ativo e de cargo de '
  'liderança, sem lider→lider na mesma unidade, sem ciclos (INSERT e UPDATE). '
  'SECURITY DEFINER; RLS de escrita é super-admin-only (036).';

COMMENT ON FUNCTION public.get_leader_team(uuid) IS
  'RBAC 2.0 (045+046): equipe direta do líder chamador na unidade — memberships '
  'ativas com managed_by = membership ativa dele (cargo lider) E naquele workspace. '
  'Fail-closed: sem membership de lider → vazio; escopo por workspace é explícito.';

-- =============================================================================
-- 3. (Documentação) Reafirma os invariantes da relação de gestão.
-- =============================================================================

COMMENT ON COLUMN public.memberships.managed_by IS
  'RBAC 2.0 (045+046): membership do gestor direto. Invariantes: mesmo workspace; '
  'gestor ativo e com cargo de liderança (lider/coordinator); lider não gerencia '
  'lider na mesma unidade; sem ciclos; ON DELETE SET NULL fall-closed se o gestor '
  'perder a membership. Escrita super-admin-only (RLS 036).';