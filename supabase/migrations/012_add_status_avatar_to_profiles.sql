-- =============================================
-- Add status (pending/active) and avatar to profiles
-- =============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT '';

-- Index for querying pending users
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
