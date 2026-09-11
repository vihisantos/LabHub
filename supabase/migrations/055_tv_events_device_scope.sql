-- =============================================================================
-- 055_tv_events_device_scope.sql
-- =============================================================================
-- Escopo POR TV (dispositivo) para eventos da TV.
--
-- Contexto:
--   O ReservaLab passa a criar o evento da TV direto no banco, perguntando em
--   qual TV do campus ele deve aparecer. Antes, tv_events era apenas
--   workspace-scoped: todas as TVs do campus exibiam o mesmo conteúdo.
--
-- Solução:
--   tv_events.device_id (nullable) referencia tv_devices(id).
--     - NULL => evento do campus (aparece em TODAS as TVs do workspace) —
--               preserva os eventos legados e o cadastro pelo painel do TV.
--     - id   => evento direcionado àquela TV; o display filtra
--               `device_id IS NULL OR device_id = <device da TV>`.
--
--   O device referenciado deve pertencer ao MESMO workspace do evento. Como a
--   escrita já é gated por tv_can_manage_workspace(workspace_id), adicionamos
--   um trigger de integridade para impedir atribuição cross-workspace.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
--   CREATE OR REPLACE FUNCTION / DROP TRIGGER IF EXISTS.
-- =============================================================================

BEGIN;

ALTER TABLE public.tv_events
  ADD COLUMN IF NOT EXISTS device_id uuid
  REFERENCES public.tv_devices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tv_events_device
  ON public.tv_events(device_id);

CREATE INDEX IF NOT EXISTS idx_tv_events_workspace_device
  ON public.tv_events(workspace_id, device_id, is_active, sort_order);

-- ─── Integridade: device_id só aponta para uma TV do mesmo workspace ────────
CREATE OR REPLACE FUNCTION public.tv_event_device_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ws uuid;
BEGIN
  IF NEW.device_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT d.workspace_id INTO v_ws
  FROM public.tv_devices d
  WHERE d.id = NEW.device_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEVICE_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  IF v_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'DEVICE_WORKSPACE_MISMATCH' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tv_event_device_guard ON public.tv_events;
CREATE TRIGGER trg_tv_event_device_guard
  BEFORE INSERT OR UPDATE OF device_id, workspace_id ON public.tv_events
  FOR EACH ROW EXECUTE FUNCTION public.tv_event_device_guard();

COMMIT;

-- =============================================================================
-- VERIFICAÇÃO PÓS-APLICAÇÃO:
--   SELECT device_id, count(*) FROM public.tv_events GROUP BY device_id;
--   -- device_id NULL = eventos de campus (todas as TVs)
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.tv_events'::regclass;
-- =============================================================================
