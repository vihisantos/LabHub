-- =============================================================================
-- 060_tv_station_rbac_hardening.sql
-- =============================================================================
-- HARDENING DE SEGURANÇA/AUTORIZAÇÃO DO STATION (pós auditoria 2.2-A).
--
-- Corrige dois achados da auditoria, SEM tocar em 039 (histórica) e SEM
-- alterar a semântica de idempotência/concorrência:
--
--   SNAP-1  `station_get_snapshot` NÃO tinha gate explícito de workspace. Como
--           é SECURITY DEFINER (dono superuser/BYPASSRLS), a policy
--           tv_station_select não o protege: qualquer usuário autenticado
--           poderia ler o estado da estação (e a lista de faixas) de QUALQUER
--           workspace, além de forçar a criação lazy da linha via
--           ensure_station_row. Correção: gate `can_access_tv_workspace`
--           ANTES de qualquer consulta/efeito.
--
--   RBAC-1  Os RPCs mutáveis aceitavam `can_access_tv_workspace` (membro/read/
--           device). O frontend exigia `full`, mas pelo RPC direto um membro
--           `read` podia mutar. Correção: o kernel `station_begin_mutation`
--           passa a exigir `tv_can_manage_workspace` (059: is_super_admin OR
--           (membro AND full)), fechando TODOS os 9 RPCs mutáveis.
--
-- Autoridade final = banco. O gate de `full` do frontend permanece apenas como
-- UX/defesa em profundidade.
--
-- NÃO altera: request_id / request_hash / station_try_replay (replay
-- idempotente) / state_sequence / advisory locks. Apenas acrescenta o gate.
--
-- IDEMPOTENTE: CREATE OR REPLACE FUNCTION (Preserva as GRANTs existentes de
-- 039 — EXECUTE de get_snapshot aos authenticated; begin_mutation permanece
-- interno/serviço). Nenhuma tabela/policy nova; nenhum SQL dinâmico.
-- =============================================================================

-- ─── SNAP-1: gate de workspace na leitura do snapshot ────────────────────────
CREATE OR REPLACE FUNCTION public.station_get_snapshot(p_workspace uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_st public.tv_station%ROWTYPE;
  v_json jsonb;
BEGIN
  IF p_workspace IS NULL THEN
    RAISE EXCEPTION 'WORKSPACE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- SNAP-1: gate explícito (SECURITY DEFINER ignora a policy tv_station_select).
  -- read/full/membro/device do PRÓPRIO workspace passam; cross-workspace e sem
  -- acesso negam (42501) sem vazar estado.
  IF NOT public.can_access_tv_workspace(p_workspace) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_st FROM public.tv_station WHERE workspace_id = p_workspace;
  IF NOT FOUND THEN
    v_st := public.ensure_station_row(p_workspace);
  END IF;

  SELECT jsonb_build_object(
    'workspace_id', v_st.workspace_id,
    'state', v_st.state,
    'position_seconds', v_st.position_seconds,
    'started_at', v_st.started_at,
    'station_synced_at', v_st.station_synced_at,
    'state_sequence', v_st.state_sequence,
    'queue_snapshot_id', v_st.queue_snapshot_id,
    'current_snapshot_track_id', v_st.current_snapshot_track_id,
    'tracks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'snapshot_track_id', t.id, 'position', t.position,
        'youtube_video_id', t.youtube_video_id, 'title', t.title,
        'duration_seconds', t.duration_seconds, 'track_id', t.track_id
      ) ORDER BY t.position)
      FROM public.tv_queue_snapshot_tracks t
      WHERE t.snapshot_id = v_st.queue_snapshot_id
    ), '[]'::jsonb)
  ) INTO v_json;

  RETURN v_json;
END;
$$;

-- ─── RBAC-1: kernel de mutação exige TV FULL ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.station_begin_mutation(
  p_workspace          uuid,
  p_idempotency_key    text,
  p_request_hash       text,
  p_expected_sequence  bigint
)
RETURNS public.tv_station
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_st      public.tv_station%ROWTYPE;
BEGIN
  IF p_workspace IS NULL THEN
    RAISE EXCEPTION 'WORKSPACE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- RBAC-1: mutar a estação exige nível FULL no app TV.
  --   can_access_tv_workspace (read/membro/device) é INSUFICIENTE para mutar;
  --   tv_can_manage_workspace (059) = is_super_admin() OR
  --   (user_belongs_to_workspace(p_ws) AND user_can_manage_tv(p_ws)).
  IF NOT public.tv_can_manage_workspace(p_workspace) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  -- Serializa mutações concorrentes do mesmo workspace (liberado no fim da tx).
  PERFORM pg_advisory_xact_lock(hashtextextended('tv_station:' || p_workspace::text, 0));

  -- Garante a linha da estação (backfill lazy idempotente).
  v_st := public.ensure_station_row(p_workspace);

  -- expected_sequence opcional => conflito = 409 (cliente reconcilia via get).
  IF p_expected_sequence IS NOT NULL AND v_st.state_sequence <> p_expected_sequence THEN
    RAISE EXCEPTION 'SEQUENCE_CONFLICT' USING ERRCODE = '40900';
  END IF;

  RETURN v_st;
END;
$$;

-- =============================================================================
-- VERIFICAÇÃO PÓS-APLICAÇÃO:
--   * mem.g.read no próprio ws: station_get_snapshot OK; station_* (mutação) DENY.
--   * mem.g.full no próprio ws: get + mutate OK.
--   * any user (full/read) em workspace diverso: get/mutate DENY (ACCESS_DENIED).
--   * sem acesso TV: DENY.
--   * idempotência: mesmo key+hash => replay (sem re-mutar); key+hash dif => 40901.
--   * state_sequence continua monotônico (incrementa só em mutação aplicada).
-- =============================================================================