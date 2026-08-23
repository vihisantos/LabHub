-- ========================================
-- Sugestões de música da TV (pedido → verificação → aprovação)
-- ========================================

-- Garante que a flag de admin absoluto exista (criada manualmente no projeto)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS public.tv_music_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    youtube_url TEXT NOT NULL,
    youtube_video_id TEXT,
    title TEXT,
    requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    requested_by_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
END $$;

ALTER TABLE public.tv_music_requests ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode listar pedidos (o front filtra por workspace)
DROP POLICY IF EXISTS "tv_music_requests_select" ON public.tv_music_requests;
CREATE POLICY "tv_music_requests_select"
  ON public.tv_music_requests FOR SELECT
  TO authenticated
  USING (true);

-- Usuário cria pedido em nome próprio
DROP POLICY IF EXISTS "tv_music_requests_insert" ON public.tv_music_requests;
CREATE POLICY "tv_music_requests_insert"
  ON public.tv_music_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requested_by);

-- Aprovar/rejeitar: admin absoluto (super admin) ou quem for designado
DROP POLICY IF EXISTS "tv_music_requests_update" ON public.tv_music_requests;
CREATE POLICY "tv_music_requests_update"
  ON public.tv_music_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );
