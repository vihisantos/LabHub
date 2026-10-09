-- =============================================================================
-- 090_chamados_espera_indeferido.sql
-- =============================================================================
-- Issue #367 — Em espera e Indeferimento no fluxo operacional de Chamados.
--
-- Persistência ESTRUTURADA do motivo (não depende de texto livre):
--   - chamados_tickets: reasonCode (código predefinido), reasonLabel
--     (descrição resolvida pelo backend) e reasonNote (observação opcional).
--   - ticket_events: reasonCode e reasonLabel por evento de status, para o
--     histórico registrar estado anterior/novo + motivo (mesma infraestrutura,
--     sem sistema paralelo de auditoria).
--
-- `status` continua TEXT sem enum/CHECK (padrão do projeto desde a 000): a
-- validação de estado e de motivo vive na API Flask (chamados_manage), que é
-- a autoridade única sobre as tabelas de ticket (RLS fechado, service_role).
--
-- Aditivo e idempotente: colunas NULLáveis, sem backfill necessário — chamados
-- existentes não têm motivo e permanecem válidos. NÃO altera policies/RLS.
-- =============================================================================

BEGIN;

ALTER TABLE public.chamados_tickets
  ADD COLUMN IF NOT EXISTS "reasonCode" text,
  ADD COLUMN IF NOT EXISTS "reasonLabel" text,
  ADD COLUMN IF NOT EXISTS "reasonNote" text;

ALTER TABLE public.ticket_events
  ADD COLUMN IF NOT EXISTS "reasonCode" text,
  ADD COLUMN IF NOT EXISTS "reasonLabel" text;

COMMIT;
