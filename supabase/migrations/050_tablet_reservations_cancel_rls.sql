-- =============================================================================
-- 050_tablet_reservations_cancel_rls.sql
-- =============================================================================
-- RESTRINGIR O CANCELAMENTO DE RESERVA DE TABLET AO NÍVEL `full` DO APP.
--
-- Contexto:
--   O PR #169 trocou o cancelamento (hard DELETE → soft UPDATE status='cancelada')
--   para funcionar para qualquer membro do workspace. Mas isso EXPÔS uma
--   inconsistência documentada no catálogo de Actions
--   (docs/architecture/rbac2.0-actions-catalog.md §4.5 / §8):
--     - UI: botão Cancelar só aparece para `getLevel('reservalab') === 'full'`
--           (Tablets.tsx:52; canCancel={canEdit}).
--     - RLS (028:232-243): UPDATE permitia QUALQUER membro
--           (user_belongs_to_workspace), sem checar o nível do app.
--   Resultado: um usuário com acesso `read` conseguia cancelar reserva de
--   outro professor pela API, mesmo sem ver o botão na interface.
--
-- Solução (Audit fix, opção A):
--   1. Função SECURITY DEFINER `user_can_cancel_tablet_reservation(ws_id uuid)`
--      que resolve o nível `full` de ReservaLab no BANCO (o frontend é
--      local-only e não é mecanismo de segurança):
--        a. override individual `profiles.app_access->>'reservalab' = 'full'`
--           (gravado pelo adminService.updateUserProfile);
--        b. OU action `reservelab.tablet.cancel` scope workspace via
--           membership ativa (RBAC 2.0 / role_permissions).
--      Super admin não é tratado aqui (Invariante 3): as policies continuam
--      contendo `is_super_admin() OR ...`, como no padrão do repo.
--   2. Policy UPDATE de tablet_reservations passa a exigir:
--        is_super_admin()
--        OR (user_belongs_to_workspace(workspace_id)  -- isolamento global
--            AND user_can_cancel_tablet_reservation(workspace_id))
--      O `user_belongs_to_workspace` garante que um override `full` nunca
--      vaze entre workspaces (o override é individual/global no profiles).
--
-- Semântica preservada:
--   - INSERT permanece para QUALQUER membro (criar reserva) — como `028`.
--   - SELECT permanece para membro/super admin — como `028`.
--   - DELETE continua super admin only — como `028`.
--   - Nenhum cargo default do RBAC 2.0 tem `reservelab.tablet.cancel` seedada
--     hoje; o acesso prático para não-super-admin é o override `full`
--     (profiles.app_access). Isso bate com a UI (técnico tem reservalab 'read').
--   - SECURITY DEFINER com dono BYPASSRLS (postgres no DEV/PROD): a leitura
--     interna de public.profiles / public.memberships / public.role_permissions
--     não re-dispara as policies (mesma premissa da 049).
--
-- ACL (padrão 044/049): REVOKE anon/PUBLIC, GRANT authenticated + service_role.
-- =============================================================================

-- ─── 1. Helper — pode o auth.uid() CANCELAR reservas de tablet no ws? ───────
CREATE OR REPLACE FUNCTION public.user_can_cancel_tablet_reservation(ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ws_id IS NOT NULL
     AND (
       -- (a) override individual full do app ReservaLab (profiles.app_access)
       EXISTS (
         SELECT 1
         FROM public.profiles p
         WHERE p.id = auth.uid()
           AND COALESCE(p.app_access->>'reservalab', '') = 'full'
       )
       -- (b) RBAC 2.0: action `reservelab.tablet.cancel` no workspace
       OR EXISTS (
         SELECT 1
         FROM public.memberships m
         JOIN public.role_permissions rp ON rp.role_id = m.role_id
         WHERE m.profile_id = auth.uid()
           AND m.workspace_id = ws_id
           AND m.status = 'active'
           AND rp.action = 'reservelab.tablet.cancel'
           AND rp.scope = 'workspace'
       )
     )
$$;

COMMENT ON FUNCTION public.user_can_cancel_tablet_reservation(uuid) IS
  'RBAC 2.0 + legado (050): true se auth.uid() tem nível `full` do app ReservaLab '
  'no workspace (override profiles.app_access) OU a Action reservelab.tablet.cancel '
  'por membership ativa. SECURITY DEFINER; super admin é tratado pelas policies '
  '(is_super_admin() OR helper AND user_belongs_to_workspace).';

-- ─── ACL ────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.user_can_cancel_tablet_reservation(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_can_cancel_tablet_reservation(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_can_cancel_tablet_reservation(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.user_can_cancel_tablet_reservation(uuid) TO service_role;

-- =============================================================================
-- 2. Policy UPDATE — cancelamento restrito ao nível `full`
-- =============================================================================
DROP POLICY IF EXISTS "tablet_reservations_update" ON public.tablet_reservations;
CREATE POLICY "tablet_reservations_update"
  ON public.tablet_reservations FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.user_belongs_to_workspace(workspace_id)
      AND public.user_can_cancel_tablet_reservation(workspace_id)
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.user_belongs_to_workspace(workspace_id)
      AND public.user_can_cancel_tablet_reservation(workspace_id)
    )
  );