-- ============================================================================
-- 103 — TV STATION: LOOP + FALHAS (FASE 1.5 / B1)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Colunas novas em tv_station
-- ----------------------------------------------------------------------------
ALTER TABLE public.tv_station
  ADD COLUMN IF NOT EXISTS loop_mode text NOT NULL DEFAULT 'loop'
    CHECK (loop_mode IN ('off','loop','loop_shuffle'));
ALTER TABLE public.tv_station
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0
    CHECK (consecutive_failures >= 0);
ALTER TABLE public.tv_station
  ADD COLUMN IF NOT EXISTS last_failure_at timestamptz;
ALTER TABLE public.tv_station
  ADD COLUMN IF NOT EXISTS stopped_reason text
    CHECK (stopped_reason IS NULL OR stopped_reason IN ('manual','end_of_queue','failures'));

COMMENT ON COLUMN public.tv_station.loop_mode IS
  'Modo de loop da estação: off | loop | loop_shuffle (shuffle a cada ciclo).';
COMMENT ON COLUMN public.tv_station.consecutive_failures IS
  'Falhas consecutivas de mídia (YouTube 100/101/150/153). >=3 => stopped (failures).';
COMMENT ON COLUMN public.tv_station.stopped_reason IS
  'Motivo da parada: manual | end_of_queue | failures. Usado pelo backstop.';

-- ----------------------------------------------------------------------------
-- 2. materialize_station_snapshot com shuffle opcional
-- ----------------------------------------------------------------------------
-- A nova assinatura (uuid, boolean) criaria um OVERLOAD da versão (uuid) da
-- migration 039. Com os dois overloads coexistindo, chamadas com 1 argumento
-- (feitas por ensure_station_row e station_queue_change em runtime e por
-- migrations/tests/039_tv_station_checks.sql) ficariam ambíguas
-- ("function public.materialize_station_snapshot(uuid) is not unique").
-- A versão antiga é removida: chamadas de 1 argumento passam a resolver pela
-- nova via DEFAULT (p_shuffle = false), preservando o contrato.
DROP FUNCTION IF EXISTS public.materialize_station_snapshot(uuid);

