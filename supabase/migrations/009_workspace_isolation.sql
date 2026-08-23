-- ========================================
-- Workspace isolation: tables + columns
-- ========================================

-- Helper to add workspace_id column safely
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    location TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
END $$;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workspaces' AND schemaname = 'public' AND policyname = 'workspaces_select') THEN
    CREATE POLICY "workspaces_select" ON public.workspaces FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workspaces' AND schemaname = 'public' AND policyname = 'workspaces_insert') THEN
    CREATE POLICY "workspaces_insert" ON public.workspaces FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workspaces' AND schemaname = 'public' AND policyname = 'workspaces_update') THEN
    CREATE POLICY "workspaces_update" ON public.workspaces FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workspaces' AND schemaname = 'public' AND policyname = 'workspaces_delete') THEN
    CREATE POLICY "workspaces_delete" ON public.workspaces FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- Add workspace_ids to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS workspace_ids UUID[] DEFAULT '{}';

-- Ensure schemas exist
CREATE SCHEMA IF NOT EXISTS stock;
CREATE SCHEMA IF NOT EXISTS pcare;

-- Add workspace_id to a table only if the table exists
DO $$
DECLARE
  tables TEXT[][] := ARRAY[
    ['stock', 'stock_items'],
    ['stock', 'stock_movements'],
    ['stock', 'stock_kits'],
    ['stock', 'stock_maintenance'],
    ['stock', 'stock_inventory_cycles'],
    ['stock', 'stock_inventory_counts'],
    ['stock', 'stock_photos'],
    ['stock', 'chamados'],
    ['stock', 'rooms'],
    ['stock', 'problem_templates'],
    ['stock', 'notifications'],
    ['stock', 'audit_logs'],
    ['stock', 'user_profiles'],
    ['stock', 'roles'],
    ['pcare', 'assets'],
    ['pcare', 'pcs'],
    ['pcare', 'parts'],
    ['pcare', 'part_usage'],
    ['pcare', 'maintenance'],
    ['pcare', 'checklist_templates'],
    ['pcare', 'pc_checklists'],
    ['pcare', 'action_logs']
  ];
  sch TEXT;
  tbl TEXT;
BEGIN
  FOR i IN 1..array_length(tables, 1) LOOP
    sch := tables[i][1];
    tbl := tables[i][2];
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = sch AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE', sch, tbl);
    END IF;
  END LOOP;
END $$;

-- TV tables (public schema)
DO $$
DECLARE
  tv_tables TEXT[] := ARRAY[
    'tv_events', 'tv_playlists', 'tv_music_queues', 'tv_music_tracks',
    'tv_announcements', 'tv_galleries', 'tv_gallery_photos',
    'tv_calendar_cache', 'tv_urgent_announcements'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tv_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE', t);
    END IF;
  END LOOP;
END $$;

-- Indexes for workspace filtering
CREATE INDEX IF NOT EXISTS idx_profiles_workspace_ids ON public.profiles USING gin(workspace_ids);
