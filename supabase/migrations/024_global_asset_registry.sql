-- ============================================================
-- 024: Global Asset Registry — foundation
--
-- Tabela global de ativos, independente de PCare/Estoque.
-- Cada ativo pertence a um workspace. RLS isola por
-- workspace_ids do perfil do usuário autenticado.
--
-- Executar no SQL Editor do Supabase.
-- Rollback: DROP TABLE IF EXISTS public.assets;
-- ============================================================

CREATE TABLE IF NOT EXISTS public.assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  asset_tag       TEXT,
  serial_number   TEXT,
  equipment_type  TEXT NOT NULL DEFAULT 'Outro',
  manufacturer    TEXT NOT NULL DEFAULT '',
  model           TEXT NOT NULL DEFAULT '',
  name            TEXT NOT NULL DEFAULT '',
  location_id     UUID,
  status          TEXT NOT NULL DEFAULT 'draft',
  notes           TEXT NOT NULL DEFAULT '',
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_assets_workspace_id   ON public.assets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_assets_asset_tag      ON public.assets(asset_tag);
CREATE INDEX IF NOT EXISTS idx_assets_serial_number  ON public.assets(serial_number);
CREATE INDEX IF NOT EXISTS idx_assets_status         ON public.assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_equipment_type ON public.assets(equipment_type);

-- Unique: one asset_tag per workspace (when not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_workspace_asset_tag
  ON public.assets(workspace_id, asset_tag)
  WHERE asset_tag IS NOT NULL;

-- ============================================================
-- RLS — workspace membership via profiles.workspace_ids
-- Uses is_super_admin() from migration 022.
-- ============================================================

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assets_select" ON public.assets
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR workspace_id IN (
      SELECT unnest(workspace_ids)
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "assets_insert" ON public.assets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR workspace_id IN (
      SELECT unnest(workspace_ids)
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "assets_update" ON public.assets
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR workspace_id IN (
      SELECT unnest(workspace_ids)
      FROM public.profiles
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR workspace_id IN (
      SELECT unnest(workspace_ids)
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "assets_delete" ON public.assets
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR workspace_id IN (
      SELECT unnest(workspace_ids)
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );
