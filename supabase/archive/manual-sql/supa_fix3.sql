-- Adicionar colunas faltando nas tabelas
-- Execute no SQL Editor

-- stock_items: colunas opcionais que o frontend usa
ALTER TABLE stock.stock_items
  ADD COLUMN IF NOT EXISTS "cableType" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "cableLength" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "connectorType" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "outletCount" INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "linkedPcId" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "linkedPcLabel" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "pcParts" JSONB DEFAULT '[]'::jsonb;

-- stock_movements: colunas que o frontend usa
ALTER TABLE stock.stock_movements
  ADD COLUMN IF NOT EXISTS "fromRoom" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "toRoom" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "description" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "replacedPart" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "newPart" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "performedBy" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "borrowerContact" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "destinationRoom" TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
