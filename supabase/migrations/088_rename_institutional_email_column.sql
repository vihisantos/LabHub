-- =============================================================================
-- 088_rename_institutional_email_column.sql
-- =============================================================================
-- Renomeia a coluna institucional de lowercase para camelCase preservado.
--
-- Contexto:
--   A migration 087 criou a coluna como `institutionalemail` (lowercase)
--   porque o PostgreSQL converte identificadores não-quoted para lowercase.
--   A aplicação LabHub trabalha com `institutionalEmail` (camelCase) e não
--   possui camada de conversão. O rename para identificador quoted garante
--   que o nome físico no banco seja exatamente `"institutionalEmail"`.
--
-- Operação:
--   RENAME COLUMN institutionalemail TO "institutionalEmail"
--
-- Notas:
--   - A coluna já existe em PROD (aplicada pela 087).
--   - O RENAME COLUMN é DDL instantâneo, não copia dados.
--   - O identificador de destino usa aspas duplas para preservar o case.
--   - O comentario da coluna e atualizado para o novo identificador.
-- =============================================================================

ALTER TABLE public.profiles
  RENAME COLUMN institutionalemail TO "institutionalEmail";

COMMENT ON COLUMN public.profiles."institutionalEmail" IS
  'E-mail institucional de contato (ex.: nome@univ.edu). NAO e o e-mail de login: o login usa auth.users.email. Coluna nullable e sem backfill de proposito — o e-mail @labhub da conta e provisorio, e o contato real e informacao adicional que pode nao existir.';