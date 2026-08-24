-- ============================================================================
-- 030: IDENTIDADE DO KIOSK TV + FECHAMENTO DO RLS DAS TABELAS tv_*
-- ============================================================================
-- CONTEXTO (auditado):
--   As tabelas tv_* tinham policies abertas (USING(true) para anon) porque o
--   kiosk desktop autenticava apenas com a anon key e filtrava workspace no
--   cliente. Qualquer pessoa com a anon key lia/escrevia dados de todos os
--   workspaces.
--
--   O kiosk agora possui identidade própria: na ativação o backend cria um
--   usuário GoTrue SEM SENHA (kiosk-{device_id}@devices.labhub.local,
--   user_metadata.role='tv_device'), vincula em tv_devices.user_id e entrega
--   uma sessão ao kiosk via token_hash (verifyOtp 'magiclink'). A sessão é
--   refreshada automaticamente pelo client e pode ser revogada desabilitando
--   o usuário admin-side.
--
-- MODELO DE ACESSO resultante:
--   * Leitura de conteúdo (events/playlists/filas/faixas/anúncios/galerias/
--     fotos/calendário/urgentes/devices): super admin OU membro do workspace
--     OU dispositivo vinculado ao workspace.
--   * Escrita de conteúdo: apenas super admin/membros (painel web). O device
--     só atualiza a própria linha em tv_devices (heartbeat last_seen).
--   * anon: nada (REVOKE + RLS).
--   * tv_activation_codes: continua sem policies (somente service_role).
--   * tv_music_requests: mantém policies próprias da 019 (TO authenticated);
--     device user é authenticated e pode ler; não tem perfil, logo não insere
--     (FK requested_by → profiles) nem aprova.
--
-- REALTIME: as policies abaixo são respeitadas pelo Realtime (postgres_changes)
-- usando o JWT da sessão do device — motivo pelo qual a solução usa usuários
-- GoTrue e não token em header customizado.
--
-- IDEMPOTENTE: DROP IF EXISTS / CREATE OR REPLACE.
-- ============================================================================

BEGIN;

