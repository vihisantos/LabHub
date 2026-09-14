-- =============================================================================
-- 059_tv_rbac_full_write.sql
-- =============================================================================
-- RESTRINGIR A ESCRITA DE CONTEÚDO DA TV AO NÍVEL `full` DO APP.
--
-- Contexto (auditoria TV):
--   As policies tv_* autorizavam escrita por qualquer membro do workspace
--   (tv_can_manage_workspace = is_super_admin() OR user_belongs_to_workspace()).
--   O frontend (AppAccessLevel do app 'tv') só concede mutação a `full`
--   (super admin OU override individual `profiles.app_access->>'tv' = 'full'`,
--   gravado via adminService.updateUserProfile). Resultado: um usuário `read`
--   conseguia criar/editar conteúdo e aprovar/rejeitar músicas pela API.
--
-- Solução (mesmo padrão da 050 — tablet_reservations):
--   1. Helper SECURITY DEFINER `user_can_manage_tv(ws_id)` — true se o usuário
--      tem nível `full` no app TV dentro do workspace.
--      Fonte (único sinal persistente no banco hoje): override individual
--      `profiles.app_access->>'tv' = 'full'`.
--      NOTA (Fase 2 / RBAC_2_ENABLED): a branch RBAC 2.0 (role_permissions
--      com tv.content.manage / music.moderate / tv.settings.manage /
--      tv.device.manage / tv.urgentAnnouncement por membership ativa) é
--      deliberadamente NÃO ativada aqui — as actions estão seedadas também
--      para o cargo 'tec' (036) e dariam mass-grant de escrita a todos os
--      técnicos, contradizendo o AppAccessLevel atual (tec = sem TV). Quando a
--      flag global subir, este helper deve ser estendido para espelhar as
--      memberships/role_permissions.
--   2. `tv_can_manage_workspace` passa a exigir `full` (read → SELECT apenas).
--      Como ela é o predicado de escrita de TODAS as tabelas tv_* (events,
--      playlists, queues, tracks, galleries, photos, calendar_cache,
--      urgent_announcements, devices), uma única mudança fecha o grupo inteiro.
--      O heartbeat do kiosk continua via tv_device_owned (030:225-226).
--   3. `tv_music_requests`: SELECT sai de USING(true) para
--      `can_access_tv_workspace(workspace_id)` (isola workspaces) e UPDATE vira
--      `is_super_admin() OR (user_belongs_to_workspace AND user_can_manage_tv)`
--      (aprovador humano). INSERT permanece self (auth.uid() = requested_by).
--
-- Semântica preservada:
--   - SELECT de conteúdo permanece para membro/super admin/dispositivo do
--     workspace (can_access_tv_workspace) — `read` continua lendo.
--   - Super admin não é tratado nos helpers (Invariante de policies:
--     is_super_admin() OR helper).
--   - Dispositivos: leitura e heartbeat próprios intactos; SÓ gestão
--     (rename/mover/excluir) passa a exigir `full` (bate com a UI: aba
--     Dispositivos é exclusiva de `full`).
--   - SECURITY DEFINER (dono BYPASSRLS) mesmo premissa da 049/050.
--
-- IDEMPOTENTE: DROP IF EXISTS / CREATE OR REPLACE.
-- =============================================================================

-- ─── 1. Helper — pode o auth.uid() GERENCIAR a TV no workspace? ──────────────
CREATE OR REPLACE FUNCTION public.user_can_manage_tv(ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ws_id IS NOT NULL
     AND (
       -- (a) override individual full do app TV (profiles.app_access)
       EXISTS (
         SELECT 1
         FROM public.profiles p
         WHERE p.id = auth.uid()
           AND COALESCE(p.app_access->>'tv', '') = 'full'
       )
     )
$$;

COMMENT ON FUNCTION public.user_can_manage_tv(uuid) IS
  'RBAC TV (059): true se auth.uid() tem nível `full` do app TV no workspace '
  '(override profiles.app_access; super admin é tratado pelas policies com '
  'is_super_admin() OR helper). Branch RBAC 2.0 role_permissions fica para a '
  'Fase 2 quando RBAC_2_ENABLED subir (actions seedadas p/ tec = mass-grant).';

-- ─── ACL (padrão 044/049/050) ────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.user_can_manage_tv(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_can_manage_tv(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_can_manage_tv(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.user_can_manage_tv(uuid) TO service_role;

-- ─── 2. Escrita de conteúdo TV restrita a `full` ─────────────────────────────
CREATE OR REPLACE FUNCTION public.tv_can_manage_workspace(p_ws uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT is_super_admin()
      OR (
        user_belongs_to_workspace(p_ws)
        AND public.user_can_manage_tv(p_ws)
      )
$$;

-- ─── 3. Pedidos de música: SELECT por workspace; UPDATE só `full` ────────────
DROP POLICY IF EXISTS "tv_music_requests_select" ON public.tv_music_requests;
CREATE POLICY "tv_music_requests_select"
  ON public.tv_music_requests FOR SELECT
  TO authenticated
  USING (public.can_access_tv_workspace(workspace_id));

DROP POLICY IF EXISTS "tv_music_requests_update" ON public.tv_music_requests;
CREATE POLICY "tv_music_requests_update"
  ON public.tv_music_requests FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.user_belongs_to_workspace(workspace_id)
      AND public.user_can_manage_tv(workspace_id)
    )
  );

-- =============================================================================
-- VERIFICAÇÃO PÓS-APLICAÇÃO:
--   * usuário `read` no ws: SELECT em tv_events/tv_music_requests ok; INSERT/
--     UPDATE/DELETE todos negados (tv_music_tracks por join da fila).
--   * usuário `full` no ws: SELECT + INSERT/UPDATE/DELETE ok (conteúdo e
--     aprovação de músicas).
--   * kiosk (device auth): SELECT ok; UPDATE tv_devices próprio (heartbeat) ok;
--     demais escrita negada.
--   * super admin: tudo ok.
-- ============================================================================