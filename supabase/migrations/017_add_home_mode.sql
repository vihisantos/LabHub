-- =============================================
-- 017: Modo da tela inicial do usuário (Launcher)
--
-- 'compact'  → só os apps com acesso, em cards grandes
-- 'dynamic'  → módulos + área de ações rápidas (padrão)
-- =============================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS home_mode TEXT DEFAULT 'dynamic';
