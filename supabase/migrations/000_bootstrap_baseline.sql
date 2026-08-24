-- ============================================================================
-- 000: BOOTSTRAP BASELINE — objetos-base criados fora do versionamento
-- ============================================================================
-- CONTEXTO:
--   As tabelas de stock, pcare e TV foram criadas manualmente no Supabase
--   (SQL Editor) por scripts avulsos que nunca entraram no git:
--     - supabase/migrations/supa/*.sql          (arquivados em supabase/archive/)
--     - src/apps/tv/supabase*.sql               (mantidos como registro historico)
--   As migrations numeradas 001-029 presumem esses objetos existentes.
--
-- OBJETIVO:
--   Permitir reconstruir um banco novo aplicando apenas:
--       000_bootstrap_baseline.sql -> 001..029 (ordem numerica)
--
-- SEGURANCA:
--   - Idempotente: pode rodar em PRODUCAO sem alterar nada
--     (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DROP IF EXISTS /
--      constraints com guard duplicate_object).
--   - NAO cria POLICIES de RLS aqui. Quem cria:
--       stock/pcare ............ migration 027 (isolamento por workspace)
--       profiles/workspaces .... migrations 009/007/022/028
--       TV ..................... PR dedicado de autorizacao da TV (divida
--                                documentada na 028). Banco novo fica
--                                deny-by-default nas tabelas TV ate lá —
--                                mais seguro que replicar USING(true).
--   - Grants refletem o estado FINAL pos-026 (anon sem acesso a
--     stock/pcare; service_role total). Tabelas do schema public seguem
--     os defaults do Supabase até o PR da TV restringi-las.
--
-- FONTES CONSOLIDADAS (conteudo tecnico copiado dos originais):
--   supa.sql / supa_fix3.sql / supa_fix4.sql / supa_fix_pcare*.sql /
--   supa_fix_tv_rls.sql / supa_grants.sql / supabase-migration-workspace.sql /
--   supabase.sql / supabase-activation-codes.sql / CHAMADOS_TABLE_SQL (api/app.py)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. SCHEMAS
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS stock;
CREATE SCHEMA IF NOT EXISTS pcare;

-- ============================================================================
-- 2. WORKSPACES (guardado — 009 tambem cria; necessario para as FKs abaixo)
--    Colunas finais já incluidas (010/020/028 adicionam com IF NOT EXISTS,
--    sem conflito).
-- ============================================================================
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS public.workspaces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    location        TEXT NOT NULL DEFAULT '',
    spreadsheet_url TEXT DEFAULT '',
    lab_count       SMALLINT NOT NULL DEFAULT 2,
    disabled_apps   JSONB DEFAULT '[]'::jsonb,
    color           TEXT DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
END $$;

-- ============================================================================
-- 3. STOCK (fonte: supa.sql + supa_fix3 + supa_fix4)
-- ============================================================================

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
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "expiresAt" TIMESTAMPTZ,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_stock_items_section ON stock.stock_items(section);
CREATE INDEX IF NOT EXISTS idx_stock_items_status ON stock.stock_items(status);
CREATE INDEX IF NOT EXISTS idx_stock_items_room ON stock.stock_items(room);

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
  "deletedAt" TIMESTAMPTZ,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock.stock_movements("itemId");
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock.stock_movements(type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock.stock_movements("createdAt");

DO $$ BEGIN
  ALTER TABLE stock.stock_movements ADD CONSTRAINT stock_movements_type_check
    CHECK (type IN ('entrada','saida','mudanca_sala','conserto','descarte',
                    'substituicao','emprestimo','devolucao'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS stock.stock_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  items JSONB DEFAULT '[]'::jsonb,
  "lastChecked" TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'nao_conferido',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE
);

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
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE
);

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
  "countedAt" TIMESTAMPTZ,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_stock_inventory_counts_cycle ON stock.stock_inventory_counts("cycleId");

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
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_stock_maintenance_date ON stock.stock_maintenance("scheduledDate");
CREATE INDEX IF NOT EXISTS idx_stock_maintenance_completed ON stock.stock_maintenance(completed);

CREATE TABLE IF NOT EXISTS stock.stock_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemId" TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_stock_photos_item ON stock.stock_photos("itemId");

-- ============================================================================
-- 4. PCARE (fonte: supa.sql + supa_fix_pcare + supa_fix_pcare_missing_tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pcare.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "assetTag" TEXT NOT NULL DEFAULT '',
  "equipmentType" TEXT NOT NULL DEFAULT 'Outro',
  manufacturer TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  "serialNumber" TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'available',
  observations TEXT NOT NULL DEFAULT '',
  technical JSONB NOT NULL DEFAULT '{}'::jsonb,
  network JSONB NOT NULL DEFAULT '{}'::jsonb,
  "parentAssetId" UUID REFERENCES pcare.assets(id) ON DELETE SET NULL,
  "childAssetIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_assets_tag ON pcare.assets("assetTag");
CREATE INDEX IF NOT EXISTS idx_assets_type ON pcare.assets("equipmentType");
CREATE INDEX IF NOT EXISTS idx_assets_status ON pcare.assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_location ON pcare.assets(location);

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
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pcs_lab ON pcare.pcs("labName");

CREATE TABLE IF NOT EXISTS pcare.parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  quantity INTEGER DEFAULT 0,
  "minQuantity" INTEGER DEFAULT 0,
  unit TEXT DEFAULT 'un',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pcare.maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "pcNumber" TEXT DEFAULT '',
  "labName" TEXT DEFAULT '',
  type TEXT DEFAULT '',
  description TEXT DEFAULT '',
  completed BOOLEAN DEFAULT FALSE,
  "scheduledDate" DATE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE
);
DO $$ BEGIN
  ALTER TABLE pcare.maintenance ADD CONSTRAINT maintenance_type_check
    CHECK (type IN ('cleaning', 'restoration', 'both'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS pcare.part_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "partId" TEXT NOT NULL DEFAULT '',
  "pcId" TEXT NOT NULL DEFAULT '',
  "partName" TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_part_usage_part ON pcare.part_usage("partId");
CREATE INDEX IF NOT EXISTS idx_part_usage_pc ON pcare.part_usage("pcId");

CREATE TABLE IF NOT EXISTS pcare.checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  "labName" TEXT NOT NULL DEFAULT '',
  items JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pcare.pc_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "pcId" TEXT NOT NULL DEFAULT '',
  "templateId" TEXT NOT NULL DEFAULT '',
  "templateName" TEXT NOT NULL DEFAULT '',
  "labName" TEXT NOT NULL DEFAULT '',
  items JSONB DEFAULT '[]'::jsonb,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pc_checklists_pc ON pcare.pc_checklists("pcId");

CREATE TABLE IF NOT EXISTS pcare.action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "pcId" TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_action_logs_pc ON pcare.action_logs("pcId");

-- ============================================================================
-- 5. TV — tabelas de conteudo (fonte: src/apps/tv/*.sql + supa_fix_tv_rls)
--    workspace_id ja nasce com ON DELETE CASCADE (estado final da 021).
--    Colunas show_countdown/has_welcome existem so em producao (criadas
--    manualmente); incluidas aqui com guard para paridade com o codigo
--    (src/apps/tv/types/index.ts).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tv_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  image_url text,
  pdf_url text,
  start_date timestamptz,
  end_date timestamptz,
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  show_countdown boolean DEFAULT false,
  has_welcome boolean DEFAULT false
);
ALTER TABLE public.tv_events ADD COLUMN IF NOT EXISTS workspace_id uuid
  REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.tv_events ADD COLUMN IF NOT EXISTS show_countdown boolean;
ALTER TABLE public.tv_events ADD COLUMN IF NOT EXISTS has_welcome boolean;
CREATE INDEX IF NOT EXISTS idx_tv_events_active ON public.tv_events(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_tv_events_workspace ON public.tv_events(workspace_id);

CREATE TABLE IF NOT EXISTS public.tv_playlists (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  source text NOT NULL DEFAULT 'youtube',
  youtube_url text NOT NULL,
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE
);
ALTER TABLE public.tv_playlists ADD COLUMN IF NOT EXISTS workspace_id uuid
  REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.tv_playlists ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'youtube';
ALTER TABLE public.tv_playlists DROP COLUMN IF EXISTS type;
ALTER TABLE public.tv_playlists DROP COLUMN IF EXISTS duration_seconds;
DO $$ BEGIN
  ALTER TABLE public.tv_playlists ADD CONSTRAINT tv_playlists_source_check
    CHECK (source IN ('youtube', 'google_drive', 'cloudinary'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_tv_playlists_active ON public.tv_playlists(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_tv_playlists_workspace ON public.tv_playlists(workspace_id);

CREATE TABLE IF NOT EXISTS public.tv_music_queues (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  shuffle boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE
);
ALTER TABLE public.tv_music_queues ADD COLUMN IF NOT EXISTS workspace_id uuid
  REFERENCES public.workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tv_music_queues_workspace ON public.tv_music_queues(workspace_id);

CREATE TABLE IF NOT EXISTS public.tv_music_tracks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  queue_id uuid NOT NULL REFERENCES public.tv_music_queues(id) ON DELETE CASCADE,
  youtube_video_id text NOT NULL,
  title text NOT NULL,
  duration_seconds int DEFAULT 0,
  position int NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(queue_id, position),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE
);
ALTER TABLE public.tv_music_tracks ADD COLUMN IF NOT EXISTS workspace_id uuid
  REFERENCES public.workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_music_tracks_queue ON public.tv_music_tracks(queue_id, position);

CREATE TABLE IF NOT EXISTS public.tv_announcements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  text text NOT NULL,
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE
);
ALTER TABLE public.tv_announcements ADD COLUMN IF NOT EXISTS workspace_id uuid
  REFERENCES public.workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tv_announcements_active ON public.tv_announcements(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_tv_announcements_workspace ON public.tv_announcements(workspace_id);

CREATE TABLE IF NOT EXISTS public.tv_galleries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  sort_order int DEFAULT 0,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE
);
ALTER TABLE public.tv_galleries ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 0;
ALTER TABLE public.tv_galleries ADD COLUMN IF NOT EXISTS workspace_id uuid
  REFERENCES public.workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_galleries_active ON public.tv_galleries(is_active);
CREATE INDEX IF NOT EXISTS idx_tv_galleries_workspace ON public.tv_galleries(workspace_id);

CREATE TABLE IF NOT EXISTS public.tv_gallery_photos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  gallery_id uuid NOT NULL REFERENCES public.tv_galleries(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gallery_photos_order ON public.tv_gallery_photos(gallery_id, sort_order);

CREATE TABLE IF NOT EXISTS public.tv_calendar_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_code text NOT NULL,
  source_url text NOT NULL,
  events jsonb DEFAULT '[]'::jsonb,
  start_date date,
  end_date date,
  expires_at timestamptz NOT NULL,
  is_active boolean DEFAULT true,
  extracted_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE
);
ALTER TABLE public.tv_calendar_cache ADD COLUMN IF NOT EXISTS workspace_id uuid
  REFERENCES public.workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_calendar_cache_active ON public.tv_calendar_cache(is_active);
CREATE INDEX IF NOT EXISTS idx_calendar_cache_expires ON public.tv_calendar_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_tv_calendar_cache_workspace ON public.tv_calendar_cache(workspace_id);

CREATE TABLE IF NOT EXISTS public.tv_urgent_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE
);
DO $$ BEGIN
  ALTER TABLE public.tv_urgent_announcements DROP CONSTRAINT IF EXISTS tv_urgent_severity_check;
  ALTER TABLE public.tv_urgent_announcements ADD CONSTRAINT tv_urgent_severity_check
    CHECK (severity IN ('info', 'warning', 'danger'));
EXCEPTION WHEN others THEN NULL; END $$;
ALTER TABLE public.tv_urgent_announcements ADD COLUMN IF NOT EXISTS workspace_id uuid
  REFERENCES public.workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_urgent_active ON public.tv_urgent_announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_urgent_expires ON public.tv_urgent_announcements(expires_at);
CREATE INDEX IF NOT EXISTS idx_tv_urgent_workspace ON public.tv_urgent_announcements(workspace_id);

-- Dispositivos kiosk (fonte: supabase-migration-workspace.sql, FK cascade da 021)
CREATE TABLE IF NOT EXISTS public.tv_devices (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_seen timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.tv_devices ADD COLUMN IF NOT EXISTS workspace_id uuid
  REFERENCES public.workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tv_devices_workspace ON public.tv_devices(workspace_id);

-- Codigos de ativacao (fonte: supabase-activation-codes.sql)
-- Sem policies: somente service_role (api/app.py) opera esta tabela.
CREATE TABLE IF NOT EXISTS public.tv_activation_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tv_activation_codes_code ON public.tv_activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_tv_activation_codes_status ON public.tv_activation_codes(status, expires_at);

-- ============================================================================
-- 6. CHAMADOS (DDL AUTORITATIVO = CHAMADOS_TABLE_SQL em api/app.py.
--    O arquivo antigo supa/chamados.sql estava defasado — arquivado.)
--    RLS habilitado SEM policies + REVOKE total: acesso somente via
--    service_role da API Flask.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chamados_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  "roomId" TEXT NOT NULL DEFAULT '',
  "roomName" TEXT NOT NULL DEFAULT '',
  "assetId" TEXT DEFAULT '',
  "assetSource" TEXT DEFAULT '',
  "assetName" TEXT DEFAULT '',
  "assetPatrimony" TEXT DEFAULT '',
  "problemCategory" TEXT NOT NULL DEFAULT '',
  "problemArea" TEXT NOT NULL DEFAULT '',
  "problemDescription" TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aberto',
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "reportedBy" TEXT NOT NULL DEFAULT '',
  "reportedByEmail" TEXT DEFAULT '',
  "assignedTo" TEXT DEFAULT '',
  "assignedToUserId" TEXT DEFAULT '',
  "ticketNumber" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "resolvedAt" TIMESTAMPTZ,
  "archived" BOOLEAN NOT NULL DEFAULT FALSE,
  "closedAt" TIMESTAMPTZ,
  "closedBy" TEXT DEFAULT '',
  "statusNote" TEXT DEFAULT '',
  "photos" TEXT DEFAULT ''
);
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "priority" TEXT DEFAULT 'normal';
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMPTZ;
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "closedBy" TEXT DEFAULT '';
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "statusNote" TEXT DEFAULT '';
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT DEFAULT '';
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "photos" TEXT DEFAULT '';
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "feedbackRating" INTEGER;
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "feedbackComment" TEXT DEFAULT '';
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "feedbackAt" TIMESTAMPTZ;
DO $$ BEGIN
  ALTER TABLE public.chamados_tickets ADD CONSTRAINT chk_feedback_rating
    CHECK ("feedbackRating" IS NULL OR "feedbackRating" BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_chamados_workspace ON public.chamados_tickets("workspace_id");
CREATE INDEX IF NOT EXISTS idx_chamados_status ON public.chamados_tickets(status);

CREATE TABLE IF NOT EXISTS public.ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id" UUID NOT NULL REFERENCES public.chamados_tickets(id) ON DELETE CASCADE,
  "workspace_id" UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'comentario',
  content TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  "photo_urls" TEXT DEFAULT '',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON public.ticket_events("ticket_id");

-- ============================================================================
-- 7. ROW LEVEL SECURITY — habilitar em tudo criado acima.
--    Policies: nenhuma aqui (ver cabecalho). Deny-by-default.
-- ============================================================================
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

ALTER TABLE stock.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock.stock_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock.stock_inventory_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock.stock_inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock.stock_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock.stock_photos ENABLE ROW LEVEL SECURITY;

ALTER TABLE pcare.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcare.pcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcare.parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcare.maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcare.part_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcare.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcare.pc_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcare.action_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tv_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_music_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_music_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_gallery_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_calendar_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_urgent_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_activation_codes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chamados_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chamados_tickets FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.ticket_events FROM anon, authenticated, PUBLIC;

-- ============================================================================
-- 8. GRANTS — estado FINAL (pos-018/026). Anon sem acesso a stock/pcare.
-- ============================================================================

GRANT USAGE ON SCHEMA stock TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_kits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_maintenance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_inventory_cycles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_inventory_counts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock.stock_photos TO authenticated;
-- OBS: stock.notifications NÃO recebe grant aqui — a tabela só é criada pela
-- 016 (que concede os grants dela). Conceder aqui quebraria bancos novos.
GRANT USAGE ON ALL SEQUENCES IN SCHEMA stock TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA stock GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

GRANT USAGE ON SCHEMA pcare TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pcare.pcs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pcare.parts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pcare.maintenance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pcare.part_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pcare.checklist_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pcare.pc_checklists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pcare.action_logs TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA pcare TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA pcare GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA stock FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA stock FROM anon;
REVOKE USAGE ON SCHEMA stock FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA pcare FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA pcare FROM anon;
REVOKE USAGE ON SCHEMA pcare FROM anon;

GRANT ALL ON ALL TABLES IN SCHEMA stock TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA stock TO service_role;
GRANT USAGE ON SCHEMA stock TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA pcare TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pcare TO service_role;
GRANT USAGE ON SCHEMA pcare TO service_role;

COMMIT;

-- ============================================================================
-- NOTAS DE PARIDADE COM PRODUCAO (leituras, nao executadas aqui):
--   * stock.notifications e criada pela 016; tv_music_requests pela 019;
--     tablet_reservations/public.assets/workspace_backups/workspace_audit_logs
--     por 021/024/028. Nao duplicadas neste baseline.
--   * A atribuicao de dados legados ao primeiro workspace (backfill do script
--     supabase-migration-workspace.sql) NAO roda aqui: producao ja foi
--     migrada; banco novo nao tem dados legados.
-- ============================================================================
