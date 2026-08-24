-- Fix RLS policies para tabelas com erro de permissão
-- Execute este script no SQL Editor do Supabase

ALTER TABLE stock.stock_inventory_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_inventory_cycles_all" ON stock.stock_inventory_cycles;
CREATE POLICY "stock_inventory_cycles_all" ON stock.stock_inventory_cycles FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE stock.stock_inventory_counts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_inventory_counts_all" ON stock.stock_inventory_counts;
CREATE POLICY "stock_inventory_counts_all" ON stock.stock_inventory_counts FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE stock.stock_maintenance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_maintenance_all" ON stock.stock_maintenance;
CREATE POLICY "stock_maintenance_all" ON stock.stock_maintenance FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE stock.stock_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_photos_all" ON stock.stock_photos;
CREATE POLICY "stock_photos_all" ON stock.stock_photos FOR ALL USING (true) WITH CHECK (true);
