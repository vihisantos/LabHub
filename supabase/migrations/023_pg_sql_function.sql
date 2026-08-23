-- =============================================
-- 023: Função pg_sql (auto-migração do backend Flask)
--
-- O backend Flask (api/app.py) usa o RPC pg_sql para
-- criar/alterar tabelas on-the-fly (ex.: chamados_tickets,
-- stock_items). Essa função nunca existiu neste projeto,
-- então os _ensure_* falhavam em silêncio (404) e a tabela
-- chamados_tickets nunca era criada.
-- =============================================

CREATE OR REPLACE FUNCTION public.pg_sql(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE query;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pg_sql(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pg_sql(text) TO anon;
GRANT EXECUTE ON FUNCTION public.pg_sql(text) TO authenticated;
