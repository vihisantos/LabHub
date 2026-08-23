-- =============================================
-- 018: Grants para tabelas stock criadas antes
-- das permissões padrão (corrige 403 no sync)
--
-- stock_maintenance, stock_inventory_cycles e
-- stock_inventory_counts existem, mas foram
-- criadas antes da migração 016, então as roles
-- anon/authenticated não têm privilégio de
-- acesso → PostgREST retorna 403 no sync.
-- =============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'stock' AND table_name = 'stock_maintenance'
  ) THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_maintenance TO anon, authenticated;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'stock' AND table_name = 'stock_inventory_cycles'
  ) THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_inventory_cycles TO anon, authenticated;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'stock' AND table_name = 'stock_inventory_counts'
  ) THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_inventory_counts TO anon, authenticated;
  END IF;
END $$;
