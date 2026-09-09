-- =============================================================================
-- 051_tablet_reservations_audit_and_notify_settings.sql
-- =============================================================================
-- ReservaLab — auditoria de reservas de tablets + mute de notificações.
--
-- Contexto:
--   1. `tablet_reservations` não tem identidade: `professor`/`reservado_por`
--      são texto livre. Não dá para saber QUEM (usuário logado) criou nem
--      quem cancelou a reserva — zero rastreabilidade (audit RBAC 2.0).
--   2. `notify_settings` (mute/canais por app) existe no frontend
--      (core/auth/types.ts) e no backend (app.py), mas NUNCA existiu no banco.
--      PATCH de perfil carregando o campo falha no nível do banco — o mute
--      de notificações é inoperante (gap analysis RBAC 2.0).
--
-- Ação:
--   1. tablet_reservations:
--      - + created_by (uuid, auth.users), created_at, cancelled_by (uuid),
--        cancelled_at — todos NULLABLE: reservas históricas continuam válidas.
--      - Índices para o cron de limpeza (cancelled_at) e consultas por criador.
--   2. profiles:
--      - + notify_settings jsonb NOT NULL DEFAULT '{}'::jsonb
--        (estrutura esperada pelo app: { muted?: bool, apps?: { [app]: { inapp, push } } })
--
-- TÉCNICA: idempotente (IF NOT EXISTS / IF NOT col). Nenhuma linha é alterada.
-- RLS: colunas novas herdam as policies existentes da tabela (SELECT/UPDATE já
-- restrictivas; DELETE segue 050/super admin). Sem policy nova necessária.

-- =============================================================================
-- 1. tablet_reservations — identidade de criação/cancelamento
-- =============================================================================

ALTER TABLE public.tablet_reservations
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.tablet_reservations
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

ALTER TABLE public.tablet_reservations
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.tablet_reservations
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Backfill best-effort: reservas antigas ganham created_at = horario_inicio
-- (melhor aproximação disponível; created_by/cancelled_* ficam NULL).
UPDATE public.tablet_reservations
SET created_at = horario_inicio
WHERE created_at IS NULL;

COMMENT ON COLUMN public.tablet_reservations.created_by IS
  'Usuário autenticado que criou a reserva (identidade real, não texto livre)';
COMMENT ON COLUMN public.tablet_reservations.cancelled_by IS
  'Usuário autenticado que cancelou a reserva (soft-delete status=cancelada)';

-- Índices: cron de limpeza por cancelled_at + consultas "minhas reservas"
CREATE INDEX IF NOT EXISTS idx_tablet_reservations_cancelled_at
  ON public.tablet_reservations (cancelled_at)
  WHERE status = 'cancelada';

CREATE INDEX IF NOT EXISTS idx_tablet_reservations_created_by
  ON public.tablet_reservations (created_by);

-- =============================================================================
-- 2. profiles — notify_settings (mute/canais por app)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'notify_settings'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN notify_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.notify_settings IS
  'Preferências de notificação por app: { muted?: boolean, apps?: { [appId]: { inapp?: boolean, push?: boolean } } } — respeitadas no envio de push/in-app';

-- =============================================================================
-- 3. Verificação
-- =============================================================================

DO $$
DECLARE
  v_missing text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tablet_reservations' AND column_name = 'cancelled_at'
  ) THEN
    v_missing := 'tablet_reservations.cancelled_at';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'notify_settings'
  ) THEN
    v_missing := coalesce(v_missing || ', ', '') || 'profiles.notify_settings';
  END IF;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: colunas não criadas: %', v_missing;
  END IF;
END $$;
