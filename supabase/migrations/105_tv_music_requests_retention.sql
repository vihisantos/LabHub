-- ===============================================================================
-- 105 — TV CORPORATIVA: RETENÇÃO DE PEDIDOS QR (LGPD 30 dias)
-- ===============================================================================
-- Função chamada por cron diário (CRON_SECRET). Apaga pedidos source='qr'
-- com mais de 30 dias + limpa ip_hash.
BEGIN;

CREATE OR REPLACE FUNCTION public.tv_music_requests_retention_qr()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Apaga pedidos QR antigos (>30 dias) e anula ip_hash
  DELETE FROM public.tv_music_requests
   WHERE source = 'qr'
     AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Grant para service_role (cron roda com service_role)
REVOKE ALL ON FUNCTION public.tv_music_requests_retention_qr() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tv_music_requests_retention_qr() TO service_role;

-- Exemplo de agendamento via pg_cron (não executar aqui; criar no painel Supabase se pg_cron disponível):
-- SELECT cron.schedule('tv-music-requests-retention-qr', '0 3 * * *',
--   'SELECT public.tv_music_requests_retention_qr();');

COMMIT;