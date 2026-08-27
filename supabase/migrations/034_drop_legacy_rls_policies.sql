-- =============================================================================
-- 034: Drop legacy RLS policies that bypass workspace isolation
--
-- PROBLEMA:
--   5 conjuntos de policies legadas sobreviveram a todas as migrations anteriores
--   (027, 028, 029, 030, 033). Por serem PERMISSIVE (OR entre policies), uma
--   única policy USING(true) torna inócuas todas as policies workspace-scoped
--   criadas nas migrations anteriores.
--
-- POLICIES LEGADAS (5 vulnerabilidades):
--
--   1. tablet_reservations — 4 policies com USING(true)
--      "Ler reservas"       SELECT  USING=true
--      "Inserir reservas"   INSERT  CHECK=true
--      "Atualizar reservas" UPDATE  USING=true
--      "Excluir reservas"   DELETE  USING=true
--      → Qualquer usuário autenticado lê/escreve/modifica/deleta TODAS as
--        reservas de tablet de TODOS os workspaces.
--
--   2. tv_devices — 4 policies com auth.role()='authenticated'
--      "Dispositivos: leitura autenticada"  SELECT  USING=auth.role()='authenticated'
--      "Dispositivos: insert autenticado"   INSERT  CHECK=auth.role()='authenticated'
--      "Dispositivos: update autenticado"   UPDATE  USING=auth.role()='authenticated'
--      "Dispositivos: delete autenticado"   DELETE  USING=auth.role()='authenticated'
--      → Qualquer usuário autenticado lê/escreve/modifica/deleta QUALQUER device
--        em QUALQUER workspace.
--
--   3. stock.notifications — 1 policy com USING(true)
--      "notifications_all_access"  ALL  USING=true  CHECK=true
--      → Qualquer usuário acessa todas as notificações de estoque.
--
--   4. public.notifications — 1 policy com USING(true)
--      "notifications_all_authenticated"  ALL  USING=true  CHECK=true
--      → Qualquer usuário acessa todas as notificações do app.
--
--   5. public.assets — 4 policies com check inline (vs. function)
--      "assets_select"   SELECT  USING=is_super_admin() OR workspace_id IN unnest(...)
--      "assets_insert"   INSERT  CHECK=...  (inline)
--      "assets_update"   UPDATE  USING=...  (inline)
--      "assets_delete"   DELETE  USING=is_super_admin() OR workspace_id IN unnest(...)
--      → A policy de DELETE permite membros do workspace deletarem, enquanto a
--        policy nova (public_assets_delete) restringe a is_super_admin().
--
-- SUBSTITUIÇÃO:
--   - tablet_reservations: policies da 028 NÃO existem no DB → precisa criar
--   - tv_devices: policies da 030 já existem (tv_devices_select/insert/update/delete)
--   - stock.notifications: policies da 033 já existem (notifications_select/insert/update/delete)
--   - public.notifications: NÃO tem substituto → precisa criar
--   - public.assets: policies da 033 já existem (public_assets_select/insert/update/delete)
--
-- EXCEÇÕES (não alterar):
--   - stock.notifications NULL workspace_id: global por design
--   - workspace_backups, workspace_audit_logs: service_role only
--   - tv_music_tracks, tv_gallery_photos: child tables via JOIN
--
-- IDEMPOTENTE: DROP POLICY IF EXISTS — pode rodar em qualquer estado.
-- =============================================================================

BEGIN;

-- ─── 1. tablet_reservations: remover 4 policies legadas USING(true) ────────
-- As policies workspace-scoped da migration 028 NÃO existem no DB (nunca foram
-- aplicadas em produção). Criar substituição idêntica à 028.
DROP POLICY IF EXISTS "Ler reservas"         ON public.tablet_reservations;
DROP POLICY IF EXISTS "Inserir reservas"     ON public.tablet_reservations;
DROP POLICY IF EXISTS "Atualizar reservas"   ON public.tablet_reservations;
DROP POLICY IF EXISTS "Excluir reservas"     ON public.tablet_reservations;

