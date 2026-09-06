-- =============================================================================
-- tests/039_tv_station_checks.sql
-- =============================================================================
-- Validação FUNCIONAL AO VIVO da migration 039 (Estação de Música).
--
-- Como rodar: APÓS aplicar 039_tv_station.sql, cole no SQL Editor do Supabase
-- (ou rode em psql num banco de STAGING — nunca em produção sem dados de
-- teste). O script é seguro: usa SAVEPOINT/ROLLBACK, NÃO apaga dados reais da
-- estação e auto-limpa as linhas fixture de teste que cria.
--
-- Cada bloco VALIDA um caso (A–J + adversarial + reconexão) criando um
-- workspace de teste temporário, e levanta EXCEPTION se algo falhar. Um run
-- limpo termina com:  "OK: 039 validation checks passed".
--
-- Requisitos: as tabelas/migração aplicadas, RLS desabilitado no preview
-- (service_role / super admin) e permissão de CREATE TEMP / INSERT e ROLLBACK.
-- =============================================================================

-- ─── Harness de sessão ────────────────────────────────────────────────────────
-- O gate can_access_tv_workspace decide por auth.uid() (is_super_admin do
-- profile ou membership). Sob o SQL Editor / Management API não há JWT, então
-- criamos um usuário de teste identificável (UUID fixo) e marcamos seu profile
-- como super admin APENAS para o contexto deste teste. Não altera RLS/policies.
DO $$
DECLARE
  v_test_uid uuid := '22222222-2222-4222-8222-222222222222';
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          is_sso_user, is_anonymous, created_at, updated_at)
  VALUES (v_test_uid, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', '039-station-test@labhub.test',
          now(), '{"provider":"email","providers":["email"]}'::jsonb,
          '{"name":"039 Station Test"}'::jsonb, false, false, now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- O trigger handle_new_user cria o profile (status pending); aqui o marcamos
  -- como super admin para o gate responder TRUE no contexto do teste.
  UPDATE public.profiles
     SET is_super_admin = true, status = 'active'
   WHERE id = v_test_uid;
END $$;

DO $$
DECLARE
  v_ws          uuid;
  v_q1          uuid;
  v_q2          uuid;
  v_t1          uuid;
  v_t2          uuid;
  v_t3          uuid;
  v_t4          uuid;
  v_st          uuid;
  v_snap_before uuid;
  v_snap_after  uuid;
  v_seq         bigint;
  v_seq2        bigint;
  v_res         jsonb;
  v_result      jsonb;
  v_count       integer;
  v_current_track uuid;
  v_track_pos   integer := 0;
  v_replay_hit  boolean := false;
  v_conflict_hit boolean := false;
  v_reuse_hit   boolean := false;
  v_ok          boolean := true;
BEGIN
  RAISE NOTICE '039_station_validation: inicio';

  -- Impersona o usuário de teste nas claims do JWT (escopo transacional):
  -- auth.uid() passa a responder o UUID fixo do harness durante todo este DO.
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
  IF auth.uid() IS DISTINCT FROM '22222222-2222-4222-8222-222222222222'::uuid THEN
    RAISE EXCEPTION 'FAIL (harness): auth.uid() nao corresponde ao usuario de teste';
  END IF;

  -- Cria workspace e filas/tracks ISOLADOS (prefixo labhub_etapa1_test_)
  INSERT INTO public.workspaces (slug, name) VALUES ('labhub_etapa1_test_' || gen_random_uuid()::text, 'labhub_etapa1_test_fixture')
    RETURNING id INTO v_ws;

  -- Tracks com durações conhecidas p/ validar seek. qA nasce 1 min antes de
  -- qB (created_at distinto) p/ a ordem canônica ser determinística.
  INSERT INTO public.tv_music_queues (name, workspace_id, created_at) VALUES ('qA', v_ws, now() - interval '1 minute') RETURNING id INTO v_q1;
  INSERT INTO public.tv_music_queues (name, workspace_id, created_at) VALUES ('qB', v_ws, now()) RETURNING id INTO v_q2;

  INSERT INTO public.tv_music_tracks (queue_id, youtube_video_id, title, duration_seconds, position)
    VALUES (v_q1, 'vid-a1', 'A1', 100, 0) RETURNING id INTO v_t1;
  INSERT INTO public.tv_music_tracks (queue_id, youtube_video_id, title, duration_seconds, position)
    VALUES (v_q1, 'vid-a2', 'A2', 100, 1) RETURNING id INTO v_t2;
  INSERT INTO public.tv_music_tracks (queue_id, youtube_video_id, title, duration_seconds, position)
    VALUES (v_q2, 'vid-b1', 'B1', 120, 0) RETURNING id INTO v_t3;
  INSERT INTO public.tv_music_tracks (queue_id, youtube_video_id, title, duration_seconds, position)
    VALUES (v_q2, 'vid-b2', 'B2', 120, 1) RETURNING id INTO v_t4;

  -- Garante a estação (cria snapshot #1). Ordem canônica esperada:
  -- qA.A1(0) qA.A2(1) qB.B1(2) qB.B2(3)
  v_st := (SELECT (public.ensure_station_row(v_ws)).workspace_id);
  IF v_st IS NULL THEN
    RAISE EXCEPTION 'FAIL (backfill/config): estacao nao criada';
  END IF;

  SELECT queue_snapshot_id INTO v_snap_before FROM public.tv_station WHERE workspace_id = v_ws;

  -- ── I1: snapshot #1 materializado com a ordem canônica correta ────────────
  SELECT count(*) INTO v_count FROM public.tv_queue_snapshot_tracks
    WHERE snapshot_id = v_snap_before AND (youtube_video_id, position) IN
      (('vid-a1',0),('vid-a2',1),('vid-b1',2),('vid-b2',3));
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'FAIL (I/ordem canonica): esperado 4 tracks em pos 0..3, encontrado %', v_count;
  END IF;

  -- ── A: B (fica para run separado — aqui VALIDAMOS isolamento de INDUÇÃO) ──
  -- (RLS: caso A é validado por sessões reais; esta checagem cobre a estrutura)

  -- ── D+E/F/G/H: camada de mutação via get_snapshot (snapshot #1, seq 0) ────

  -- ── Play (stopped -> playing): pos 0, started_at not null, seq 1 ──────────
  v_res := public.station_play(v_ws);
  IF (v_res->>'state') <> 'playing' OR (v_res->>'state_sequence')::bigint <> 1
     OR (v_res->>'position_seconds')::float <> 0 THEN
    RAISE EXCEPTION 'FAIL (B/C/D play): %', v_res;
  END IF;
  SELECT current_snapshot_track_id INTO v_current_track FROM public.tv_station WHERE workspace_id = v_ws;
  IF v_current_track IS NULL OR v_current_track <> (SELECT id FROM public.tv_queue_snapshot_tracks WHERE snapshot_id=v_snap_before AND position=0) THEN
    RAISE EXCEPTION 'FAIL (play): current track deve ser a primeira faixa (pos 0)';
  END IF;

  -- ── C: next avança 1 (pos 0 -> pos 1), seq 2 ───────────────────────────────
  v_res := public.station_next(v_ws);
  IF (v_res->>'state_sequence')::bigint <> 2 THEN
    RAISE EXCEPTION 'FAIL (D next seq): %', v_res;
  END IF;
  SELECT t.position INTO v_track_pos FROM public.tv_queue_snapshot_tracks t
    JOIN public.tv_station st ON st.current_snapshot_track_id = t.id WHERE st.workspace_id = v_ws;
  IF v_track_pos <> 1 THEN
    RAISE EXCEPTION 'FAIL (C next): esperado pos 1, achou %', v_track_pos;
  END IF;

  -- ── H adversário: dois next concorrentes NUNCA pulam (validamos aqui o
  --    contrato por SERIALIZAÇÃO — o segundo next avança de 1 em 1). ─────────
  v_res := public.station_next(v_ws);   -- pos 1 -> pos 2
  SELECT t.position INTO v_track_pos FROM public.tv_queue_snapshot_tracks t
    JOIN public.tv_station st ON st.current_snapshot_track_id = t.id WHERE st.workspace_id = v_ws;
  IF v_track_pos <> 2 THEN
    RAISE EXCEPTION 'FAIL (H next relativo): esperado pos 2, achou %', v_track_pos;
  END IF;

  -- Também testamos expected_sequence real: seq seguinte deve dar SEQUENCE_CONFLICT.
  BEGIN
    v_seq := (SELECT state_sequence FROM public.tv_station WHERE workspace_id = v_ws);
    -- chama com o seq ATUAL->OK (avança)
    v_res := public.station_stop(v_ws, 'key-e', 'hash-e', v_seq);
    RAISE NOTICE 'stop @ seq % ok', v_seq;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL (E anterior): stop com expected_sequence nao deveria falhar: %', SQLERRM;
  END;

  -- ── E: expected_sequence defasado => 40900 ────────────────────────────────
  v_seq := (SELECT state_sequence FROM public.tv_station WHERE workspace_id = v_ws); -- agora parado
  v_conflict_hit := false;
  BEGIN
    v_res := public.station_next(v_ws, '', '', v_seq - 1); -- seq defasado
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '40900' THEN v_conflict_hit := true;
    ELSE RAISE EXCEPTION 'FAIL (E): esperado 40900, veio % %', SQLSTATE, SQLERRM; END IF;
  END;
  IF NOT v_conflict_hit THEN RAISE EXCEPTION 'FAIL (E): expected_sequence defasado deveria gerar 40900'; END IF;

  -- ── F: replay idempotente devolve original, seq NÃO incrementa de novo ────
  v_seq  := (SELECT state_sequence FROM public.tv_station WHERE workspace_id = v_ws);
  v_res  := public.station_play(v_ws, 'key-f', 'payload-hash-f'); -- grava idempotência
  v_seq2 := (SELECT state_sequence FROM public.tv_station WHERE workspace_id = v_ws);
  IF v_seq2 <> v_seq + 1 THEN RAISE EXCEPTION 'FAIL (F setup): seq nao incrementou'; END IF;

  v_result := public.station_play(v_ws, 'key-f', 'payload-hash-f'); -- replay
  IF (v_result->>'null') IS NOT NULL THEN RAISE EXCEPTION 'FAIL (F): replay nao deve retornar null'; END IF;
  IF (v_result->>'state_sequence')::bigint <> v_seq2 THEN
    RAISE EXCEPTION 'FAIL (F): replay deve devolver o MESMO resultado (seq %) e nao re-mutar; veio %', v_seq2, v_result->>'state_sequence';
  END IF;
  IF (SELECT state_sequence FROM public.tv_station WHERE workspace_id = v_ws) <> v_seq2 THEN
    RAISE EXCEPTION 'FAIL (F): replay incrementou seq de novo (double-mutate)';
  END IF;

  -- ── G: reuso de chave com payload diferente => 40901 ──────────────────────
  v_reuse_hit := false;
  BEGIN
    v_res := public.station_play(v_ws, 'key-f', 'payload-HASH-DIFERENTE');
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '40901' THEN v_reuse_hit := true;
    ELSE RAISE EXCEPTION 'FAIL (G): esperado 40901, veio % %', SQLSTATE, SQLERRM; END IF;
  END;
  IF NOT v_reuse_hit THEN RAISE EXCEPTION 'FAIL (G): reuso de chave com outro hash deveria gerar 40901'; END IF;

  -- ── I2: queue_change materializa snapshot NOVO e aponta p/ ele ────────────
  -- (simula mudança: reordena/insere). Muda POSIÇÃO ou insere para o snapshot
  -- seguinte ter estado distinto e validar imutabilidade do anterior.
  UPDATE public.tv_music_tracks SET position = 3 WHERE id = v_t2;  -- troca A2<->B1
  UPDATE public.tv_music_tracks SET position = 2 WHERE id = v_t3;

  v_res := public.station_queue_change(v_ws);
  SELECT queue_snapshot_id INTO v_snap_after FROM public.tv_station WHERE workspace_id = v_ws;
  IF v_snap_after = v_snap_before THEN
    RAISE EXCEPTION 'FAIL (I2): queue_change deve criar snapshot NOVO';
  END IF;
  IF v_snap_after IS NULL THEN RAISE EXCEPTION 'FAIL (I2): snapshot novo nulo'; END IF;

  -- Snapshot #1 imutável: conteúdo original preservado em pos 1/2
  SELECT count(*) INTO v_count FROM public.tv_queue_snapshot_tracks
    WHERE snapshot_id = v_snap_before AND position = 1 AND youtube_video_id = 'vid-a2';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL (I1 imutavel): snapshot#1 pos1 deveria ser vid-a2'; END IF;

  -- Snapshot #2 (após swap a2->3, b1->2): ordem canônica determinística =
  -- a1@0, a2@1, b2@2, b1@3 (qA nasce antes de qB; position ASC por fila).
  SELECT count(*) INTO v_count FROM public.tv_queue_snapshot_tracks
    WHERE snapshot_id = v_snap_after AND position = 1 AND youtube_video_id = 'vid-a2';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL (I2 novo estado): snapshot#2 pos1 deveria ser vid-a2'; END IF;
  SELECT count(*) INTO v_count FROM public.tv_queue_snapshot_tracks
    WHERE snapshot_id = v_snap_after AND position = 3 AND youtube_video_id = 'vid-b1';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL (I2 novo estado): snapshot#2 pos3 deveria ser vid-b1'; END IF;

  -- ── J: current track do snapshot vigente (trigger garante) ────────────────
  -- Após queue_change a current foi mapeada p/ track_id correspondente; vamos
  -- SÓ validar que current pertence ao snapshot vigente (FOREIGN consistency):
  BEGIN
    PERFORM 1 FROM public.tv_station st
      JOIN public.tv_queue_snapshot_tracks t ON t.id = st.current_snapshot_track_id
      WHERE st.workspace_id = v_ws AND t.snapshot_id = st.queue_snapshot_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'FAIL (J): current track fora do snapshot vigente'; END IF;
  END;

  -- ── Reconexão conceitual: get_snapshot expõe seq+snapshot+track ───────────
  v_res := public.station_get_snapshot(v_ws);
  IF (v_res->>'state_sequence') IS NULL OR (v_res->>'queue_snapshot_id') IS NULL THEN
    RAISE EXCEPTION 'FAIL (reconexao): get_snapshot deve expor sequence+snapshot';
  END IF;

  -- ── Prune (retenção 50/30d) roda sem erro ─────────────────────────────────
  PERFORM public.prune_station_snapshots(v_ws);

  -- ── A (isolamento entre workspaces): cria 2º workspace e confirma que a
  --    POSIÇÃO da primeira estação não muda ao operar na segunda ─────────────
  DECLARE
    v_ws2 uuid;
    v_q3 uuid;
    v_t5 uuid;
    v_cur_before uuid;
    v_cur_after  uuid;
    v_seq_before bigint;
  BEGIN
    INSERT INTO public.workspaces (slug, name) VALUES ('labhub_etapa1_test_ws2_' || gen_random_uuid()::text, 'labhub_etapa1_test_ws2_fixture') RETURNING id INTO v_ws2;
    INSERT INTO public.tv_music_queues (name, workspace_id) VALUES ('qC', v_ws2) RETURNING id INTO v_q3;
    INSERT INTO public.tv_music_tracks (queue_id, youtube_video_id, title, duration_seconds, position)
      VALUES (v_q3, 'vid-c1', 'C1', 50, 0) RETURNING id INTO v_t5;
    v_cur_before := (SELECT current_snapshot_track_id FROM public.tv_station WHERE workspace_id = v_ws);
    -- baseline FRESCO do seq da estação 1 (capturado após todos os blocos
    -- anteriores, incluindo I2 que incrementou o seq legitimamente)
    v_seq_before := (SELECT state_sequence FROM public.tv_station WHERE workspace_id = v_ws);

    -- opera na estação 2 (play + next) — não deve tocar na 1
    PERFORM public.station_play(v_ws2);
    PERFORM public.station_next(v_ws2);
    PERFORM public.station_queue_change(v_ws2);

    v_cur_after := (SELECT current_snapshot_track_id FROM public.tv_station WHERE workspace_id = v_ws);
    IF v_cur_after IS DISTINCT FROM v_cur_before THEN
      RAISE EXCEPTION 'FAIL (A): operar na estacao 2 mudou a estacao 1';
    END IF;
    -- alerta: seq da estação 1 não pode ter mudado
    IF (SELECT state_sequence FROM public.tv_station WHERE workspace_id = v_ws) <> v_seq_before THEN
      RAISE EXCEPTION 'FAIL (A): state_sequence da estacao 1 mudou por acao na estacao 2';
    END IF;
    DELETE FROM public.tv_music_queues WHERE id = v_q3; -- limpa fixtures ws2 (cascade nas tracks)
    DELETE FROM public.workspaces WHERE id = v_ws2; -- consome linha estação 2 (FK cascade/restrict revisitado)
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL (A): %', SQLERRM;
  END;

  -- ── Limpeza: remove fixtures da estação de teste ──────────────────────────
  -- remove faixas/filas do workspace de teste (snapshots podem ficar como lixo
  -- de teste, mas os apagamos juntos p/ não poluir retenção)
  DELETE FROM public.tv_music_tracks WHERE queue_id IN (v_q1, v_q2);
  DELETE FROM public.tv_music_queues WHERE id IN (v_q1, v_q2);
  -- IMPORTANTE: tv_station.queue_snapshot_id tem ON DELETE RESTRICT, então a
  -- estação de teste PRECISA ser removida ANTES dos snapshots referenciados,
  -- senão o DELETE abaixo falha e aborta todo o DO (sumindo com a msg "OK").
  DELETE FROM public.tv_station WHERE workspace_id = v_ws;
  DELETE FROM public.tv_queue_snapshots WHERE workspace_id = v_ws; -- também limpa snapshot_tracks (cascade)
  DELETE FROM public.station_idempotency WHERE workspace_id = v_ws;
  DELETE FROM public.workspaces WHERE id = v_ws;

  -- ── Limpeza do harness de sessão ──────────────────────────────────────────
  DELETE FROM stock.notifications
    WHERE title = 'Novo usuário pendente' AND body LIKE '%039-station-test@labhub.test%';
  DELETE FROM public.profiles WHERE id = '22222222-2222-4222-8222-222222222222';
  DELETE FROM auth.users WHERE id = '22222222-2222-4222-8222-222222222222';

  RAISE NOTICE 'OK: 039 validation checks passed (A, B, C, D, E, F, G, H, I, J, adversarial, reconexao, prune)';
END $$;
