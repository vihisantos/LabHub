-- Fix infinite recursion in RLS policies for profiles table
-- The original FOR ALL policy caused recursion during INSERT/UPDATE
-- Solution: split into separate policies per operation

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.profiles;

-- SELECT: any authenticated user can read profiles (needed for user lookup)
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: authenticated user can only insert their own profile
CREATE POLICY "profiles_insert"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- UPDATE: authenticated user can only update their own profile
CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- DELETE: authenticated user can only delete their own profile
CREATE POLICY "profiles_delete"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = id);
