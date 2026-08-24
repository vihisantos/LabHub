-- Fix completo: dropa e recria as 4 tabelas com problema
-- Execute no SQL Editor

-- 1. stock_inventory_counts (depende de cycles, dropar primeiro)
DROP TABLE IF EXISTS stock.stock_inventory_counts CASCADE;

-- 2. stock_inventory_cycles
DROP TABLE IF EXISTS stock.stock_inventory_cycles CASCADE;
CREATE TABLE stock.stock_inventory_cycles (
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
ALTER TABLE stock.stock_inventory_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON stock.stock_inventory_cycles FOR ALL USING (true) WITH CHECK (true);

-- 3. stock_inventory_counts
CREATE TABLE stock.stock_inventory_counts (
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
CREATE INDEX idx_stock_inventory_counts_cycle ON stock.stock_inventory_counts("cycleId");
ALTER TABLE stock.stock_inventory_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON stock.stock_inventory_counts FOR ALL USING (true) WITH CHECK (true);

-- 4. stock_maintenance
DROP TABLE IF EXISTS stock.stock_maintenance CASCADE;
CREATE TABLE stock.stock_maintenance (
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
CREATE INDEX idx_stock_maintenance_date ON stock.stock_maintenance("scheduledDate");
ALTER TABLE stock.stock_maintenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON stock.stock_maintenance FOR ALL USING (true) WITH CHECK (true);

-- 5. stock_photos
DROP TABLE IF EXISTS stock.stock_photos CASCADE;
CREATE TABLE stock.stock_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemId" TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_stock_photos_item ON stock.stock_photos("itemId");
ALTER TABLE stock.stock_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON stock.stock_photos FOR ALL USING (true) WITH CHECK (true);
