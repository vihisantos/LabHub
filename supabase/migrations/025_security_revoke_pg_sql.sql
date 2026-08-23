-- =============================================
-- 025: Segurança — Revogar pg_sql de anon/authenticated
--
-- VULNERABILIDADE: A função pg_sql() exposta a anon/authenticated
-- permite execução de SQL arbitrário no banco. Qualquer visitante
-- não autenticado pode DROP TABLE, SELECT em qualquer schema, etc.
--
-- Nenhuma chamada legítima usa anon ou authenticated — todas as 4
-- chamadas no backend Flask usam service_role via SUPABASE_SERVICE_KEY.
--
-- Referência: Auditoria de segurança LabHub — 2026-08-19
-- =============================================

-- Revoke from anon (prevents unauthenticated SQL injection)
REVOKE EXECUTE ON FUNCTION public.pg_sql(text) FROM anon;

-- Revoke from authenticated (no legitimate caller uses this role)
REVOKE EXECUTE ON FUNCTION public.pg_sql(text) FROM authenticated;

-- Revoke from PUBLIC (defense in depth — prevents future roles from inheriting)
REVOKE EXECUTE ON FUNCTION public.pg_sql(text) FROM PUBLIC;
