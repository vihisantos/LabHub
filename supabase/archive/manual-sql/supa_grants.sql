-- Conceder permissões de acesso para roles do Supabase
-- Execute no SQL Editor

GRANT ALL ON ALL TABLES IN SCHEMA stock TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA stock TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA stock TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA stock TO service_role;

GRANT USAGE ON SCHEMA stock TO anon;
GRANT USAGE ON SCHEMA stock TO service_role;