CREATE POLICY "tablet_reservations_select"
  ON public.tablet_reservations FOR SELECT
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "tablet_reservations_insert"
  ON public.tablet_reservations FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "tablet_reservations_update"
  ON public.tablet_reservations FOR UPDATE
  USING (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  )
  WITH CHECK (
    is_super_admin()
    OR user_belongs_to_workspace(workspace_id)
  );

CREATE POLICY "tablet_reservations_delete"
  ON public.tablet_reservations FOR DELETE
  USING (
    is_super_admin()
  );

-- ─── 2. tv_devices: remover 4 policies legadas auth.role() ────────────────
-- As policies workspace-scoped (tv_devices_select/insert/update/delete)
-- já existem da migration 030.
DROP POLICY IF EXISTS "Dispositivos: leitura autenticada"   ON public.tv_devices;
DROP POLICY IF EXISTS "Dispositivos: insert autenticado"    ON public.tv_devices;
DROP POLICY IF EXISTS "Dispositivos: update autenticado"    ON public.tv_devices;
DROP POLICY IF EXISTS "Dispositivos: delete autenticado"    ON public.tv_devices;

-- ─── 3. stock.notifications: remover policy legada USING(true) ─────────────
-- As policies workspace-scoped (notifications_select/insert/update/delete)
-- já existem da migration 033.
DROP POLICY IF EXISTS "notifications_all_access" ON stock.notifications;

-- ─── 4. public.notifications: remover policy legada USING(true) ────────────
-- Esta tabela NÃO tem policies workspace-scoped. Criar substituição.
-- Nota: workspace_id é text (não uuid), então usa user_belongs_to_workspace(text).
DROP POLICY IF EXISTS "notifications_all_authenticated" ON public.notifications;

-- Criar policies workspace-scoped para public.notifications
CREATE POLICY "notifications_select"
  ON public.notifications FOR SELECT
  USING (is_super_admin() OR user_belongs_to_workspace(workspace_id));

CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT
  WITH CHECK (is_super_admin() OR user_belongs_to_workspace(workspace_id));

CREATE POLICY "notifications_update"
  ON public.notifications FOR UPDATE
  USING (is_super_admin() OR user_belongs_to_workspace(workspace_id))
  WITH CHECK (is_super_admin() OR user_belongs_to_workspace(workspace_id));

CREATE POLICY "notifications_delete"
  ON public.notifications FOR DELETE
  USING (is_super_admin());

-- ─── 5. public.assets: remover 4 policies legadas inline ───────────────────
-- As policies workspace-scoped (public_assets_select/insert/update/delete)
-- já existem da migration 033 e são MAIS restritivas (DELETE = super_admin only).
DROP POLICY IF EXISTS "assets_select" ON public.assets;
DROP POLICY IF EXISTS "assets_insert" ON public.assets;
DROP POLICY IF EXISTS "assets_update" ON public.assets;
DROP POLICY IF EXISTS "assets_delete" ON public.assets;

COMMIT;

-- =============================================================================
-- VERIFICAÇÃO PÓS-APLICAÇÃO:
--
-- 1. Confirmar que nenhuma policy USING(true) ou auth.role() permanece:
--
--   SELECT schemaname, tablename, policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname IN ('public', 'stock')
--     AND tablename NOT IN ('profiles', 'workspaces', 'workspace_backups', 'workspace_audit_logs')
--     AND (
--       qual = 'true'
--       OR qual LIKE '%auth.role()%'
--       OR with_check = 'true'
--     )
--   ORDER BY schemaname, tablename;
--
-- 2. Confirmar que todas as tabelas workspace-scoped têm policies:
--
--   SELECT schemaname, tablename, count(*) as policy_count
--   FROM pg_policies
--   WHERE schemaname IN ('public', 'stock')
--     AND tablename NOT IN ('profiles', 'workspaces', 'workspace_backups', 'workspace_audit_logs')
--   GROUP BY schemaname, tablename
--   HAVING count(*) < 4
--   ORDER BY schemaname, tablename;
--
-- 3. Confirmar que public.notifications agora tem policies:
--
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE tablename = 'notifications' AND schemaname = 'public'
--   ORDER BY cmd;
-- =============================================================================
