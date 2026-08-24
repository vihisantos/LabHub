-- Remove duplicate camelCase columns added by migration 003
-- The snake_case versions (workspace_ids, created_at, updated_at) already exist

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS "workspaceIds";

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS "createdAt";

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS "updatedAt";