-- ─── Helpers (SECURITY DEFINER para evitar recursão de policy em tv_devices) ─
CREATE OR REPLACE FUNCTION public.can_access_tv_workspace(p_ws uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- NULL = registro legado (mesma semântica da 027: permanece visível)
  SELECT p_ws IS NULL
     OR is_super_admin()
     OR user_belongs_to_workspace(p_ws)
     OR EXISTS (
       SELECT 1 FROM public.tv_devices d
       WHERE d.user_id = auth.uid() AND d.workspace_id = p_ws
     )
$$;

CREATE OR REPLACE FUNCTION public.tv_device_owned(p_device uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tv_devices d
    WHERE d.id = p_device AND d.user_id = auth.uid()
  )
$$;

-- Predicado de escrita (humano autorizado) reutilizado nas políticas:
CREATE OR REPLACE FUNCTION public.tv_can_manage_workspace(p_ws uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT is_super_admin() OR user_belongs_to_workspace(p_ws)
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- LIMPEZA: policies abertas legadas (inventário dos scripts manuais)
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "all" ON public.tv_events;
DROP POLICY IF EXISTS "tv_events_all" ON public.tv_events;

DROP POLICY IF EXISTS "all" ON public.tv_playlists;
DROP POLICY IF EXISTS "tv_playlists_all" ON public.tv_playlists;

DROP POLICY IF EXISTS "all" ON public.tv_announcements;
DROP POLICY IF EXISTS "tv_announcements_all" ON public.tv_announcements;
DROP POLICY IF EXISTS "Permitir tudo para anon" ON public.tv_announcements;

DROP POLICY IF EXISTS "Permitir tudo para anon" ON public.tv_music_queues;
DROP POLICY IF EXISTS "Permitir tudo para anon" ON public.tv_music_tracks;
DROP POLICY IF EXISTS "Permitir tudo para anon" ON public.tv_galleries;
DROP POLICY IF EXISTS "Permitir tudo para anon" ON public.tv_gallery_photos;
DROP POLICY IF EXISTS "Permitir tudo para anon" ON public.tv_calendar_cache;
DROP POLICY IF EXISTS "Permitir tudo para anon" ON public.tv_urgent_announcements;

DROP POLICY IF EXISTS "Dispositivos: tudo para anon" ON public.tv_devices;

-- ════════════════════════════════════════════════════════════════════════════
-- CONTEÚDO com workspace_id direto
-- ════════════════════════════════════════════════════════════════════════════

-- ─── tv_events ────────────────────────────────────────────────────────────────
CREATE POLICY "tv_events_select" ON public.tv_events FOR SELECT TO authenticated
  USING (can_access_tv_workspace(workspace_id));
CREATE POLICY "tv_events_insert" ON public.tv_events FOR INSERT TO authenticated
  WITH CHECK (tv_can_manage_workspace(workspace_id));
CREATE POLICY "tv_events_update" ON public.tv_events FOR UPDATE TO authenticated
  USING (tv_can_manage_workspace(workspace_id))
  WITH CHECK (tv_can_manage_workspace(workspace_id));
CREATE POLICY "tv_events_delete" ON public.tv_events FOR DELETE TO authenticated
  USING (tv_can_manage_workspace(workspace_id));

-- ─── tv_playlists ─────────────────────────────────────────────────────────────
CREATE POLICY "tv_playlists_select" ON public.tv_playlists FOR SELECT TO authenticated
  USING (can_access_tv_workspace(workspace_id));
CREATE POLICY "tv_playlists_insert" ON public.tv_playlists FOR INSERT TO authenticated
  WITH CHECK (tv_can_manage_workspace(workspace_id));
CREATE POLICY "tv_playlists_update" ON public.tv_playlists FOR UPDATE TO authenticated
  USING (tv_can_manage_workspace(workspace_id))
  WITH CHECK (tv_can_manage_workspace(workspace_id));
CREATE POLICY "tv_playlists_delete" ON public.tv_playlists FOR DELETE TO authenticated
  USING (tv_can_manage_workspace(workspace_id));

-- ─── tv_announcements ─────────────────────────────────────────────────────────
CREATE POLICY "tv_announcements_select" ON public.tv_announcements FOR SELECT TO authenticated
  USING (can_access_tv_workspace(workspace_id));
CREATE POLICY "tv_announcements_insert" ON public.tv_announcements FOR INSERT TO authenticated
  WITH CHECK (tv_can_manage_workspace(workspace_id));
CREATE POLICY "tv_announcements_update" ON public.tv_announcements FOR UPDATE TO authenticated
  USING (tv_can_manage_workspace(workspace_id))
  WITH CHECK (tv_can_manage_workspace(workspace_id));
CREATE POLICY "tv_announcements_delete" ON public.tv_announcements FOR DELETE TO authenticated
  USING (tv_can_manage_workspace(workspace_id));

-- ─── tv_music_queues ──────────────────────────────────────────────────────────
CREATE POLICY "tv_music_queues_select" ON public.tv_music_queues FOR SELECT TO authenticated
  USING (can_access_tv_workspace(workspace_id));
CREATE POLICY "tv_music_queues_insert" ON public.tv_music_queues FOR INSERT TO authenticated
  WITH CHECK (tv_can_manage_workspace(workspace_id));
CREATE POLICY "tv_music_queues_update" ON public.tv_music_queues FOR UPDATE TO authenticated
  USING (tv_can_manage_workspace(workspace_id))
  WITH CHECK (tv_can_manage_workspace(workspace_id));
CREATE POLICY "tv_music_queues_delete" ON public.tv_music_queues FOR DELETE TO authenticated
  USING (tv_can_manage_workspace(workspace_id));

-- ─── tv_music_tracks (filha: join na fila) ────────────────────────────────────
CREATE POLICY "tv_music_tracks_select" ON public.tv_music_tracks FOR SELECT TO authenticated
  USING (can_access_tv_workspace((
    SELECT q.workspace_id FROM public.tv_music_queues q WHERE q.id = queue_id
  )));
CREATE POLICY "tv_music_tracks_insert" ON public.tv_music_tracks FOR INSERT TO authenticated
  WITH CHECK (tv_can_manage_workspace((
    SELECT q.workspace_id FROM public.tv_music_queues q WHERE q.id = queue_id
  )));
CREATE POLICY "tv_music_tracks_update" ON public.tv_music_tracks FOR UPDATE TO authenticated
  USING (tv_can_manage_workspace((
    SELECT q.workspace_id FROM public.tv_music_queues q WHERE q.id = queue_id
  )))
  WITH CHECK (tv_can_manage_workspace((
    SELECT q.workspace_id FROM public.tv_music_queues q WHERE q.id = queue_id
  )));
CREATE POLICY "tv_music_tracks_delete" ON public.tv_music_tracks FOR DELETE TO authenticated
  USING (tv_can_manage_workspace((
    SELECT q.workspace_id FROM public.tv_music_queues q WHERE q.id = queue_id
  )));

-- ─── tv_galleries ─────────────────────────────────────────────────────────────
CREATE POLICY "tv_galleries_select" ON public.tv_galleries FOR SELECT TO authenticated
  USING (can_access_tv_workspace(workspace_id));
CREATE POLICY "tv_galleries_insert" ON public.tv_galleries FOR INSERT TO authenticated
  WITH CHECK (tv_can_manage_workspace(workspace_id));
CREATE POLICY "tv_galleries_update" ON public.tv_galleries FOR UPDATE TO authenticated
  USING (tv_can_manage_workspace(workspace_id))
  WITH CHECK (tv_can_manage_workspace(workspace_id));
CREATE POLICY "tv_galleries_delete" ON public.tv_galleries FOR DELETE TO authenticated
  USING (tv_can_manage_workspace(workspace_id));

-- ─── tv_gallery_photos (filha: join na galeria) ───────────────────────────────
CREATE POLICY "tv_gallery_photos_select" ON public.tv_gallery_photos FOR SELECT TO authenticated
  USING (can_access_tv_workspace((
    SELECT g.workspace_id FROM public.tv_galleries g WHERE g.id = gallery_id
  )));
CREATE POLICY "tv_gallery_photos_insert" ON public.tv_gallery_photos FOR INSERT TO authenticated
  WITH CHECK (tv_can_manage_workspace((
    SELECT g.workspace_id FROM public.tv_galleries g WHERE g.id = gallery_id
  )));
CREATE POLICY "tv_gallery_photos_update" ON public.tv_gallery_photos FOR UPDATE TO authenticated
  USING (tv_can_manage_workspace((
    SELECT g.workspace_id FROM public.tv_galleries g WHERE g.id = gallery_id
  )))
  WITH CHECK (tv_can_manage_workspace((
    SELECT g.workspace_id FROM public.tv_galleries g WHERE g.id = gallery_id
  )));
CREATE POLICY "tv_gallery_photos_delete" ON public.tv_gallery_photos FOR DELETE TO authenticated
  USING (tv_can_manage_workspace((
    SELECT g.workspace_id FROM public.tv_galleries g WHERE g.id = gallery_id
  )));

-- ─── tv_calendar_cache ────────────────────────────────────────────────────────
CREATE POLICY "tv_calendar_cache_select" ON public.tv_calendar_cache FOR SELECT TO authenticated
  USING (can_access_tv_workspace(workspace_id));
CREATE POLICY "tv_calendar_cache_insert" ON public.tv_calendar_cache FOR INSERT TO authenticated
  WITH CHECK (tv_can_manage_workspace(workspace_id));
CREATE POLICY "tv_calendar_cache_update" ON public.tv_calendar_cache FOR UPDATE TO authenticated
  USING (tv_can_manage_workspace(workspace_id))
  WITH CHECK (tv_can_manage_workspace(workspace_id));
CREATE POLICY "tv_calendar_cache_delete" ON public.tv_calendar_cache FOR DELETE TO authenticated
  USING (tv_can_manage_workspace(workspace_id));

-- ─── tv_urgent_announcements ──────────────────────────────────────────────────
CREATE POLICY "tv_urgent_select" ON public.tv_urgent_announcements FOR SELECT TO authenticated
  USING (can_access_tv_workspace(workspace_id));
CREATE POLICY "tv_urgent_insert" ON public.tv_urgent_announcements FOR INSERT TO authenticated
  WITH CHECK (tv_can_manage_workspace(workspace_id));
CREATE POLICY "tv_urgent_update" ON public.tv_urgent_announcements FOR UPDATE TO authenticated
  USING (tv_can_manage_workspace(workspace_id))
  WITH CHECK (tv_can_manage_workspace(workspace_id));
CREATE POLICY "tv_urgent_delete" ON public.tv_urgent_announcements FOR DELETE TO authenticated
  USING (tv_can_manage_workspace(workspace_id));

-- ════════════════════════════════════════════════════════════════════════════
-- DISPOSITIVOS (leitura pelo workspace; update próprio p/ heartbeat)
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY "tv_devices_select" ON public.tv_devices FOR SELECT TO authenticated
  USING (can_access_tv_workspace(workspace_id));
CREATE POLICY "tv_devices_insert" ON public.tv_devices FOR INSERT TO authenticated
  WITH CHECK (tv_can_manage_workspace(workspace_id)); -- provisionamento normal é via backend (service_role)
CREATE POLICY "tv_devices_update" ON public.tv_devices FOR UPDATE TO authenticated
  USING (tv_can_manage_workspace(workspace_id) OR tv_device_owned(id))
  WITH CHECK (tv_can_manage_workspace(workspace_id) OR tv_device_owned(id));
CREATE POLICY "tv_devices_delete" ON public.tv_devices FOR DELETE TO authenticated
  USING (tv_can_manage_workspace(workspace_id));

-- ════════════════════════════════════════════════════════════════════════════
-- REVOKE anon (defesa em profundidade; RLS já nega)
-- ════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON public.tv_events FROM anon;
REVOKE ALL ON public.tv_playlists FROM anon;
REVOKE ALL ON public.tv_announcements FROM anon;
REVOKE ALL ON public.tv_music_queues FROM anon;
REVOKE ALL ON public.tv_music_tracks FROM anon;
REVOKE ALL ON public.tv_galleries FROM anon;
REVOKE ALL ON public.tv_gallery_photos FROM anon;
REVOKE ALL ON public.tv_calendar_cache FROM anon;
REVOKE ALL ON public.tv_urgent_announcements FROM anon;
REVOKE ALL ON public.tv_devices FROM anon;
REVOKE ALL ON public.tv_activation_codes FROM anon, authenticated;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO PÓS-APLICAÇÃO:
--   * Com anon key: nenhum SELECT deve retornar linhas de tv_*.
--   * Sessão de device: vê somente conteúdo do próprio workspace; consegue
--     UPDATE tv_devices (last_seen) na própria linha; NÃO consegue inserir/
--     alterar conteúdo.
--   * Usuário admin web: mantém leitura/escrita como antes (membro/super).
-- ============================================================================
