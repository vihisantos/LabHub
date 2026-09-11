-- =============================================================================
-- 057_app_notifications.sql
-- =============================================================================
-- Notificações in-app (sino) broadcast do painel do admin, persistidas no
-- servidor para entrega cross-device via polling (sem depender de sync local
-- nem de Realtime). A entrega por PUSH continua no fluxo existente.
--
-- Contexto:
--   - A aba "Enviar notificação" do admin criava a notificação só no IndexedDB
--     do PRÓPRIO dispositivo (sem alcance a outros usuários). O único canal
--     cross-device era o push (que também estava desligado — corrigido).
--   - Esta tabela é a fonte de verdade das notificações enviadas; o backend
--     (service_role) insere no envio e expõe via GET /api/app-notifications,
--     escopado por workspace. O estado "lido" permanece local por dispositivo.
--
-- Acesso: SOMENTE backend (service_role/owner). Nenhuma policy de SELECT/INSERT
-- para `authenticated` — o cliente NUNCA lê/escreve esta tabela diretamente.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_notifications (
  id                  text PRIMARY KEY,
  workspace_id        uuid,
  title               text NOT NULL,
  body                text NOT NULL DEFAULT '',
  type                text NOT NULL DEFAULT 'system',
  severity            text NOT NULL DEFAULT 'info',
  module              text,
  audience            text,
  target_role         text,
  target_super_admin  boolean,
  target_user_id      uuid,
  action_url          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_notifications_created
  ON public.app_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_notifications_workspace
  ON public.app_notifications (workspace_id);

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_notifications FORCE ROW LEVEL SECURITY;

COMMIT;