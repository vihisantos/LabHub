-- 098 — recado curto e opcional escrito pelo próprio usuário.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_profile_note_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_profile_note_length
      CHECK (profile_note IS NULL OR char_length(profile_note) <= 160);
  END IF;
END;
$$;

COMMENT ON COLUMN public.profiles.profile_note IS
  'Recado opcional de até 160 caracteres, escrito pelo próprio usuário e exibido no perfil.';
