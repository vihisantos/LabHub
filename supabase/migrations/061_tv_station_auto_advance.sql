-- =============================================================================
-- 061 — TV STATION: AUTO-ADVANCE AUTORITATIVO (SERVER-SIDE)
-- =============================================================================
-- Autoridade: Station/DB decide QUANDO a fila avança. O Desktop deixou de
-- calcular a próxima faixa localmente (Fase 2.14): onEnd virou apenas um
-- SINAL de conclusão para o servidor, que valida tempo decorrido (clock
-- server-side) e aplica a transição via este RPC.
--
--   Station/DB = autoridade → servidor = controlador → Desktop = executor
--   → Realtime = sinal (RPC retorna o novo estado; Desktop re-emite o sync).
--
-- Segurança:
--   * NUNCA chama station_begin_mutation (o gate tv_can_manage_workspace
--     exige auth.uid(); service_role tem uid NULL). O shim é invocável
--     SOMENTE por service_role — o endpoint Flask já autenticou o usuário.
--   * Chave/hash de idempotência são calculados AQUI (determinísticos a
--     partir do estado), NUNCA aceitos do caller.
--   * AVANÇA somente quando o estado vigente é 'playing' e o tempo real de
--     reprodução (position_seconds + now - started_at) esgotou a duração.
--
-- IDEMPOTENTE: CREATE OR REPLACE FUNCTION (Preserva as GRANTs existentes de
-- funções anteriores; revoga e regranta as próprias explicitamente).
-- =============================================================================

BEGIN;

