-- =============================================
-- Add per-user app access override to profiles
-- app_access: { "reservalab": "full", "tv": "none", ... }
-- =============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS app_access JSONB DEFAULT '{}'::jsonb;
