-- Fix profiles table: add missing columns if they don't exist
-- Run this in Supabase SQL Editor if the table was created without these columns

-- Add workspaceIds column if missing
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS "workspaceIds" UUID[] DEFAULT '{}';

-- Add avatar column if missing
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar TEXT;

-- Add createdAt column if missing
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add updatedAt column if missing
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Recreate trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, "workspaceIds", "createdAt", "updatedAt")
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'viewer',
    '{}',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Recreate indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
