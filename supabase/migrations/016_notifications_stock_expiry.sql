-- =============================================
-- 016: Notificações in-app + validade no stock
--
-- A central de notificações do frontend sincroniza
-- a coleção "notifications" pelo schema "stock"
-- (stockDb), então a tabela precisa existir nesse
-- schema — não no public. Os inserts de "novo
-- usuário pendente" e "conta aprovada/negada"
-- foram alinhados para o mesmo schema no código.
-- =============================================

CREATE SCHEMA IF NOT EXISTS stock;

-- Notificações da central in-app (espelha AppNotification do frontend)
CREATE TABLE IF NOT EXISTS stock.notifications (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'system',
    severity TEXT NOT NULL DEFAULT 'info',
    module TEXT NOT NULL DEFAULT '',
    "actionUrl" TEXT,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    audience TEXT,
    "targetRole" TEXT,
    "targetSuperAdmin" BOOLEAN,
    workspace_id TEXT,
    "targetUserId" TEXT
);

CREATE INDEX IF NOT EXISTS idx_stock_notifications_createdat
    ON stock.notifications ("createdAt" DESC);

-- Validade e workspace dos itens de estoque (feature #123).
-- O schema/stock_items pode ainda não existir se o backend
-- (pg_sql) nunca tiver rodado — então o ALTER é condicional.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'stock' AND table_name = 'stock_items'
  ) THEN
    ALTER TABLE stock.stock_items
        ADD COLUMN IF NOT EXISTS "expiresAt" TEXT,
        ADD COLUMN IF NOT EXISTS workspace_id TEXT;
  END IF;
END $$;

-- Frontend (anon key) acessa o schema stock via sync
GRANT USAGE ON SCHEMA stock TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.notifications TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_items TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA stock GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
