-- ============================================================================
-- 037: DEVICE REVOCATION — revoked_at em tv_devices
-- ============================================================================
-- OBJETIVO:
--   Adicionar revoked_at para permitir revogação programática de devices TV
--   sem deletar a row (preserva registro para auditoria e gerenciamento).
--
-- COMPATIBILIDADE:
--   - Idempotente: ADD COLUMN IF NOT EXISTS
--   - Dispositivos existentes começam com revoked_at = NULL (ativos)
--   - Não altera dados existentes
--   - Não remove colunas nem tabelas
--
-- FLUXO:
--   admin → POST /api/tv/devices/{id}/revoke
--   → tv_devices.revoked_at = NOW()
--   → _resolve_tv_device_workspace() rejeita (revoked_at != NULL)
--   → device recebe 403 em chamados/display e demais rotas protegidas
-- ============================================================================

BEGIN;

ALTER TABLE public.tv_devices
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz DEFAULT NULL;

COMMIT;
