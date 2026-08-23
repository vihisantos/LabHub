-- ========================================
-- Add workspace_id to tablet_reservations
-- ========================================
-- tablet_reservations is created by migration 028 (CREATE TABLE IF NOT EXISTS).
-- On production the table already exists; on fresh DBs it won't exist yet when
-- this migration runs. We guard the ALTER so it only executes when the table
-- is already present.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tablet_reservations'
  ) THEN
    ALTER TABLE public.tablet_reservations
      ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

    CREATE INDEX IF NOT EXISTS idx_tablet_reservations_workspace
      ON public.tablet_reservations(workspace_id);
  END IF;
END $$;
