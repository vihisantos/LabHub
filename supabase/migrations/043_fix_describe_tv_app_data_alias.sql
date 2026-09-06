-- =============================================================================
-- 043_fix_describe_tv_app_data_alias.sql
-- =============================================================================
-- CORREÇÃO: bug de referência em `describe_tv_app_data` (introduzido na 032).
--
-- Contexto:
--   A migration 032_tv_app_data_purge.sql criou a função
--   `public.describe_tv_app_data(p_workspace uuid)` que agrega as contagens
--   das 9 tabelas de conteúdo da TV em `v_result` (jsonb) e calcula o total:
--
--     (SELECT COALESCE(SUM(v::numeric), 0) FROM jsonb_each_text(v_result))
--
--   O alias `v` NÃO existe: `jsonb_each_text` retorna as colunas
--   (key, value). Em tempo de execução o Postgres resolve `v` contra o
--   escopo (variável plpgsql `v_result` não casa; coluna `v` inexistente) e
--   falha com `column "v" does not exist` (42703). A rota autenticada
--   `POST /api/admin/app-data/describe` (api/app.py) passa pela autorização
--   RBAC e falha DEPOIS, no RPC, com 502 — validado na Etapa 8 contra o
--   STAGING real.
--
-- Correção (mínima e exata):
--   `SUM(v::numeric)` → `SUM(value::numeric)`, usando o nome de coluna
--   documentado e estável de `jsonb_each_text` (key, value). Nenhum outro
--   comportamento muda: mesmas 9 tabelas, mesmo escopo por workspace,
--   mesmo contrato de retorno `{"tables": {...}, "total": n}`.
--
-- Estratégia append-only (padrão do repositório — cf. 042 corrigindo 036):
--   `CREATE OR REPLACE FUNCTION` substitui SOMENTE o corpo/assinatura da
--   função; preserves privileges vigentes. A migration não toca tabelas,
--   RLS, seeds nem a função irmã `purge_tv_app_data` (correta — a soma dela
--   usa `v_rows`/`v_deleted` declarados, não jsonb_each_text).
--
-- IDEMPOTÊNCIA (replay seguro pelo runner):
--   - CREATE OR REPLACE FUNCTION é idempotente por definição.
--   - REVOKE/GRANT reafirmam o contrato da 032 (EXECUTE somente
--     service_role) e são idempotentes.
--
-- Referências:
--   - Migration original: supabase/migrations/032_tv_app_data_purge.sql
--   - Consumidor:          api/app.py (POST /api/admin/app-data/describe)
--   - Teste estático:      api/tests/test_purge_describe_alias_fix.py
--   - Revisão original:    api/tests/test_purge_sql_review.py

-- =============================================================================
-- 1. describe_tv_app_data — corpo idêntico à 032, exceto o alias da soma
-- =============================================================================

CREATE OR REPLACE FUNCTION public.describe_tv_app_data(p_workspace uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_workspace IS NULL THEN
    RAISE EXCEPTION 'WORKSPACE_REQUIRED';
  END IF;

  SELECT jsonb_build_object(
    'tv_events',               (SELECT count(*) FROM tv_events WHERE workspace_id = p_workspace),
    'tv_playlists',            (SELECT count(*) FROM tv_playlists WHERE workspace_id = p_workspace),
    'tv_announcements',        (SELECT count(*) FROM tv_announcements WHERE workspace_id = p_workspace),
    'tv_galleries',            (SELECT count(*) FROM tv_galleries WHERE workspace_id = p_workspace),
    'tv_gallery_photos',       (
      SELECT count(*) FROM tv_gallery_photos p
      JOIN tv_galleries g ON g.id = p.gallery_id
      WHERE g.workspace_id = p_workspace
    ),
    'tv_music_queues',         (SELECT count(*) FROM tv_music_queues WHERE workspace_id = p_workspace),
    'tv_music_tracks',         (
      SELECT count(*) FROM tv_music_tracks t
      JOIN tv_music_queues q ON q.id = t.queue_id
      WHERE q.workspace_id = p_workspace
    ),
    'tv_urgent_announcements', (SELECT count(*) FROM tv_urgent_announcements WHERE workspace_id = p_workspace),
    'tv_calendar_cache',       (SELECT count(*) FROM tv_calendar_cache WHERE workspace_id = p_workspace)
  )
  INTO v_result;

  RETURN jsonb_build_object('tables', v_result, 'total',
    (SELECT COALESCE(SUM(value::numeric), 0) FROM jsonb_each_text(v_result)));
END;
$$;

-- =============================================================================
-- 2. Contrato de privilégios (idempotente — reafirma a 032)
-- =============================================================================

REVOKE ALL ON FUNCTION public.describe_tv_app_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.describe_tv_app_data(uuid) TO service_role;
