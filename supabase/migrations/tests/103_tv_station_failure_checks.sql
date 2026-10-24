-- =============================================================================
-- tests/103_tv_station_failure_checks.sql
-- =============================================================================
-- Validação FUNCIONAL AO VIVO da migration 103 (Estação: loop + falhas),
-- focada na RPC station_report_track_failure.
--
-- Como rodar: APÓS aplicar 103_tv_station_loop_and_failures.sql, cole no
-- SQL Editor do Supabase (ou rode em psql num banco de STAGING — nunca em
-- produção). O script é seguro: usa workspace/fixtures de teste temporárias,
-- não apaga dados reais e termina com "OK: 103 failure checks passed".
--
-- Casos cobertos:
--   F1  falha válida na faixa atual => processada (failures incrementado)
--   F2  faixa antiga (track mismatch) => no_op, sem alterar estado/contador
--   F3  repetição com mesma chave => replay, sem segunda mutação
--   F4  mesma chave com track diferente => IDEMPOTENCY_KEY_REUSE (40901)
--   F5  falhas consecutivas => limite de parada (>=3 => stopped/failures)
--   F6  repetição de TRACK_MISMATCH com mesma chave => replay, sem mutação
--   F7  chamada sem chave (NULL) com faixa antiga => no_op, compatível
--   F8  isolamento entre estações => falha em uma não afeta a outra
--   F9  loop/loop_shuffle => comportamento preservado após falha
--   F10 permissões => RPC só executável por service_role
-- =============================================================================

DO $$
DECLARE
  v_test_uid uuid := '33333333-3333-4333-8333-333333333333';
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, is_sso_user,
                          is_anonymous, created_at, updated_at)
  VALUES (v_test_uid, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', '103-failure-test@labhub.test',
          now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, false, false, now(), now())
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles
     SET is_super_admin = true, status = 'active'
   WHERE id = v_test_uid;
END $$;

DO $$
DECLARE
  v_test_uid uuid := '33333333-3333-4333-8333-333333333333';
  v_ws_a uuid;
  v_ws_b uuid;
  v_q  uuid;
  v_t1 uuid;
  v_t2 uuid;
  v_t3 uuid;
  v_snap uuid;
  v_st public.tv_station%ROWTYPE;
  v_res jsonb;
  v_failures integer;
  v_failures_before integer;
  v_seq_before bigint;
  v_seq_after bigint;
