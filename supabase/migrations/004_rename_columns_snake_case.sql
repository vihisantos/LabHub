-- Fix column names: rename quoted camelCase to snake_case (Supabase/PostgREST standard)
-- This fixes the mismatch between the JS app (camelCase) and Supabase column names (quoted)

ALTER TABLE public.profiles
  RENAME COLUMN "workspaceIds" TO workspace_ids;

ALTER TABLE public.profiles
  RENAME COLUMN "createdAt" TO created_at;

ALTER TABLE public.profiles
  RENAME COLUMN "updatedAt" TO updated_at;
