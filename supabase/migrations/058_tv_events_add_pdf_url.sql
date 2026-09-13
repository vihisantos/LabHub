-- =============================================================================
-- 058_tv_events_add_pdf_url.sql
-- =============================================================================
-- Adiciona a coluna `pdf_url` em tv_events. A coluna existia apenas no
-- `CREATE TABLE IF NOT EXISTS` da migration 000 e em ambiente onde a tabela já
-- existia ela nunca foi criada — o insert do ReservaLab falhava com
-- "could not find the 'pdf_url' column of 'tv_events' in the schema cache".
-- =============================================================================

BEGIN;

ALTER TABLE public.tv_events
  ADD COLUMN IF NOT EXISTS pdf_url text;

COMMIT;