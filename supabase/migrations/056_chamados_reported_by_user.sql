-- =============================================================================
-- 056_chamados_reported_by_user.sql
-- =============================================================================
-- Vínculo do chamado ao AUTOR logado (reportedByUserId), para notificar o
-- próprio solicitante pelo app e futura lista "Meus chamados".
--
-- Contexto:
--   - O formulário público de chamados é anônimo por design (o professor não
--     loga), mas colaboradores com sessão ativa abrem chamados logados.
--   - Vinculando o id do autor ao chamado, o backend consegue notificá-lo da
--     evolução do PRÓPRIO chamado pela inscrição de app dele (sem precisar da
--     inscrição anônima por chamado / sem "segunda inscrição").
--   - NULL => chamado anônimo (professor) — comportamento atual preservado.
--
-- NÃO altera policies/RLS/índices existentes. Aditivo e idempotente.
-- =============================================================================

BEGIN;

ALTER TABLE public.chamados_tickets
  ADD COLUMN IF NOT EXISTS "reportedByUserId" uuid;

CREATE INDEX IF NOT EXISTS idx_chamados_reported_by_user
  ON public.chamados_tickets ("reportedByUserId");

COMMIT;