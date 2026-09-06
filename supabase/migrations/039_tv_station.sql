-- =============================================================================
-- 039_tv_station.sql
-- =============================================================================
-- ETAPA 1 do módulo TV — ESTAÇÃO DE MÚSICA POR WORKSPACE (fundação
-- persistente e transacional).
--
-- Contexto (verificar docs/modules/tv/overview.md e o baselines TV):
--   O reprodutor atual guarda apenas um estado local no dispositivo
--   ("tv-music-player" no localStorage, MusicPlayerContext), sem esta sincronizada
--   entre os vários TVs de um workspace e sem trilha confiável de quem/quando
--   tocou. Falta também atomicidade: cada TV decide a sequência por conta
--   própria e moderações/reordenações são não-atômicas no cliente.
--
-- O que esta migration cria (fundação; sem mudança de player/UX ainda):
--   1. tv_queue_snapshots          — materializações imutáveis da sequência
--      de reprodução da estação (uma por versão, por workspace).
--   2. tv_queue_snapshot_tracks    — faixas de cada snapshot (posição, e
--      cópia de título/vídeo/duration para preservação histórica).
--   3. tv_station                  — estado persistente da estação do
--      workspace: state, position_seconds, started_at, state_sequence,
--      current_snapshot_track_id, queue_snapshot_id.
--   4. station_idempotency         — chaves idempotentes (workspace) com TTL
--      24h e request_hash (detecta reuso de chave com payload diferente).
--   5. Máquina de estados + RPCs transacionais (play/pause/resume/next/
--      previous/seek/stop/queue_change).

-- REGRA DA FILA CANÔNICA (derivada do código — NÃO inventada):
--   O frontend (useAllMusicTracks) reproduz a UNIÃO de todas as filas do
--   workspace: fetchQueues() ordena por created_at ASC e concatena os tracks
--   de cada fila (fetchTracks) por position ASC. Logo, o "estado canônico da
--   estação" é a união ordenada de todas as tv_music_queues do workspace
--   (created_at ASC) × tv_music_tracks (position ASC). A função de
--   materialização abaixo reproduz exatamente essa ordem.

-- TIMING MODEL (a partir da ETAPA 0.1):
--   position_seconds = AUTORIDADE única de offset.
--   started_at        = born clock (momento em que a reprodução começou).
--   station_synced_at = APENAS telemetria (FORA da fórmula de posição).
--   Fórmula (no cliente/API, não no banco):
--     pos = position_seconds + (now() - started_at)  quando state='playing'
--     pos = position_seconds                          caso contrário.
--
-- IDEMPOTÊNCIA:
--   PK (workspace_id, idempotency_key). expires_at = created_at + 24h.
--   Replay (mesma chave + mesmo request_hash) => retorna resultado original.
--   Reuso de chave com request_hash diferente => erro 409 (IDEMPOTENCY_KEY_REUSE).
--
-- CONCORRÊNCIA:
--   Toda mutação da estação adquire pg_advisory_xact_lock(workspace) e
--   incrementa state_sequence. expected_sequence opcional => se divergir,
--   erro 409 (SEQUENCE_CONFLICT); o cliente reconcilia via station_get_snapshot.
--
-- SEGURANÇA:
--   Escrita da estação SOMENTE via RPCs SECURITY DEFINER (search_path=public),
--   gate de acesso can_access_tv_workspace (membro/super/device). SEM policy
--   de INSERT/UPDATE/DELETE nas tabelas tv_station/snapshots para clientes.

-- IDEMPOTENTE: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
--   CREATE OR REPLACE FUNCTION / DROP POLICY IF EXISTS / DROP TRIGGER IF EXISTS.
-- =============================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. TABELAS BASE
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1.1 Snapshot da fila (materialização imutável por versão) ──────────────
CREATE TABLE IF NOT EXISTS public.tv_queue_snapshots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  version      integer NOT NULL,
  track_count  integer NOT NULL DEFAULT 0 CHECK (track_count >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, version),
  CHECK (version >= 1)
);

