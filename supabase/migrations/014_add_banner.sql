-- =============================================
-- Add banner (cover image) to profiles
-- =============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banner TEXT DEFAULT '';
