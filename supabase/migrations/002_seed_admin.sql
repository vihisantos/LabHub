-- Seed admin user profile
-- Run AFTER 001_create_profiles.sql

DO $$
DECLARE
  user_id UUID;
BEGIN
  SELECT id INTO user_id FROM auth.users WHERE email = 'vitor.santos@labhub.com';

  IF user_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, name, role, "workspaceIds", "createdAt", "updatedAt")
    VALUES (user_id, 'vitor.santos@labhub.com', 'Vitor Santos', 'admin', '{}', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      role = 'admin',
      name = 'Vitor Santos',
      "updatedAt" = NOW();
  ELSE
    RAISE NOTICE 'User vitor.santos@labhub.com not found in auth.users';
  END IF;
END $$;