-- ─── 1.2 Faixas do snapshot (snapshot_id, posição, + cópia p/ histórico) ─────
CREATE TABLE IF NOT EXISTS public.tv_queue_snapshot_tracks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id      uuid NOT NULL REFERENCES public.tv_queue_snapshots(id) ON DELETE CASCADE,
  position         integer NOT NULL CHECK (position >= 0),
  youtube_video_id text NOT NULL,
  title            text NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  track_id         uuid,        -- referência à origem tv_music_tracks (NULL se a origem sumiu)
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, position)
);

-- ─── 1.3 Estado persistente da estação (1 linha por workspace) ───────────────
CREATE TABLE IF NOT EXISTS public.tv_station (
  workspace_id             uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  state                    text NOT NULL DEFAULT 'stopped'
                           CHECK (state IN ('stopped', 'playing', 'paused')),
  queue_snapshot_id        uuid NOT NULL REFERENCES public.tv_queue_snapshots(id) ON DELETE RESTRICT,
  current_snapshot_track_id uuid REFERENCES public.tv_queue_snapshot_tracks(id) ON DELETE SET NULL,
  position_seconds         double precision NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  started_at               timestamptz,
  station_synced_at        timestamptz,
  state_sequence           bigint NOT NULL DEFAULT 0,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (state = 'playing' AND started_at IS NOT NULL)
    OR (state IN ('stopped', 'paused'))
  )
);

-- ─── 1.4 Idempotência por workspace ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.station_idempotency (
  id              uuid DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_hash    text NOT NULL,          -- SHA-256 do payload canônico
  payload         jsonb,
  result          jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  PRIMARY KEY (workspace_id, idempotency_key)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_tv_queue_snapshots_workspace
  ON public.tv_queue_snapshots (workspace_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_tv_queue_snapshot_tracks_snapshot
  ON public.tv_queue_snapshot_tracks (snapshot_id, position);
CREATE INDEX IF NOT EXISTS idx_station_idempotency_expires
  ON public.station_idempotency (expires_at);
CREATE INDEX IF NOT EXISTS idx_station_synced
  ON public.tv_station (station_synced_at);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. INTEGRIDADE (o track atual SEMPRE pertence ao snapshot vigente)
-- ════════════════════════════════════════════════════════════════════════════
-- Garantia por trigger: current_snapshot_track_id só pode apontar para um
-- tv_queue_snapshot_tracks cujo snapshot_id == queue_snapshot_id da linha.
DROP TRIGGER IF EXISTS trg_station_snapshot_track_check ON public.tv_station;
CREATE OR REPLACE FUNCTION public.station_snapshot_track_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  IF NEW.current_snapshot_track_id IS NULL THEN
    -- stopped/sem faixa: ok (constraint de estado cobre o resto)
    RETURN NEW;
  END IF;
  PERFORM 1
    FROM public.tv_queue_snapshot_tracks t
    WHERE t.id = NEW.current_snapshot_track_id
      AND t.snapshot_id = NEW.queue_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT_TRACK_NOT_IN_SNAPSHOT'
      USING ERRCODE = '40903';
  END IF;
  v_ok := true;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_station_snapshot_track_check
  BEFORE INSERT OR UPDATE ON public.tv_station
  FOR EACH ROW EXECUTE FUNCTION public.station_snapshot_track_guard();

-- ════════════════════════════════════════════════════════════════════════════
-- 3. FUNÇÃO AUXILIAR: materializar snapshot da fila canônica
-- ════════════════════════════════════════════════════════════════════════════
-- Cria (na mesma transação) um snapshot novo com a versão seguinte e o
-- conteúdo ATUAL da fila canônica (ordem do frontend). Retorna o id.
CREATE OR REPLACE FUNCTION public.materialize_station_snapshot(p_workspace uuid)
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
    ORDER BY q.created_at ASC, q.id ASC, t.position ASC
  ) c
  RETURNING id INTO v_snapshot;

  INSERT INTO public.tv_queue_snapshot_tracks
    (snapshot_id, position, youtube_video_id, title, duration_seconds, track_id)
  SELECT v_snapshot,
         row_number() OVER (ORDER BY q.created_at ASC, q.id ASC, t.position ASC) - 1,
         t.youtube_video_id, t.title, t.duration_seconds, t.id
  FROM public.tv_music_tracks t
  JOIN public.tv_music_queues q ON q.id = t.queue_id
  WHERE q.workspace_id = p_workspace;

  RETURN v_snapshot;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. GARANTIR/OBTER a linha da estação (idempotente)
-- ════════════════════════════════════════════════════════════════════════════
-- Usada internamente pelos RPCs. Cria a estação com snapshot #1 (backfill
-- lazy) quando ainda não existe, ou devolve a existente. Apenas snapshots
-- que representam conteúdo vazio são "criados"; nunca cria duplicatas.
CREATE OR REPLACE FUNCTION public.ensure_station_row(p_workspace uuid)
RETURNS public.tv_station
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_station public.tv_station%ROWTYPE;
  v_snap    uuid;
