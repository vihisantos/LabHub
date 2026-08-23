-- ========================================
-- Add workspace_id to tablet_reservations
-- ========================================

ALTER TABLE public.tablet_reservations
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tablet_reservations_workspace
  ON public.tablet_reservations(workspace_id);
