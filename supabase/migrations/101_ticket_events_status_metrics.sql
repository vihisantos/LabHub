-- Guarda o estado de destino em eventos de status, para calcular durações
-- operacionais sem tentar interpretar observações em texto livre.
ALTER TABLE public.ticket_events
  ADD COLUMN IF NOT EXISTS "newStatus" TEXT;
