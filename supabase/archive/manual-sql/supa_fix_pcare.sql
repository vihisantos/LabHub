-- Adicionar colunas faltando nas tabelas pcare
-- Execute no SQL Editor

-- pcare.pcs: colunas faltando
ALTER TABLE pcare.pcs
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{"osType":"","osVersion":"","osEdition":"","pcType":"","domain":""}'::jsonb,
  ADD COLUMN IF NOT EXISTS "cleaningStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "restorationStatus" TEXT NOT NULL DEFAULT 'pending';

-- pcare.maintenance: coluna faltando
ALTER TABLE pcare.maintenance
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
