-- Add accent and theme preference columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS accent TEXT NOT NULL DEFAULT 'emerald' CHECK (accent IN ('emerald', 'cyan', 'blue', 'purple'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme_variant TEXT NOT NULL DEFAULT 'dark' CHECK (theme_variant IN ('dark', 'dim', 'light'));

-- Update trigger to include defaults
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, workspace_ids, accent, theme_variant, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'viewer',
    '{}',
    'emerald',
    'dark',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(public.profiles.name, EXCLUDED.name),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