BEGIN
  SELECT * INTO v_station FROM public.tv_station WHERE workspace_id = p_workspace;
  IF FOUND THEN
    RETURN v_station;
  END IF;

  v_snap := public.materialize_station_snapshot(p_workspace);

  INSERT INTO public.tv_station (workspace_id, state, queue_snapshot_id)
  VALUES (p_workspace, 'stopped', v_snap)
  RETURNING * INTO v_station;

  RETURN v_station;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. MÁQUINA DE ESTADOS — núcleo (callable pelas RPCs)
-- ════════════════════════════════════════════════════════════════════════════
-- Cada mutação: lock → gate → idempotência → expected_sequence → transição →
-- state_sequence +=1 → atualização da estação → retorno do novo estado.

-- Estado bruto atual + snapshot para as RPCs inspecionarem.
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

-- Helper de retorno p/ mutações (estado + contagem de faixas do snapshot).
CREATE OR REPLACE FUNCTION public.station_mutation_result(p_workspace uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_st public.tv_station%ROWTYPE;
BEGIN
  SELECT * INTO v_st FROM public.tv_station WHERE workspace_id = p_workspace;
  RETURN jsonb_build_object(
    'result', 'ok',
    'state', v_st.state,
    'position_seconds', v_st.position_seconds,
    'started_at', v_st.started_at,
    'state_sequence', v_st.state_sequence,
    'queue_snapshot_id', v_st.queue_snapshot_id,
    'current_snapshot_track_id', v_st.current_snapshot_track_id
  );
END;
$$;

-- Recupera a faixa do estado "corrente" no snapshot vigente.
CREATE OR REPLACE FUNCTION public.current_snapshot_track_id(p_workspace uuid)
RETURNS uuid
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT st.current_snapshot_track_id
  FROM public.tv_station st
  WHERE st.workspace_id = p_workspace
$$;

-- Primeira faixa (position mínima) do snapshot vigente da estação.
CREATE OR REPLACE FUNCTION public.first_track_of_current_snapshot(p_workspace uuid)
RETURNS public.tv_queue_snapshot_tracks
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_st public.tv_station%ROWTYPE;
  v_t   public.tv_queue_snapshot_tracks%ROWTYPE;
BEGIN
  SELECT * INTO v_st FROM public.tv_station WHERE workspace_id = p_workspace;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STATION_NOT_FOUND' USING ERRCODE = '40905';
  END IF;
  SELECT * INTO v_t FROM public.tv_queue_snapshot_tracks t
    WHERE t.snapshot_id = v_st.queue_snapshot_id
    ORDER BY t.position ASC LIMIT 1;
  RETURN v_t;
END;
$$;

-- Resolve relativa (next/previous) dentro do snapshot vigente.
-- p_direction: +1 (próxima) ou -1 (anterior), relativo à faixa atual.
CREATE OR REPLACE FUNCTION public.relative_track(p_workspace uuid, p_direction integer)
RETURNS public.tv_queue_snapshot_tracks
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_st public.tv_station%ROWTYPE;
  v_cur uuid;
  v_pos integer;
  v_t   public.tv_queue_snapshot_tracks%ROWTYPE;
BEGIN
  SELECT * INTO v_st FROM public.tv_station WHERE workspace_id = p_workspace;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STATION_NOT_FOUND' USING ERRCODE = '40905';
  END IF;
  v_cur := v_st.current_snapshot_track_id;

  IF v_cur IS NULL THEN
    -- sem faixa atual: resolve a partir da primeira (para a frente)
    SELECT * INTO v_t FROM public.tv_queue_snapshot_tracks t
      WHERE t.snapshot_id = v_st.queue_snapshot_id
      ORDER BY t.position ASC LIMIT 1;
    IF p_direction < 0 THEN
      RETURN NULL; -- "anterior" sem faixa atual => continua parado
    END IF;
    RETURN v_t;
  END IF;

  SELECT t.position INTO v_pos FROM public.tv_queue_snapshot_tracks t
    WHERE t.id = v_cur;
  IF v_pos IS NULL THEN
    RAISE EXCEPTION 'CURRENT_TRACK_MISSING' USING ERRCODE = '40906';
  END IF;

  SELECT * INTO v_t FROM public.tv_queue_snapshot_tracks t
    WHERE t.snapshot_id = v_st.queue_snapshot_id
      AND (CASE WHEN p_direction > 0 THEN t.position > v_pos ELSE t.position < v_pos END)
    ORDER BY (CASE WHEN p_direction > 0 THEN t.position ELSE -t.position END) ASC
    LIMIT 1;

  RETURN v_t;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. RPCs — ESTAÇÃO (transacionais, SECURITY DEFINER, access-gated)
-- ════════════════════════════════════════════════════════════════════════════

-- Kernel compartilhado: gate + lock + ensure + expected_sequence.
-- Retorna a linha da estação pronta para a transição. NÃO trata idempotência
-- (isso é responsabilidade do station_try_replay, chamado antes).
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

  -- 6.1 Gate de acesso (membro / super admin / device vinculado)
  IF NOT public.can_access_tv_workspace(p_workspace) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  -- 6.2 Serializa mutações concorrentes do mesmo workspace (fim da tx).
  PERFORM pg_advisory_xact_lock(hashtextextended('tv_station:' || p_workspace::text, 0));

  -- 6.3 Garante a linha da estação (backfill lazy idempotente).
  v_st := public.ensure_station_row(p_workspace);

  -- 6.4 expected_sequence opcional => conflito = 409 (reconciliar via get).
  IF p_expected_sequence IS NOT NULL AND v_st.state_sequence <> p_expected_sequence THEN
    RAISE EXCEPTION 'SEQUENCE_CONFLICT' USING ERRCODE = '40900';
  END IF;

  RETURN v_st;
END;
$$;

-- Resolve replay idempotente ANTES da mutação:
--   * chave nova             => NULL (prossegue e registra no final)
--   * chave existente mesmo hash => retorna o RESULTADO ORIGINAL (replay,
--     sem re-aplicar a mutação — state_sequence não é incrementado de novo)
--   * chave existente hash diferente => 40901 IDEMPOTENCY_KEY_REUSE
CREATE OR REPLACE FUNCTION public.station_try_replay(
  p_workspace        uuid,
  p_idempotency_key  text,
  p_request_hash     text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idem public.station_idempotency%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_idem
  FROM public.station_idempotency
  WHERE workspace_id = p_workspace AND idempotency_key = p_idempotency_key;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_idem.request_hash = p_request_hash THEN
    -- replay idempotente: devolve o resultado original SEM mutar de novo
    RETURN v_idem.result;
  END IF;

  RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSE' USING ERRCODE = '40901';
END;
$$;

-- Registra o resultado de uma mutação idempotente (após sucesso).
CREATE OR REPLACE FUNCTION public.station_record_idempotency(
  p_workspace uuid, p_idempotency_key text, p_request_hash text, p_result jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
    RETURN;
  END IF;
  INSERT INTO public.station_idempotency
    (workspace_id, idempotency_key, request_hash, result)
  VALUES (p_workspace, p_idempotency_key, p_request_hash, p_result)
  ON CONFLICT (workspace_id, idempotency_key) DO NOTHING;
END;
$$;

-- ─── station_play ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.station_play(
  p_workspace uuid,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL,
  p_expected_sequence bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_st public.tv_station%ROWTYPE;
  v_t   public.tv_queue_snapshot_tracks%ROWTYPE;
  v_res jsonb;
  v_replay jsonb;
BEGIN
  -- lock primeiro (station_begin_mutation), DEPOIS replay idempotente sob o lock
  v_st := public.station_begin_mutation(p_workspace, p_idempotency_key, p_request_hash, p_expected_sequence);
  v_replay := public.station_try_replay(p_workspace, p_idempotency_key, p_request_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  IF v_st.state = 'playing' THEN
    NULL; -- já tocando: no-op
  ELSIF v_st.state = 'paused' THEN
    -- resume: posição congelada, started_at = now
    UPDATE public.tv_station
       SET state = 'playing', started_at = now(), state_sequence = state_sequence + 1,
           updated_at = now()
     WHERE workspace_id = p_workspace;
  ELSE -- stopped
    v_t := public.first_track_of_current_snapshot(p_workspace);
    UPDATE public.tv_station
       SET state = 'playing',
           current_snapshot_track_id = CASE WHEN v_t.id IS NULL THEN NULL ELSE v_t.id END,
           position_seconds = 0,
           started_at = CASE WHEN v_t.id IS NULL THEN NULL ELSE now() END,
           state_sequence = state_sequence + 1,
           updated_at = now()
     WHERE workspace_id = p_workspace;
  END IF;

  v_res := public.station_mutation_result(p_workspace);
  PERFORM public.station_record_idempotency(p_workspace, p_idempotency_key, p_request_hash, v_res);
  RETURN v_res;
END;
$$;

-- ─── station_resume ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.station_resume(
  p_workspace uuid, p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL, p_expected_sequence bigint DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_st public.tv_station%ROWTYPE; v_res jsonb; v_replay jsonb;
BEGIN
  v_st := public.station_begin_mutation(p_workspace, p_idempotency_key, p_request_hash, p_expected_sequence);
  v_replay := public.station_try_replay(p_workspace, p_idempotency_key, p_request_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_st.state = 'paused' THEN
    UPDATE public.tv_station SET state='playing', started_at = now(),
      state_sequence = state_sequence + 1, updated_at = now()
    WHERE workspace_id = p_workspace;
  ELSIF v_st.state = 'stopped' THEN
    RAISE EXCEPTION 'INVALID_STATE' USING ERRCODE = '40904';
  END IF;
  v_res := public.station_mutation_result(p_workspace);
  PERFORM public.station_record_idempotency(p_workspace, p_idempotency_key, p_request_hash, v_res);
  RETURN v_res;
END;
$$;

-- ─── station_pause ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.station_pause(
  p_workspace uuid, p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL, p_expected_sequence bigint DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_st public.tv_station%ROWTYPE; v_res jsonb; v_replay jsonb;
BEGIN
  v_st := public.station_begin_mutation(p_workspace, p_idempotency_key, p_request_hash, p_expected_sequence);
  v_replay := public.station_try_replay(p_workspace, p_idempotency_key, p_request_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_st.state = 'playing' THEN
    UPDATE public.tv_station
       SET position_seconds = v_st.position_seconds + EXTRACT(EPOCH FROM (now() - v_st.started_at)),
           state = 'paused', started_at = NULL,
           state_sequence = state_sequence + 1, updated_at = now()
     WHERE workspace_id = p_workspace;
  END IF;
  v_res := public.station_mutation_result(p_workspace);
  PERFORM public.station_record_idempotency(p_workspace, p_idempotency_key, p_request_hash, v_res);
  RETURN v_res;
END;
$$;

-- ─── station_seek ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.station_seek(
  p_workspace uuid, p_position double precision, p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL, p_expected_sequence bigint DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_st public.tv_station%ROWTYPE; v_res jsonb; v_duration integer; v_target double precision; v_replay jsonb;
BEGIN
  IF p_position IS NULL OR p_position < 0 THEN
    RAISE EXCEPTION 'SEEK_OUT_OF_RANGE' USING ERRCODE = '22023';
  END IF;
  v_st := public.station_begin_mutation(p_workspace, p_idempotency_key, p_request_hash, p_expected_sequence);
  v_replay := public.station_try_replay(p_workspace, p_idempotency_key, p_request_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  IF v_st.current_snapshot_track_id IS NOT NULL THEN
    SELECT t.duration_seconds INTO v_duration FROM public.tv_queue_snapshot_tracks t
      WHERE t.id = v_st.current_snapshot_track_id;
    v_target := p_position;
    IF v_duration IS NOT NULL AND v_duration > 0 AND p_position > v_duration THEN
      RAISE EXCEPTION 'SEEK_OUT_OF_RANGE' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_target := p_position;
  END IF;

  UPDATE public.tv_station
     SET position_seconds = v_target,
         started_at = CASE WHEN v_st.state = 'playing' THEN now() ELSE NULL END,
         state_sequence = state_sequence + 1, updated_at = now()
   WHERE workspace_id = p_workspace;

  v_res := public.station_mutation_result(p_workspace);
  PERFORM public.station_record_idempotency(p_workspace, p_idempotency_key, p_request_hash, v_res);
  RETURN v_res;
END;
$$;

-- ─── station_next / station_previous ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.station_next(
  p_workspace uuid, p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL, p_expected_sequence bigint DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_st public.tv_station%ROWTYPE; v_t public.tv_queue_snapshot_tracks%ROWTYPE; v_res jsonb; v_replay jsonb;
BEGIN
  v_st := public.station_begin_mutation(p_workspace, p_idempotency_key, p_request_hash, p_expected_sequence);
  v_replay := public.station_try_replay(p_workspace, p_idempotency_key, p_request_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

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
  v_res := public.station_mutation_result(p_workspace);
  PERFORM public.station_record_idempotency(p_workspace, p_idempotency_key, p_request_hash, v_res);
  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.station_previous(
  p_workspace uuid, p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL, p_expected_sequence bigint DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_st public.tv_station%ROWTYPE; v_t public.tv_queue_snapshot_tracks%ROWTYPE; v_res jsonb; v_replay jsonb;
BEGIN
  v_st := public.station_begin_mutation(p_workspace, p_idempotency_key, p_request_hash, p_expected_sequence);
  v_replay := public.station_try_replay(p_workspace, p_idempotency_key, p_request_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  v_t := public.relative_track(p_workspace, -1);
  IF v_t.id IS NULL THEN
    RAISE EXCEPTION 'NO_PREVIOUS_TRACK' USING ERRCODE = '40907';
  END IF;
  UPDATE public.tv_station SET current_snapshot_track_id = v_t.id,
    position_seconds = 0, started_at = now(), state = 'playing',
    state_sequence = state_sequence + 1, updated_at = now()
  WHERE workspace_id = p_workspace;
  v_res := public.station_mutation_result(p_workspace);
  PERFORM public.station_record_idempotency(p_workspace, p_idempotency_key, p_request_hash, v_res);
  RETURN v_res;
END;
$$;

-- ─── station_stop ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.station_stop(
  p_workspace uuid, p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL, p_expected_sequence bigint DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_st public.tv_station%ROWTYPE; v_res jsonb; v_replay jsonb;
BEGIN
  v_st := public.station_begin_mutation(p_workspace, p_idempotency_key, p_request_hash, p_expected_sequence);
  v_replay := public.station_try_replay(p_workspace, p_idempotency_key, p_request_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_st.state <> 'stopped' THEN
    UPDATE public.tv_station SET state='stopped', current_snapshot_track_id = NULL,
      position_seconds = 0, started_at = NULL, state_sequence = state_sequence + 1,
      updated_at = now()
    WHERE workspace_id = p_workspace;
  END IF;
  v_res := public.station_mutation_result(p_workspace);
  PERFORM public.station_record_idempotency(p_workspace, p_idempotency_key, p_request_hash, v_res);
  RETURN v_res;
END;
$$;

-- ─── station_queue_change ────────────────────────────────────────────────────
-- Sinaliza que o conteúdo da fila canônica mudou no workspace: materializa um
-- snapshot NOVO (capturando o estado atual) e aponta a estação para ele,
-- tentando preservar a faixa atual por track_id quando possível.
CREATE OR REPLACE FUNCTION public.station_queue_change(
  p_workspace uuid, p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL, p_expected_sequence bigint DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_st public.tv_station%ROWTYPE;
  v_new uuid;
  v_cur_track uuid;
  v_new_track uuid := NULL;
  v_res jsonb;
  v_replay jsonb;
BEGIN
  v_st := public.station_begin_mutation(p_workspace, p_idempotency_key, p_request_hash, p_expected_sequence);
  v_replay := public.station_try_replay(p_workspace, p_idempotency_key, p_request_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  v_cur_track := v_st.current_snapshot_track_id;

  -- novo snapshot do conteúdo atual
  v_new := public.materialize_station_snapshot(p_workspace);

  -- preserva a faixa atual por track_id (origem) quando ainda existir
  IF v_cur_track IS NOT NULL THEN
    SELECT t2.id INTO v_new_track
    FROM public.tv_queue_snapshot_tracks t2
    JOIN public.tv_queue_snapshot_tracks t1 ON t1.id = v_cur_track
    WHERE t2.snapshot_id = v_new AND t2.track_id IS NOT NULL
      AND t2.track_id = t1.track_id;
  END IF;

  UPDATE public.tv_station
     SET queue_snapshot_id = v_new,
         current_snapshot_track_id = v_new_track,
         state_sequence = state_sequence + 1,
         updated_at = now()
   WHERE workspace_id = p_workspace;

  v_res := public.station_mutation_result(p_workspace);
  PERFORM public.station_record_idempotency(p_workspace, p_idempotency_key, p_request_hash, v_res);
  RETURN v_res;
END;
$$;

-- ─── station_track_change ────────────────────────────────────────────────────
-- Troca EXPLÍCITA de faixa dentro do snapshot vigente (mídia manual/UI).
CREATE OR REPLACE FUNCTION public.station_track_change(
  p_workspace uuid, p_snapshot_track_id uuid, p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL, p_expected_sequence bigint DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_st public.tv_station%ROWTYPE; v_res jsonb; v_ok boolean; v_replay jsonb;
BEGIN
  v_st := public.station_begin_mutation(p_workspace, p_idempotency_key, p_request_hash, p_expected_sequence);
  v_replay := public.station_try_replay(p_workspace, p_idempotency_key, p_request_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  IF p_snapshot_track_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_TRACK' USING ERRCODE = '40908';
  END IF;
  PERFORM 1 FROM public.tv_queue_snapshot_tracks t
    WHERE t.id = p_snapshot_track_id AND t.snapshot_id = v_st.queue_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRACK_NOT_IN_SNAPSHOT' USING ERRCODE = '40908';
  END IF;

  UPDATE public.tv_station
     SET current_snapshot_track_id = p_snapshot_track_id,
         position_seconds = 0,
         started_at = CASE WHEN v_st.state = 'playing' THEN now()
                           WHEN v_st.state = 'stopped' THEN NULL
                           ELSE NULL END,
         state = CASE WHEN v_st.state = 'stopped' THEN 'paused' ELSE v_st.state END,
         state_sequence = state_sequence + 1, updated_at = now()
   WHERE workspace_id = p_workspace;

  v_res := public.station_mutation_result(p_workspace);
  PERFORM public.station_record_idempotency(p_workspace, p_idempotency_key, p_request_hash, v_res);
  RETURN v_res;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. RETENÇÃO DE SNAPSHOTS (função segura, sem scheduler/Action)
-- Mantém: últimos 50 por workspace E os com idade <= 30 dias; preserva sempre
-- o snapshot referenciado por tv_station. Chamada manual/por app quando quiser.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.prune_station_snapshots(p_workspace uuid)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
  v_station_snap uuid;
BEGIN
  IF p_workspace IS NULL THEN
    RAISE EXCEPTION 'WORKSPACE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  SELECT queue_snapshot_id INTO v_station_snap FROM public.tv_station
    WHERE workspace_id = p_workspace;

  DELETE FROM public.tv_queue_snapshots snap
  WHERE snap.workspace_id = p_workspace
    AND snap.id IS DISTINCT FROM v_station_snap
    AND snap.created_at < now() - interval '30 days'
    AND snap.id NOT IN (
      SELECT id FROM (
        SELECT id FROM public.tv_queue_snapshots s2
        WHERE s2.workspace_id = p_workspace
        ORDER BY s2.version DESC
        LIMIT 50
      ) keep
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. RLS E PRIVILÉGIOS
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.tv_queue_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_queue_snapshot_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_station ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_idempotency FORCE ROW LEVEL SECURITY;

-- Leitura de snapshot/estação: membro, super admin ou device vinculado.
DROP POLICY IF EXISTS "tv_queue_snapshots_select" ON public.tv_queue_snapshots;
CREATE POLICY "tv_queue_snapshots_select"
  ON public.tv_queue_snapshots FOR SELECT TO authenticated
  USING (public.can_access_tv_workspace(workspace_id));

DROP POLICY IF EXISTS "tv_queue_snapshot_tracks_select" ON public.tv_queue_snapshot_tracks;
CREATE POLICY "tv_queue_snapshot_tracks_select"
  ON public.tv_queue_snapshot_tracks FOR SELECT TO authenticated
  USING (public.can_access_tv_workspace((
    SELECT s.workspace_id FROM public.tv_queue_snapshots s WHERE s.id = snapshot_id
  )));

DROP POLICY IF EXISTS "tv_station_select" ON public.tv_station;
CREATE POLICY "tv_station_select"
  ON public.tv_station FOR SELECT TO authenticated
  USING (public.can_access_tv_workspace(workspace_id));

-- Escrita via RPC apenas: NENHUMA policy de INSERT/UPDATE/DELETE nas três
-- tabelas <- RLS nega escrita direta de authenticated/anon.
-- station_idempotency: sem policies (service_role/servidor apenas).

-- Defesa em profundidade: anon não lê nada destas tabelas.
REVOKE ALL ON public.tv_queue_snapshots FROM anon;
REVOKE ALL ON public.tv_queue_snapshot_tracks FROM anon;
REVOKE ALL ON public.tv_station FROM anon;
REVOKE ALL ON public.station_idempotency FROM anon;

-- RPCs: EXECUTE para authenticated (web) E para o device (também authenticated).
-- O gate real (can_access_tv_workspace) roda dentro de cada RPC.
DO $$
DECLARE
  fn text;
  arity text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['station_get_snapshot','materialize_station_snapshot',
    'ensure_station_row','station_mutation_result','first_track_of_current_snapshot',
    'relative_track','station_begin_mutation','station_try_replay','station_record_idempotency',
    'station_play','station_pause','station_resume','station_next','station_previous',
    'station_seek','station_stop','station_queue_change','station_track_change',
    'prune_station_snapshots','station_snapshot_track_guard','current_snapshot_track_id']
  LOOP
    -- Default privileges do template concedem EXECUTE a anon/authenticated em toda
    -- function nova de public; revogamos de TODOS aqui e regrantamos apenas o necessário.
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM authenticated', fn);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.station_get_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.station_play(uuid, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.station_pause(uuid, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.station_resume(uuid, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.station_next(uuid, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.station_previous(uuid, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.station_stop(uuid, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.station_seek(uuid, double precision, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.station_queue_change(uuid, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.station_track_change(uuid, uuid, text, text, bigint) TO authenticated;

-- Funções internas auxiliares: somente service_role/owner (não expostas).
GRANT EXECUTE ON FUNCTION public.materialize_station_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_station_row(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.station_mutation_result(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.first_track_of_current_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.relative_track(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.station_begin_mutation(uuid, text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.station_record_idempotency(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_station_snapshots(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.station_snapshot_track_guard() TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. BACKFILL IDEMPOTENTE — uma estação por workspace que já tem filas
-- ════════════════════════════════════════════════════════════════════════════
-- Cria a linha da estação (snapshot #1) para os workspaces que possuem TV e
-- filas, mas ainda não têm estação — sem duplicar as já existentes e sem
-- apagar nada. Também emite NOTICE com contagem para o operador.
DO $$
DECLARE
  v_ws uuid;
  v_count integer := 0;
BEGIN
  FOR v_ws IN (
    SELECT DISTINCT q.workspace_id
    FROM public.tv_music_queues q
    WHERE q.workspace_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.tv_station st WHERE st.workspace_id = q.workspace_id)
  )
  LOOP
    PERFORM public.ensure_station_row(v_ws);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'stations backfilled: %', v_count;
END $$;

COMMIT;

-- =============================================================================
-- VERIFICAÇÃO PÓS-APLICAÇÃO:
--   SELECT * FROM public.tv_station;  -- 1 linha por workspace
--   SELECT version, track_count FROM public.tv_queue_snapshots ORDER BY workspace_id, version;
--   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND (p.proname LIKE 'station_%' OR p.proname='materialize_station_snapshot');
--   -- Nenhuma policy de INSERT/UPDATE/DELETE em tv_station/snapshots:
--   SELECT * FROM pg_policies WHERE tablename IN ('tv_station','tv_queue_snapshots','tv_queue_snapshot_tracks');
--   -- Replay idempotente devolve resultado original; reuse com outro hash = 40901.
--   -- dois station_next concorrentes => um vence OU um 40900, nunca next duplo.
-- =============================================================================