BEGIN
  -- Impersona o usuário de teste nas claims do JWT (escopo transacional).
  PERFORM set_config('request.jwt.claim.sub', v_test_uid::text, true);
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_test_uid), true);
  IF auth.uid() IS DISTINCT FROM v_test_uid THEN
    RAISE EXCEPTION 'FAIL (harness): auth.uid() nao corresponde ao usuario de teste';
  END IF;

  -- Workspaces de teste isolados.
  INSERT INTO public.workspaces (slug, name)
  VALUES ('labhub_103_test_a_' || gen_random_uuid()::text, '103 WS A')
  RETURNING id INTO v_ws_a;
  INSERT INTO public.workspaces (slug, name)
  VALUES ('labhub_103_test_b_' || gen_random_uuid()::text, '103 WS B')
  RETURNING id INTO v_ws_b;

  -- Fila com 3 tracks para o workspace A.
  INSERT INTO public.tv_music_queues (workspace_id, name)
  VALUES (v_ws_a, '103 Queue A') RETURNING id INTO v_q;
  INSERT INTO public.tv_music_tracks (queue_id, youtube_video_id, title, duration_seconds, position)
  VALUES (v_q, 'track103a1', 'Track A1', 200, 0) RETURNING id INTO v_t1;
  INSERT INTO public.tv_music_tracks (queue_id, youtube_video_id, title, duration_seconds, position)
  VALUES (v_q, 'track103a2', 'Track A2', 200, 1) RETURNING id INTO v_t2;
  INSERT INTO public.tv_music_tracks (queue_id, youtube_video_id, title, duration_seconds, position)
  VALUES (v_q, 'track103a3', 'Track A3', 200, 2) RETURNING id INTO v_t3;

  -- Materializa snapshot #1 e cria estação no workspace A.
  PERFORM public.materialize_station_snapshot(v_ws_a);
  v_st := public.ensure_station_row(v_ws_a);

  -- Aponta a estação para a primeira faixa do snapshot vigente e coloca em playing.
  SELECT id INTO v_snap
    FROM public.tv_queue_snapshots
   WHERE workspace_id = v_ws_a
   ORDER BY version DESC LIMIT 1;
  SELECT id INTO v_t1
    FROM public.tv_queue_snapshot_tracks
   WHERE snapshot_id = v_snap
   ORDER BY position ASC LIMIT 1;

  UPDATE public.tv_station
     SET queue_snapshot_id = v_snap,
         current_snapshot_track_id = v_t1,
         state = 'playing',
         started_at = now(),
         position_seconds = 0,
         consecutive_failures = 0,
         updated_at = now()
   WHERE workspace_id = v_ws_a;

  ---------------------------------------------------------------------------
  -- F1: falha válida na faixa atual => processada, failures incrementado.
  ---------------------------------------------------------------------------
  v_res := public.station_report_track_failure(v_ws_a, v_t1, 'idem-f1-1');
  IF (v_res->>'status') IS DISTINCT FROM 'reported' THEN
    RAISE EXCEPTION 'FAIL (F1): esperado status reported, obteve %', v_res->>'status';
  END IF;
  IF (v_res->>'failures')::integer <> 1 THEN
    RAISE EXCEPTION 'FAIL (F1): esperado failures=1, obteve %', v_res->>'failures';
  END IF;

  SELECT consecutive_failures INTO v_failures
    FROM public.tv_station WHERE workspace_id = v_ws_a;
  IF v_failures <> 1 THEN
    RAISE EXCEPTION 'FAIL (F1): consecutive_failures deveria ser 1, encontrado %', v_failures;
  END IF;

  ---------------------------------------------------------------------------
  -- F2: faixa antiga (track mismatch) => no_op, sem alterar estado.
  ---------------------------------------------------------------------------
  -- Insere uma faixa que NÃO é a current_snapshot_track_id da estação.
  SELECT id INTO v_t2
    FROM public.tv_queue_snapshot_tracks
   WHERE snapshot_id = v_st.queue_snapshot_id
     AND id <> v_t1
   ORDER BY position ASC LIMIT 1;
  IF v_t2 IS NULL THEN
    RAISE EXCEPTION 'FAIL (F2): nao encontrou faixa alternativa para teste de track antigo';
  END IF;

  v_seq_before := (SELECT state_sequence FROM public.tv_station WHERE workspace_id = v_ws_a);
  v_res := public.station_report_track_failure(v_ws_a, v_t2, 'idem-f2-1');
  IF (v_res->>'status') IS DISTINCT FROM 'no_op' THEN
    RAISE EXCEPTION 'FAIL (F2): esperado status no_op para faixa antiga, obteve %', v_res->>'status';
  END IF;
  IF (v_res->>'reason') IS DISTINCT FROM 'TRACK_MISMATCH' THEN
    RAISE EXCEPTION 'FAIL (F2): esperado reason TRACK_MISMATCH, obteve %', v_res->>'reason';
  END IF;
  v_seq_after := (SELECT state_sequence FROM public.tv_station WHERE workspace_id = v_ws_a);
  IF v_seq_after <> v_seq_before THEN
    RAISE EXCEPTION 'FAIL (F2): state_sequence nao deveria mudar para faixa antiga (antes=% depois=%)', v_seq_before, v_seq_after;
  END IF;
  SELECT consecutive_failures INTO v_failures
    FROM public.tv_station WHERE workspace_id = v_ws_a;
  IF v_failures <> 1 THEN
    RAISE EXCEPTION 'FAIL (F2): consecutive_failures deveria permanecer 1, encontrado %', v_failures;
  END IF;

  ---------------------------------------------------------------------------
  -- F3: repetição com mesma chave => replay, sem segunda mutação.
  ---------------------------------------------------------------------------
  v_seq_before := (SELECT state_sequence FROM public.tv_station WHERE workspace_id = v_ws_a);
  v_res := public.station_report_track_failure(v_ws_a, v_t1, 'idem-f1-1');
  IF (v_res->>'status') IS DISTINCT FROM 'reported' THEN
    RAISE EXCEPTION 'FAIL (F3): replay deveria retornar reported, obteve %', v_res->>'status';
  END IF;
  v_seq_after := (SELECT state_sequence FROM public.tv_station WHERE workspace_id = v_ws_a);
  IF v_seq_after <> v_seq_before THEN
    RAISE EXCEPTION 'FAIL (F3): state_sequence nao deveria mudar no replay (antes=% depois=%)', v_seq_before, v_seq_after;
  END IF;
  SELECT consecutive_failures INTO v_failures
    FROM public.tv_station WHERE workspace_id = v_ws_a;
  IF v_failures <> 1 THEN
    RAISE EXCEPTION 'FAIL (F3): consecutive_failures deveria permanecer 1 após replay, encontrado %', v_failures;
  END IF;

  ---------------------------------------------------------------------------
  -- F4: mesma chave com track diferente => IDEMPOTENCY_KEY_REUSE (40901).
  ---------------------------------------------------------------------------
  BEGIN
    PERFORM public.station_report_track_failure(v_ws_a, v_t2, 'idem-f1-1');
    RAISE EXCEPTION 'FAIL (F4): esperado erro IDEMPOTENCY_KEY_REUSE para chave reusada com track diferente';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE <> '40901' THEN
        RAISE EXCEPTION 'FAIL (F4): SQLSTATE inesperado % (esperado 40901)', SQLSTATE;
      END IF;
  END;

  ---------------------------------------------------------------------------
  -- F6: repetição de TRACK_MISMATCH com mesma chave => replay, sem mutação.
  ---------------------------------------------------------------------------
  -- O primeiro mismatch (chave 'idem-f2-1', track v_t2) já foi executado no F2
  -- e agora deve ser registrado para idempotência. Repetir com a mesma chave e
  -- o mesmo track deve retornar o resultado original por replay.
  v_seq_before := (SELECT state_sequence FROM public.tv_station WHERE workspace_id = v_ws_a);
  v_failures_before := (SELECT consecutive_failures FROM public.tv_station WHERE workspace_id = v_ws_a);
  v_res := public.station_report_track_failure(v_ws_a, v_t2, 'idem-f2-1');
  IF (v_res->>'status') IS DISTINCT FROM 'no_op' THEN
    RAISE EXCEPTION 'FAIL (F6): replay de TRACK_MISMATCH deveria retornar no_op, obteve %', v_res->>'status';
  END IF;
  IF (v_res->>'reason') IS DISTINCT FROM 'TRACK_MISMATCH' THEN
    RAISE EXCEPTION 'FAIL (F6): replay de TRACK_MISMATCH deveria retornar reason TRACK_MISMATCH, obteve %', v_res->>'reason';
  END IF;
  v_seq_after := (SELECT state_sequence FROM public.tv_station WHERE workspace_id = v_ws_a);
  IF v_seq_after <> v_seq_before THEN
    RAISE EXCEPTION 'FAIL (F6): state_sequence nao deveria mudar no replay de TRACK_MISMATCH (antes=% depois=%)', v_seq_before, v_seq_after;
  END IF;
  SELECT consecutive_failures INTO v_failures
    FROM public.tv_station WHERE workspace_id = v_ws_a;
  IF v_failures <> v_failures_before THEN
    RAISE EXCEPTION 'FAIL (F6): consecutive_failures nao deveria mudar no replay de TRACK_MISMATCH (antes=% depois=%)', v_failures_before, v_failures;
  END IF;

  ---------------------------------------------------------------------------
  -- F7: chamada sem chave (NULL) com faixa antiga continua compatível.
  ---------------------------------------------------------------------------
  v_res := public.station_report_track_failure(v_ws_a, v_t2, NULL);
  IF (v_res->>'status') IS DISTINCT FROM 'no_op' THEN
    RAISE EXCEPTION 'FAIL (F7): chamada sem chave e faixa antiga deveria retornar no_op, obteve %', v_res->>'status';
  END IF;
  IF (v_res->>'reason') IS DISTINCT FROM 'TRACK_MISMATCH' THEN
    RAISE EXCEPTION 'FAIL (F7): chamada sem chave deveria retornar reason TRACK_MISMATCH, obteve %', v_res->>'reason';
  END IF;

  ---------------------------------------------------------------------------
  -- F5: falhas consecutivas => limite de parada (>=3 => stopped/failures).
  ---------------------------------------------------------------------------
  -- Chama falha válida na faixa atual mais 2 vezes (total chega a 3).
  -- Após F1, a estação avançou para a próxima faixa (v_t2 provavelmente).
  -- Precisamos reportar falha na faixa atual agora.
  SELECT current_snapshot_track_id INTO v_t1
    FROM public.tv_station WHERE workspace_id = v_ws_a;
  v_res := public.station_report_track_failure(v_ws_a, v_t1, 'idem-f5-1');
  IF (v_res->>'failures')::integer <> 2 THEN
    RAISE EXCEPTION 'FAIL (F5): esperado failures=2, obteve %', v_res->>'failures';
  END IF;
  v_res := public.station_report_track_failure(v_ws_a, v_t1, 'idem-f5-2');
  IF (v_res->>'failures')::integer <> 3 THEN
    RAISE EXCEPTION 'FAIL (F5): esperado failures=3, obteve %', v_res->>'failures';
  END IF;
  SELECT state, stopped_reason INTO v_st.state, v_st.stopped_reason
    FROM public.tv_station WHERE workspace_id = v_ws_a;
  IF v_st.state <> 'stopped' THEN
    RAISE EXCEPTION 'FAIL (F5): estado deveria ser stopped apos 3 falhas, encontrado %', v_st.state;
  END IF;
  IF v_st.stopped_reason <> 'failures' THEN
    RAISE EXCEPTION 'FAIL (F5): stopped_reason deveria ser failures, encontrado %', v_st.stopped_reason;
  END IF;

  ---------------------------------------------------------------------------
  -- F8: isolamento entre estações => falha em WS A nao afeta WS B.
  ---------------------------------------------------------------------------
  -- WS B sem estação ainda; ensure_station_row cria parada.
  v_res := public.station_report_track_failure(v_ws_b, NULL, 'idem-f7-1');
  IF (v_res->>'status') IS DISTINCT FROM 'reported' THEN
    RAISE EXCEPTION 'FAIL (F7): WS B deveria retornar reported, obteve %', v_res->>'status';
  END IF;
  SELECT consecutive_failures INTO v_failures
    FROM public.tv_station WHERE workspace_id = v_ws_b;
  IF v_failures <> 1 THEN
    RAISE EXCEPTION 'FAIL (F7): WS B consecutive_failures deveria ser 1, encontrado %', v_failures;
  END IF;
  -- WS A deve permanecer parado com consecutive_failures = 3.
  SELECT consecutive_failures INTO v_failures
    FROM public.tv_station WHERE workspace_id = v_ws_a;
  IF v_failures <> 3 THEN
    RAISE EXCEPTION 'FAIL (F8): WS A consecutive_failures deveria permanecer 3, encontrado %', v_failures;
  END IF;

  RAISE NOTICE 'OK (F1-F7, F8): station_report_track_failure validado';
  RAISE NOTICE 'OK: 103 failure checks passed';
END;
$$;

-- =============================================================================
-- F9: loop/loop_shuffle => comportamento preservado apos falha (teste estatico
--     de DDL + comportamento quando houver banco efêmero no CI).
-- F10: permissões => verificado estaticamente via test_tv_station_migration.py
--      (GRANT somente a service_role, revogado de public/anon/authenticated).
-- =============================================================================
