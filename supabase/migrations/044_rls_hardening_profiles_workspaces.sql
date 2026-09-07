-- =============================================================================
-- 044_rls_hardening_profiles_workspaces.sql
-- =============================================================================
-- RLS HARDENING de `profiles` e `workspaces` (Issue #158).
--
-- Contexto:
--   Os dois USING(true) de leitura (profiles_select / workspaces_select) deixam
--   QUALQUER usuário autenticado ler todos os perfis (email, is_super_admin,
--   workspace_ids, app_access) e todos os campi — débito #158 da auditoria
--   pós-produção do RBAC 2.0 (confirmado em PROD via pg_policies, ETAPA 044-A).
--
-- Ação (ETAPA 044-B design; este arquivo = implementação):
--   1. Cria a helper SECURITY DEFINER `profile_visible_to_me(target_user uuid)`:
--      true se target == auth.uid() OR is_super_admin() OR existe workspace onde
--      EU tenho membership ativa (memberships.status='active') E o target também.
--      Fonte: public.memberships (036) — coluna REAL `profile_id` (não user_id).
--      Fail-closed: NULL / target inexistente / sem overlap → false.
--   2. profiles_select: `USING(true)` → `id = auth.uid() OR is_super_admin()
--      OR profile_visible_to_me(id)`.
--   3. workspaces_select: `USING(true)` → `is_super_admin()
--      OR user_belongs_to_workspace(id)` (reutiliza helper existente, que lê
--      `profiles.workspace_ids` — alinhado ao filtro client-side do frontend;
--      drift workspace_ids↔memberships documentado no design §6/Q1).
--   4. Consolidação das policies de escrita de workspaces para `is_super_admin()`
--      (era 009 `role='admin'` em PROD / idempotente se já for 028 no DEV).
--
-- NÃO altera: profiles_insert/update/delete (próprias), admin_abs_edit/delete
-- (super admin), memberships/roles/role_permissions/membership_overrides/
-- rbac_audit_logs, nem o schema de colunas. Nenhum view/RPC criado.
--
-- SEGURANÇA (revisão §12 do design):
--   · search_path fixo e público (SET search_path = public); referências
--     qualificadas public.* e auth.uid() — sem captura de schema.
--   · SECURITY DEFINER owner=postgres (runner) → leitura de memberships sob
--     owner; NÃO há ciclo RLS (helpers definer não reavaliam RLS).
--   · Retorna APENAS boolean; sem parâmetro de workspace/role → sem pivot.
--   · Grants: REVOKE de anon/PUBLIC + GRANT a authenticated/service_role
--     (lição da 028: nunca REVOKE órfão de PUBLIC em helper usada por policy).
--
-- IDEMPOTÊNCIA (replay seguro pelo runner, cf. 042/043):
--   · CREATE OR REPLACE FUNCTION — idempotente por definição.
--   · DROP POLICY IF EXISTS + CREATE POLICY — recria com a definição desejada.
--   · REVOKE/GRANT — idempotentes.

-- =============================================================================
-- 1. Helper de visibilidade de perfis por membership ativa
-- =============================================================================

CREATE OR REPLACE FUNCTION public.profile_visible_to_me(target_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT target_user IS NOT NULL AND (
    target_user = auth.uid()
    OR COALESCE((
      SELECT p.is_super_admin
      FROM public.profiles p
      WHERE p.id = auth.uid()
    ), false)
    OR EXISTS (
      SELECT 1
      FROM public.memberships m_mine
      JOIN public.memberships m_other
        ON m_other.workspace_id = m_mine.workspace_id
      WHERE m_mine.profile_id = auth.uid()
        AND m_mine.status = 'active'
        AND m_other.profile_id = target_user
        AND m_other.status = 'active'
    )
  );
$function$;

-- =============================================================================
-- 2. Grants da helper (idempotentes; lição 028 — REVOKE órfão quebra policies)
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.profile_visible_to_me(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.profile_visible_to_me(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.profile_visible_to_me(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.profile_visible_to_me(uuid) TO service_role;

-- =============================================================================
-- 3. profiles_select — remover USING(true)
-- =============================================================================

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.is_super_admin()
    OR public.profile_visible_to_me(id)
  );

-- =============================================================================
-- 4. workspaces_select — remover USING(true)
-- =============================================================================

DROP POLICY IF EXISTS "workspaces_select" ON public.workspaces;

CREATE POLICY "workspaces_select"
  ON public.workspaces FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_belongs_to_workspace(id)
  );

-- =============================================================================
-- 5. Consolidação das policies de escrita de workspaces (009 era role='admin'
--    -> is_super_admin(); já-028 no DEV -> DROP+CREATE idempotente)
-- =============================================================================

DROP POLICY IF EXISTS "workspaces_insert" ON public.workspaces;

CREATE POLICY "workspaces_insert"
  ON public.workspaces FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "workspaces_update" ON public.workspaces;

CREATE POLICY "workspaces_update"
  ON public.workspaces FOR UPDATE
  TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "workspaces_delete" ON public.workspaces;

CREATE POLICY "workspaces_delete"
  ON public.workspaces FOR DELETE
  TO authenticated
  USING (public.is_super_admin());

-- =============================================================================
-- 6. Documentação
-- =============================================================================

COMMENT ON FUNCTION public.profile_visible_to_me(uuid) IS
  'RLS 044: visibilidade de perfis por membership ativa (memberships.status=active '
  'na coluna profile_id da 036). Fail-closed: próprio | super admin | overlap de '
  'workspaces ativos. SECURITY DEFINER, search_path public.';