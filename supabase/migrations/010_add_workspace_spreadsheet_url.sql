ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS spreadsheet_url TEXT DEFAULT '';