-- ─── station_auto_advance ────────────────────────────────────────────────────
-- Transição autoritativa de fim-de-faixa. Retorna:
--   {status:'applied',  result: <estado pós-transição (igual a station_next)>}
--   {status:'replayed', result: <resultado original da 1ª aplicação>}
--   {status:'no_op', reason: NOT_PLAYING|TRACK_MISMATCH|NO_CURRENT_TRACK|
--                             DURATION_UNKNOWN|UNKNOWN_STARTED_AT|NOT_ELAPSED}
-- Erros:
--   22023 WORKSPACE_REQUIRED · 40900 SEQUENCE_CONFLICT
CREATE OR REPLACE FUNCTION public.station_auto_advance(
  p_workspace                 uuid,
  p_current_snapshot_track_id uuid DEFAULT NULL,
  p_idempotency_key           text DEFAULT NULL,
  p_request_hash              text DEFAULT NULL,
  p_expected_sequence         bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_st      public.tv_station%ROWTYPE;
  v_t       public.tv_queue_snapshot_tracks%ROWTYPE;
  v_res     jsonb;
  v_replay  jsonb;
  v_key     text;
  v_hash    text;
  v_elapsed double precision;
BEGIN
  IF p_workspace IS NULL THEN
    RAISE EXCEPTION 'WORKSPACE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- Serializa com as demais transições da mesma estação (fim da tx).
  PERFORM pg_advisory_xact_lock(hashtextextended('tv_station:' || p_workspace::text, 0));

  -- Garante a linha da estação (backfill lazy idempotente).
  v_st := public.ensure_station_row(p_workspace);

  -- Chave/hash determinísticos calculados AQUI — o caller não influencia:
  --   * key  = 'auto-next:{workspace}:{current_track}:{sequence_before}'
  --   * hash = SHA-256(concat(workspace, kcurrent, sequence, 'auto-next'))
  v_key := 'auto-next:' || p_workspace::text || ':'
        || COALESCE(v_st.current_snapshot_track_id::text, '') || ':'
        || v_st.state_sequence::text;
  v_hash := encode(
    sha256(convert_to(
      p_workspace::text
      || COALESCE(v_st.current_snapshot_track_id::text, '')
      || v_st.state_sequence::text
      || 'auto-next',
      'UTF8'
    )),
    'hex'
  );

  -- expected_sequence opcional => conflito = 409 (reconciliar via get).
  IF p_expected_sequence IS NOT NULL AND v_st.state_sequence <> p_expected_sequence THEN
    RAISE EXCEPTION 'SEQUENCE_CONFLICT' USING ERRCODE = '40900';
  END IF;

  -- Idempotência: replay devolve o resultado original SEM mutar de novo.
  v_replay := public.station_try_replay(p_workspace, v_key, v_hash);
  IF v_replay IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'replayed', 'result', v_replay);
  END IF;

  -- Estado não-tocando: nada a avançar.
  IF v_st.state <> 'playing' THEN
    RETURN jsonb_build_object('status', 'no_op', 'reason', 'NOT_PLAYING');
  END IF;

  -- Guarda de corrida: avança somente se a faixa reportada for a vigente.
  IF p_current_snapshot_track_id IS NOT NULL
     AND (v_st.current_snapshot_track_id IS NULL
          OR v_st.current_snapshot_track_id <> p_current_snapshot_track_id) THEN
    RETURN jsonb_build_object('status', 'no_op', 'reason', 'TRACK_MISMATCH');
  END IF;

  -- Sem faixa corrente: mantém o estado (estação parada na prática).
  IF v_st.current_snapshot_track_id IS NULL THEN
    RETURN jsonb_build_object('status', 'no_op', 'reason', 'NO_CURRENT_TRACK');
  END IF;

  SELECT * INTO v_t FROM public.tv_queue_snapshot_tracks t
    WHERE t.id = v_st.current_snapshot_track_id;

  -- Defesa: faixa sumiu ou sem duração utilizável => não avança.
  IF NOT FOUND OR v_t.duration_seconds IS NULL OR v_t.duration_seconds <= 0 THEN
    RETURN jsonb_build_object('status', 'no_op', 'reason', 'DURATION_UNKNOWN');
  END IF;

  -- Defesa: 'playing' sempre tem started_at (via CHECK), mas blindamos.
  IF v_st.started_at IS NULL THEN
    RETURN jsonb_build_object('status', 'no_op', 'reason', 'UNKNOWN_STARTED_AT');
  END IF;

  -- Só avança quando o tempo da faixa realmente esgotou (clock server-side).
  v_elapsed := v_st.position_seconds + EXTRACT(EPOCH FROM (now() - v_st.started_at));
  IF v_elapsed < v_t.duration_seconds THEN
    RETURN jsonb_build_object('status', 'no_op', 'reason', 'NOT_ELAPSED');
  END IF;

  -- Transição idêntica ao station_next (039:649-661).
  v_t := public.relative_track(p_workspace, 1);
  IF v_t.id IS NULL THEN
    -- sem próxima => stop
    UPDATE public.tv_station SET state='stopped', current_snapshot_track_id = NULL,
      position_seconds = 0, started_at = NULL, state_sequence = state_sequence + 1,
      updated_at = now()
    WHERE workspace_id = p_workspace;
  ELSE
    UPDATE public.tv_station SET current_snapshot_track_id = v_t.id,
      position_seconds = 0, started_at = now(), state = 'playing',
      state_sequence = state_sequence + 1, updated_at = now()
    WHERE workspace_id = p_workspace;
  END IF;

  v_res := jsonb_build_object('status', 'applied', 'result', public.station_mutation_result(p_workspace));
  PERFORM public.station_record_idempotency(p_workspace, v_key, v_hash, v_res);
  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION public.station_auto_advance(uuid, uuid, text, text, bigint) IS
  'Auto-advance autoritativo server-side (Fase 2.14). Avalia fim-de-faixa por '
  'tempo decorrido (clock do servidor) e aplica a próxima faixa do snapshot. '
  'Somente service_role pode executar. Idempotência chaveada internamente.';

-- Acesso: somente o servidor (service_role). O endpoint Flask autenticou o
-- usuário/device e executa com a service key.
REVOKE ALL ON FUNCTION public.station_auto_advance(uuid, uuid, text, text, bigint) FROM anon;
REVOKE ALL ON FUNCTION public.station_auto_advance(uuid, uuid, text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.station_auto_advance(uuid, uuid, text, text, bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.station_auto_advance(uuid, uuid, text, text, bigint) TO service_role;

COMMIT;