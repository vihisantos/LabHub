-- ============================================
-- LabHub — Schema completo para Supabase
-- Execute este script no SQL Editor
-- ============================================

-- ============================================
-- SCHEMA: stock
-- ============================================
CREATE SCHEMA IF NOT EXISTS stock;

-- stock_items
CREATE TABLE IF NOT EXISTS stock.stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  section TEXT NOT NULL DEFAULT '',
  subcategory TEXT NOT NULL DEFAULT '',
  "serialNumber" TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ativo',
  condition TEXT NOT NULL DEFAULT 'Bom',
  notes TEXT DEFAULT '',
  "cableType" TEXT DEFAULT '',
  "cableLength" TEXT DEFAULT '',
  "connectorType" TEXT DEFAULT '',
  "outletCount" INTEGER DEFAULT 0,
  "linkedPcId" TEXT DEFAULT '',
  "linkedPcLabel" TEXT DEFAULT '',
  "pcParts" JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_items_section ON stock.stock_items(section);
CREATE INDEX IF NOT EXISTS idx_stock_items_status ON stock.stock_items(status);
CREATE INDEX IF NOT EXISTS idx_stock_items_room ON stock.stock_items(room);

-- stock_movements
CREATE TABLE IF NOT EXISTS stock.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemId" TEXT NOT NULL DEFAULT '',
  "itemName" TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  "fromRoom" TEXT DEFAULT '',
  "toRoom" TEXT DEFAULT '',
  description TEXT DEFAULT '',
  "replacedPart" TEXT DEFAULT '',
  "newPart" TEXT DEFAULT '',
  "performedBy" TEXT DEFAULT '',
  "borrowedBy" TEXT DEFAULT '',
  "borrowerContact" TEXT DEFAULT '',
  "expectedReturnAt" TIMESTAMPTZ,
  "returnedAt" TIMESTAMPTZ,
  "destinationRoom" TEXT DEFAULT '',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock.stock_movements("itemId");
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock.stock_movements(type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock.stock_movements("createdAt");

-- stock_kits
CREATE TABLE IF NOT EXISTS stock.stock_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  items JSONB DEFAULT '[]'::jsonb,
  "lastChecked" TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'nao_conferido',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- stock_inventory_cycles
CREATE TABLE IF NOT EXISTS stock.stock_inventory_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  section TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'in_progress',
  "totalItems" INTEGER DEFAULT 0,
  "verifiedCount" INTEGER DEFAULT 0,
  "missingCount" INTEGER DEFAULT 0,
  "damagedCount" INTEGER DEFAULT 0,
  "startedAt" TIMESTAMPTZ DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- stock_inventory_counts
CREATE TABLE IF NOT EXISTS stock.stock_inventory_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "cycleId" TEXT NOT NULL DEFAULT '',
  "itemId" TEXT NOT NULL DEFAULT '',
  "itemName" TEXT NOT NULL DEFAULT '',
  "itemSubcategory" TEXT NOT NULL DEFAULT '',
  "itemSerial" TEXT NOT NULL DEFAULT '',
  "itemRoom" TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT 'pending',
  "actualRoom" TEXT NOT NULL DEFAULT '',
  notes TEXT DEFAULT '',
  "countedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stock_inventory_counts_cycle ON stock.stock_inventory_counts("cycleId");

-- stock_maintenance
CREATE TABLE IF NOT EXISTS stock.stock_maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemId" TEXT NOT NULL DEFAULT '',
  "itemName" TEXT NOT NULL DEFAULT '',
  "itemSection" TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'preventiva',
  "scheduledDate" TEXT NOT NULL DEFAULT '',
  notes TEXT DEFAULT '',
  "performedBy" TEXT NOT NULL DEFAULT '',
  completed BOOLEAN DEFAULT FALSE,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_maintenance_date ON stock.stock_maintenance("scheduledDate");
CREATE INDEX IF NOT EXISTS idx_stock_maintenance_completed ON stock.stock_maintenance(completed);

-- stock_photos
CREATE TABLE IF NOT EXISTS stock.stock_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemId" TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_photos_item ON stock.stock_photos("itemId");

-- ============================================
-- SCHEMA: pcare
-- ============================================
CREATE SCHEMA IF NOT EXISTS pcare;

-- pcare.pcs
CREATE TABLE IF NOT EXISTS pcare.pcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "labName" TEXT NOT NULL DEFAULT '',
  "pcNumber" TEXT NOT NULL DEFAULT '',
  "assetTag" TEXT NOT NULL DEFAULT '',
  "roomLocation" TEXT NOT NULL DEFAULT '',
  specs JSONB DEFAULT '{"cpu":"","ram":"","storage":""}'::jsonb,
  config JSONB DEFAULT '{"osType":"","osVersion":"","osEdition":"","pcType":"","domain":""}'::jsonb,
  "cleaningStatus" TEXT NOT NULL DEFAULT 'pending',
  "restorationStatus" TEXT NOT NULL DEFAULT 'pending',
  "softwareInstalled" JSONB DEFAULT '[]'::jsonb,
  "partsReplaced" JSONB DEFAULT '[]'::jsonb,
  observations TEXT DEFAULT '',
  photos JSONB DEFAULT '[]'::jsonb,
  "lastIntervention" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcs_lab ON pcare.pcs("labName");

-- pcare.parts
CREATE TABLE IF NOT EXISTS pcare.parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  quantity INTEGER DEFAULT 0,
  "minQuantity" INTEGER DEFAULT 0,
  unit TEXT DEFAULT 'un',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- pcare.maintenance
CREATE TABLE IF NOT EXISTS pcare.maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "pcNumber" TEXT DEFAULT '',
  "labName" TEXT DEFAULT '',
  type TEXT DEFAULT '',
  description TEXT DEFAULT '',
  completed BOOLEAN DEFAULT FALSE,
  "scheduledDate" DATE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- POLICIES RLS (Row Level Security)
-- ============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE stock.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock.stock_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock.stock_inventory_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock.stock_inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock.stock_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock.stock_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcare.pcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcare.parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcare.maintenance ENABLE ROW LEVEL SECURITY;

-- Policies permissivas (qualquer usuario autenticado pode ler/escrever)
-- Ajuste conforme necessidade de seguranca

CREATE POLICY "stock_items_all" ON stock.stock_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "stock_movements_all" ON stock.stock_movements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "stock_kits_all" ON stock.stock_kits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "stock_inventory_cycles_all" ON stock.stock_inventory_cycles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "stock_inventory_counts_all" ON stock.stock_inventory_counts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "stock_maintenance_all" ON stock.stock_maintenance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "stock_photos_all" ON stock.stock_photos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "pcs_all" ON pcare.pcs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "parts_all" ON pcare.parts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "maintenance_all" ON pcare.maintenance FOR ALL USING (true) WITH CHECK (true);