CREATE OR REPLACE FUNCTION public.materialize_station_snapshot(p_workspace uuid, p_shuffle boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version   integer;
  v_snapshot  uuid;
BEGIN
  IF p_workspace IS NULL THEN
    RAISE EXCEPTION 'WORKSPACE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
   FROM public.tv_queue_snapshots WHERE workspace_id = p_workspace;

  INSERT INTO public.tv_queue_snapshots (workspace_id, version, track_count)
  SELECT p_workspace, v_version,
         count(*)::integer
    FROM (
      SELECT t.id
        FROM public.tv_music_tracks t
        JOIN public.tv_music_queues q ON q.id = t.queue_id
       WHERE q.workspace_id = p_workspace
       ORDER BY CASE WHEN p_shuffle THEN random() ELSE 0 END,
                q.created_at ASC, q.id ASC, t.position ASC
    ) c
  RETURNING id INTO v_snapshot;

  INSERT INTO public.tv_queue_snapshot_tracks
    (snapshot_id, position, youtube_video_id, title, duration_seconds, track_id)
  SELECT v_snapshot,
         row_number() OVER (
           ORDER BY CASE WHEN p_shuffle THEN random() ELSE 0 END,
                    q.created_at ASC, q.id ASC, t.position ASC
         ) - 1,
         t.youtube_video_id, t.title, t.duration_seconds, t.id
    FROM public.tv_music_tracks t
    JOIN public.tv_music_queues q ON q.id = t.queue_id
   WHERE q.workspace_id = p_workspace;

  RETURN v_snapshot;
END;
$$;

-- Privilégios da nova assinatura: o CREATE recria o overload com os
-- privilégios default (EXECUTE a PUBLIC). Repete o hardening da 039 para a
-- assinatura nova (a 039 revogou apenas da assinatura antiga (uuid)).
REVOKE ALL ON FUNCTION public.materialize_station_snapshot(uuid, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_station_snapshot(uuid, boolean) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. nation_set_loop_mode
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.station_set_loop_mode(p_workspace uuid, p_mode text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_workspace IS NULL THEN
    RAISE EXCEPTION 'WORKSPACE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_mode NOT IN ('off','loop','loop_shuffle') THEN
    RAISE EXCEPTION 'INVALID_LOOP_MODE' USING ERRCODE = '22023';
  END IF;
  IF NOT public.tv_can_manage_workspace(p_workspace) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.tv_station SET loop_mode = p_mode, updated_at = now()
   WHERE workspace_id = p_workspace;
  IF NOT FOUND THEN
    PERFORM public.ensure_station_row(p_workspace);
    UPDATE public.tv_station SET loop_mode = p_mode, updated_at = now()
     WHERE workspace_id = p_workspace;
  END IF;
  RETURN jsonb_build_object('workspace_id', p_workspace, 'loop_mode', p_mode);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. station_report_track_failure (service_role)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.station_report_track_failure(
  p_workspace uuid,
  p_snapshot_track_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_st public.tv_station%ROWTYPE;
  v_next public.tv_queue_snapshot_tracks%ROWTYPE;
  v_failures integer;
  v_new_snapshot uuid;
BEGIN
  IF p_workspace IS NULL THEN
    RAISE EXCEPTION 'WORKSPACE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('tv_station:' || p_workspace::text, 0));

  SELECT * INTO v_st FROM public.tv_station WHERE workspace_id = p_workspace;
  IF NOT FOUND THEN
    v_st := public.ensure_station_row(p_workspace);
  END IF;

  v_failures := v_st.consecutive_failures + 1;

  IF v_failures >= 3 THEN
    UPDATE public.tv_station
       SET state = 'stopped',
           current_snapshot_track_id = NULL,
           position_seconds = 0,
           started_at = NULL,
           consecutive_failures = v_failures,
           last_failure_at = now(),
           stopped_reason = 'failures',
           state_sequence = state_sequence + 1,
           updated_at = now()
     WHERE workspace_id = p_workspace;
  ELSE
    v_next := public.relative_track(p_workspace, 1);
    IF v_next.id IS NULL THEN
      -- tenta loop (se configurado) ou para
      IF v_st.loop_mode IN ('loop','loop_shuffle') THEN
        v_new_snapshot := public.materialize_station_snapshot(p_workspace, v_st.loop_mode='loop_shuffle');
        UPDATE public.tv_station
           SET queue_snapshot_id = v_new_snapshot,
               current_snapshot_track_id = (SELECT id FROM public.tv_queue_snapshot_tracks
                                              WHERE snapshot_id = v_new_snapshot ORDER BY position LIMIT 1),
               position_seconds = 0,
               started_at = now(),
               state = 'playing',
               consecutive_failures = v_failures,
               last_failure_at = now(),
               state_sequence = state_sequence + 1,
               updated_at = now()
         WHERE workspace_id = p_workspace;
      ELSE
        UPDATE public.tv_station
           SET state = 'stopped',
               current_snapshot_track_id = NULL,
               position_seconds = 0,
               started_at = NULL,
               consecutive_failures = v_failures,
               last_failure_at = now(),
               stopped_reason = 'end_of_queue',
               state_sequence = state_sequence + 1,
               updated_at = now()
         WHERE workspace_id = p_workspace;
      END IF;
    ELSE
      UPDATE public.tv_station
         SET current_snapshot_track_id = v_next.id,
             position_seconds = 0,
             started_at = now(),
             state = 'playing',
             consecutive_failures = v_failures,
             last_failure_at = now(),
             state_sequence = state_sequence + 1,
             updated_at = now()
       WHERE workspace_id = p_workspace;
    END IF;
  END IF;

  RETURN jsonb_build_object('status','reported','failures',v_failures);
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. station_recover_failed (service_role): backstop para reason='failures' >5 min
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.station_recover_failed(p_workspace uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_st public.tv_station%ROWTYPE;
  v_track uuid;
BEGIN
  SELECT * INTO v_st FROM public.tv_station WHERE workspace_id = p_workspace;
  IF NOT FOUND OR v_st.stopped_reason <> 'failures'
     OR v_st.last_failure_at IS NULL
     OR v_st.last_failure_at > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('status','skipped');
  END IF;
  v_track := (SELECT id FROM public.tv_queue_snapshot_tracks
               WHERE snapshot_id = v_st.queue_snapshot_id ORDER BY position LIMIT 1);
  UPDATE public.tv_station
     SET state = 'playing',
         current_snapshot_track_id = v_track,
         position_seconds = 0,
         started_at = now(),
         consecutive_failures = 0,
         stopped_reason = NULL,
         last_failure_at = NULL,
         state_sequence = state_sequence + 1,
         updated_at = now()
   WHERE workspace_id = p_workspace;
  RETURN jsonb_build_object('status','recovered');
END;
$$;


-- ----------------------------------------------------------------------------
-- 7. Grants
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.station_set_loop_mode(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.station_set_loop_mode(uuid,text) TO authenticated;

REVOKE ALL ON FUNCTION public.station_report_track_failure(uuid,uuid,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.station_report_track_failure(uuid,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.station_recover_failed(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.station_recover_failed(uuid) TO service_role;

-- materialize grant já existente (service_role), preservar.

-- ----------------------------------------------------------------------------
-- station_auto_advance: versão com loop e reset de falhas
-- ----------------------------------------------------------------------------
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
  v_new_snap uuid;
  v_first    uuid;
BEGIN
  IF p_workspace IS NULL THEN
    RAISE EXCEPTION 'WORKSPACE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('tv_station:' || p_workspace::text, 0));

  v_st := public.ensure_station_row(p_workspace);

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

  IF p_expected_sequence IS NOT NULL AND v_st.state_sequence <> p_expected_sequence THEN
    RAISE EXCEPTION 'SEQUENCE_CONFLICT' USING ERRCODE = '40900';
  END IF;

  v_replay := public.station_try_replay(p_workspace, v_key, v_hash);
  IF v_replay IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'replayed', 'result', v_replay);
  END IF;

  IF v_st.state <> 'playing' THEN
    RETURN jsonb_build_object('status', 'no_op', 'reason', 'NOT_PLAYING');
  END IF;

  IF p_current_snapshot_track_id IS NOT NULL
     AND (v_st.current_snapshot_track_id IS NULL
          OR v_st.current_snapshot_track_id <> p_current_snapshot_track_id) THEN
    RETURN jsonb_build_object('status', 'no_op', 'reason', 'TRACK_MISMATCH');
  END IF;

  IF v_st.current_snapshot_track_id IS NULL THEN
    RETURN jsonb_build_object('status', 'no_op', 'reason', 'NO_CURRENT_TRACK');
  END IF;

  SELECT * INTO v_t FROM public.tv_queue_snapshot_tracks t
    WHERE t.id = v_st.current_snapshot_track_id;

  IF NOT FOUND OR v_t.duration_seconds IS NULL OR v_t.duration_seconds <= 0 THEN
    RETURN jsonb_build_object('status', 'no_op', 'reason', 'DURATION_UNKNOWN');
  END IF;

  IF v_st.started_at IS NULL THEN
    RETURN jsonb_build_object('status', 'no_op', 'reason', 'UNKNOWN_STARTED_AT');
  END IF;

  v_elapsed := v_st.position_seconds + EXTRACT(EPOCH FROM (now() - v_st.started_at));
  IF v_elapsed < v_t.duration_seconds THEN
    RETURN jsonb_build_object('status', 'no_op', 'reason', 'NOT_ELAPSED');
  END IF;

  v_t := public.relative_track(p_workspace, 1);
  IF v_t.id IS NULL THEN
    IF v_st.loop_mode IN ('loop','loop_shuffle') THEN
      v_new_snap := public.materialize_station_snapshot(p_workspace, (v_st.loop_mode = 'loop_shuffle'));
      SELECT id INTO v_first
        FROM public.tv_queue_snapshot_tracks
       WHERE snapshot_id = v_new_snap
       ORDER BY position
       LIMIT 1;
      IF v_first IS NULL THEN
        UPDATE public.tv_station
           SET state = 'stopped',
               current_snapshot_track_id = NULL,
               position_seconds = 0,
               started_at = NULL,
               consecutive_failures = 0,
               stopped_reason = 'end_of_queue',
               state_sequence = state_sequence + 1,
               updated_at = now()
         WHERE workspace_id = p_workspace;
      ELSE
        UPDATE public.tv_station
           SET queue_snapshot_id = v_new_snap,
               current_snapshot_track_id = v_first,
               position_seconds = 0,
               started_at = now(),
               state = 'playing',
               consecutive_failures = 0,
               stopped_reason = NULL,
               state_sequence = state_sequence + 1,
               updated_at = now()
         WHERE workspace_id = p_workspace;
      END IF;
    ELSE
      UPDATE public.tv_station
         SET state = 'stopped',
             current_snapshot_track_id = NULL,
             position_seconds = 0,
             started_at = NULL,
             consecutive_failures = 0,
             stopped_reason = 'end_of_queue',
             state_sequence = state_sequence + 1,
             updated_at = now()
       WHERE workspace_id = p_workspace;
    END IF;
  ELSE
    UPDATE public.tv_station
       SET current_snapshot_track_id = v_t.id,
           position_seconds = 0,
           started_at = now(),
           state = 'playing',
           consecutive_failures = 0,
           stopped_reason = NULL,
           state_sequence = state_sequence + 1,
           updated_at = now()
     WHERE workspace_id = p_workspace;
  END IF;

  v_res := jsonb_build_object('status', 'applied', 'result', public.station_mutation_result(p_workspace));
  PERFORM public.station_record_idempotency(p_workspace, v_key, v_hash, v_res);
  RETURN v_res;
END;
$$;

COMMIT;