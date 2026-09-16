-- ===============================================================================
-- 064 — ROTA RESERVALAB → TV: horários por dia, vínculo com a reserva, arquivamento
-- ===============================================================================
-- Conexão ReservaLab → tv_events → tv_schedules → resolver (Issue #222, FASE 2.2):
--
--   ReservaLab (dados da reserva via /api/reservas)
--      ↓
--   tv_reserve_event_upsert  (RPC atômico, SECURITY DEFINER)
--      ↓
--   tv_events  (conteúdo ÚNICO: 1 reserva → 1 evento, via reservation_id + UNIQUE)
--      ↓
--   tv_schedules  (programação; vínculo principal = tv_schedules.event_id → tv_events.id)
--      ├── tv_schedule_days
--      │    └── data da reserva (is_reservation_day = true) + horário específico
--      │    └── datas adicionais (is_reservation_day = false, horário NULL)
--      └── tv_schedule_targets  (1..N TVs, todas do MESMO workspace)
--      ↓
--   tv_resolve_scheduled_content(workspace, device, date, time)
--      ↓
--   TV / Electron
--
-- Concepção (validada na FASE 2.1 / Issue #222):
--   * Não duplicar tv_events por TV ou por data. reservation_id (text, derivado)
--     + UNIQUE parcial (workspace_id, reservation_id) garantem 1 evento por reserva.
--   * A data original da reserva é obrigatória (RPC exige p_reservation_date).
--   * A data da reserva PODE ter time_start/time_end específicos (horário local do
--     campus). Datas adicionais NÃO herdam o horário (CHECK exige NULL fora do dia
--     da reserva).
--   * 1 evento → 1..N TVs (tv_schedule_targets) ou TODAS as TVs (target_scope='all').
--   * Cross-workspace é impossível: workspace_id vem do RPC (gate tv_can_manage_workspace),
--     o trigger tv_schedule_target_guard (062) valida device ∈ workspace e o resolver
--     impõe device ∈ workspace de entrada.
--   * Legado (tv_events direto, is_active) NÃO quebra: fallback legado do resolver
--     mantém eventos com start_date/end_date NULL = sempre ativos enquanto is_active.
--   * archived (boolean) é estado ADMINISTRATIVO persistido em tv_events. Os estados
--     scheduled/active/expired são DERIVADOS (resposta do resolver) — não há coluna
--     de status redundante (regra 11).
--
-- Decisões aprovadas:
--   * IDENTIFICADOR DA RESERVA: a planilha NÃO possui ID estável (colunas: Reserva
--     feita por, Professor, Email, Data, Horário, Alunos, Obs, Lab). reservation_id
--     é chave determinística (md5) dos campos disponíveis, derivada NO BACKEND
--     (_reservation_key em src/apps/reservalab/api/app.py): data + labs normalizados
--     + horário normalizado (minutos) + responsável + email + reserva_feita_por.
--     O escopo por campus é no banco via UNIQUE(workspace_id, reservation_id).
--   * TIMEZONE: reservas/horários são LOCAIS do campus (America/Sao_Paulo). O dia usa
--     `date` e o horário usa `time` SEM timezone (convenção local). O resolver 4-arg
--     fixa SET timezone = 'America/Sao_Paulo' para que a conversão legada
--     timestamptz → data seja determinística e idêntica à da API (get_now_sp).
--     NENHUMA conversão UTC é introduzida entre banco, ReservaLab e player.
--   * ESTADO: somente `archived` é persistido; scheduled/active/expired são derivados
--     da programação na hora da consulta.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS /
-- DROP CONSTRAINT IF EXISTS + ADD / CREATE OR REPLACE FUNCTION / DROP TRIGGER IF EXISTS.
-- NÃO altera 062 nem 063 (migrations já aplicadas em PROD): resolver novo é OVERLOAD
-- de 4 args; o resolver 3-arg (063) permanece intacto.
-- ===============================================================================

-- ===============================================================================
-- 1) tv_events: vínculo com a reserva + estado administrativo `archived`
-- ===============================================================================
ALTER TABLE public.tv_events
  ADD COLUMN IF NOT EXISTS reservation_id text;
COMMENT ON COLUMN public.tv_events.reservation_id IS
  'Chave determinística da reserva de origem (md5 dos campos da planilha; ver _reservation_key na API). Sem ID estável na fonte. NULL = evento não-reserva (legado/administrativo). Escopo por campus via UNIQUE(workspace_id, reservation_id).';

ALTER TABLE public.tv_events
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.tv_events.archived IS
  'Estado administrativo persistido (regra 11). scheduled/active/expired são derivados no resolver. archived=true remove o evento da programação ativa (resolver filtra) mantendo o registro p/ histórico/auditoria.';

-- 1 reserva → 1 evento por campus (regra 1: não duplicar conteúdo).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tv_events_workspace_reservation
  ON public.tv_events(workspace_id, reservation_id)
  WHERE reservation_id IS NOT NULL;

-- ===============================================================================
-- 2) tv_schedule_days: horário específico (dia da reserva) + marcação do dia
-- ===============================================================================
ALTER TABLE public.tv_schedule_days
  ADD COLUMN IF NOT EXISTS time_start time;
ALTER TABLE public.tv_schedule_days
  ADD COLUMN IF NOT EXISTS time_end time;
ALTER TABLE public.tv_schedule_days
  ADD COLUMN IF NOT EXISTS is_reservation_day boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tv_schedule_days.time_start IS
  'Início do intervalo local do campus (time SEM timezone; America/Sao_Paulo). Somente na data da reserva (is_reservation_day=true). NULL = programação configurada (sem horário especial).';
COMMENT ON COLUMN public.tv_schedule_days.time_end IS
  'Fim do intervalo local do campus (time SEM timezone). NULL junto de time_start.';
COMMENT ON COLUMN public.tv_schedule_days.is_reservation_day IS
  'true => dia ORIGINAL da reserva (obrigatório, único por schedule — UNIQUE parcial). Pode carregar time_start/time_end; datas adicionais são is_reservation_day=false com horário NULL.';

-- Invariantes:
--   * time_start e time_end vêm juntos (ambos NULL ou ambos preenchidos)
ALTER TABLE public.tv_schedule_days
  DROP CONSTRAINT IF EXISTS chk_tv_schedule_days_time_set;
ALTER TABLE public.tv_schedule_days
  ADD CONSTRAINT chk_tv_schedule_days_time_set
  CHECK ( (time_start IS NULL) = (time_end IS NULL) );

--   * time_start <= time_end (regra 13)
ALTER TABLE public.tv_schedule_days
  DROP CONSTRAINT IF EXISTS chk_tv_schedule_days_time_order;
ALTER TABLE public.tv_schedule_days
  ADD CONSTRAINT chk_tv_schedule_days_time_order
  CHECK ( time_start IS NULL OR time_start <= time_end );

--   * horário específico SOMENTE na data da reserva; datas adicionais exigem NULL
ALTER TABLE public.tv_schedule_days
  DROP CONSTRAINT IF EXISTS chk_tv_schedule_days_time_reservation;
ALTER TABLE public.tv_schedule_days
  ADD CONSTRAINT chk_tv_schedule_days_time_reservation
  CHECK ( time_start IS NULL OR is_reservation_day );

--   * no MÁXIMO uma data da reserva por schedule (única data original)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tv_schedule_days_single_reservation
  ON public.tv_schedule_days(schedule_id)
  WHERE is_reservation_day;

-- ===============================================================================
-- 3) Resolver 4-arg (OVERLOAD, não altera o de 063): workspace + device + date + time
-- ===============================================================================
CREATE OR REPLACE FUNCTION public.tv_resolve_scheduled_content(
  p_workspace_id uuid,
  p_device_id    uuid,
  p_date         date,
  p_time         time
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET timezone = 'America/Sao_Paulo'
AS $$
DECLARE
  v_event_id  uuid;
  v_schedule  uuid;
  v_origin    text;
BEGIN
  -- Guarda 0: entradas obrigatorias (sem NULL -> 0 linhas, sem erro indevido)
  IF p_workspace_id IS NULL OR p_device_id IS NULL OR p_date IS NULL THEN
    RETURN NULL;
  END IF;

  -- Guarda 1: gate de LEITURA do workspace (canonico; p/ authenticated e device)
  IF NOT public.can_access_tv_workspace(p_workspace_id) THEN
    RETURN NULL;
  END IF;

  -- Guarda 2: isolamento do device — device DEVE pertencer ao workspace de entrada
  IF NOT EXISTS (
    SELECT 1 FROM public.tv_devices d
     WHERE d.id = p_device_id
       AND d.workspace_id = p_workspace_id
  ) THEN
    RETURN NULL;
  END IF;

  -- ---------------------------------------------------------------------------
  -- [1] PROGRAMACAO NOVA (precedencia absoluta)
  --   * day com horário específico (dia da reserva) => exige time dentro de
  --     [time_start, time_end]; demais datas => programação configurada (sem
  --     restrição de horário); p_time NULL => ignora restrição de horário.
  --   * evento arquivado (archived) nunca resolve.
  -- ---------------------------------------------------------------------------
  SELECT s.event_id, s.id
    INTO v_event_id, v_schedule
    FROM public.tv_schedules s
   WHERE s.workspace_id = p_workspace_id
     AND s.is_active
     AND s.starts_on <= p_date
     AND s.ends_on   >= p_date
     AND (
          s.schedule_mode = 'every_day'
          OR EXISTS (
              SELECT 1 FROM public.tv_schedule_days d
               WHERE d.schedule_id = s.id
                 AND d.date = p_date
          )
     )
     AND (
          s.target_scope = 'all'
          OR EXISTS (
              SELECT 1 FROM public.tv_schedule_targets t
               WHERE t.schedule_id = s.id
                 AND t.device_id = p_device_id
          )
     )
     AND (
          p_time IS NULL
          OR NOT EXISTS (
              SELECT 1 FROM public.tv_schedule_days d
               WHERE d.schedule_id = s.id
                 AND d.date = p_date
                 AND d.time_start IS NOT NULL
          )
          OR EXISTS (
              SELECT 1 FROM public.tv_schedule_days d
               WHERE d.schedule_id = s.id
                 AND d.date = p_date
                 AND d.time_start IS NOT NULL
                 AND p_time      >= d.time_start
                 AND p_time      <= d.time_end
          )
     )
     AND EXISTS (
          SELECT 1 FROM public.tv_events ev
           WHERE ev.id = s.event_id
             AND NOT COALESCE(ev.archived, false)
     )
   ORDER BY s.sort_order DESC, s.starts_on ASC, s.id ASC
   LIMIT 1;

  IF FOUND THEN
    v_origin := 'scheduled';
    RETURN jsonb_build_object(
      'event_id',     v_event_id,
      'schedule_id',  v_schedule,
      'workspace_id', p_workspace_id,
      'device_id',    p_device_id,
      'date',         p_date,
      'origin',       v_origin
    );
  END IF;

  -- ---------------------------------------------------------------------------
  -- [2] FALLBACK LEGADO (somente quando NENHUMA nova schedule se aplica)
  --   * events com start_date/end_date NULL = SEMPRE ativos enquanto is_active
  --     (regra 10: eventos legados/atuais com datas NULL não podem sumir).
  --   * events com intervalo = resolvidos por data (timezone fixa no function).
  --   * device_id IS NULL = todas as TVs do workspace.
  -- ---------------------------------------------------------------------------
  SELECT e.id
    INTO v_event_id
    FROM public.tv_events e
   WHERE e.workspace_id = p_workspace_id
     AND e.is_active
     AND NOT COALESCE(e.archived, false)
     AND ( e.start_date IS NULL OR p_date >= e.start_date::date )
     AND ( e.end_date   IS NULL OR p_date <= e.end_date::date )
     AND ( e.device_id IS NULL OR e.device_id = p_device_id )
   ORDER BY e.sort_order DESC, e.start_date ASC, e.id ASC
   LIMIT 1;

  IF FOUND THEN
    v_origin := 'legacy';
    RETURN jsonb_build_object(
      'event_id',     v_event_id,
      'schedule_id',  NULL,
      'workspace_id', p_workspace_id,
      'device_id',    p_device_id,
      'date',         p_date,
      'origin',       v_origin
    );
  END IF;

  -- [3] Nenhum conteudo aplicavel -> 0 linhas, SEM erro.
  RETURN NULL;
END;
$$;

-- Exposicao: somente READ path (EXECUTE p/ authenticated — device session inclui).
REVOKE ALL ON FUNCTION public.tv_resolve_scheduled_content(uuid, uuid, date, time) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tv_resolve_scheduled_content(uuid, uuid, date, time) TO authenticated;

-- ===============================================================================
-- 4) RPC atômico de escrita do fluxo ReservaLab (única rota; device NUNCA usa)
-- ===============================================================================
CREATE OR REPLACE FUNCTION public.tv_reserve_event_upsert(
  p_workspace_id            uuid,
  p_reservation_date        date,
  p_title                   text,
  p_description             text DEFAULT NULL,
  p_image_url               text DEFAULT NULL,
  p_pdf_url                 text DEFAULT NULL,
  p_reservation_id          text DEFAULT NULL,
  p_reservation_time_start  time DEFAULT NULL,
  p_reservation_time_end    time DEFAULT NULL,
  p_additional_dates        date[] DEFAULT NULL,
  p_target_device_ids       uuid[] DEFAULT NULL,
  p_event_id                uuid DEFAULT NULL,
  p_sort_order              integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_sid      uuid;
  v_scope    text;
  v_devs     uuid[] := '{}';
  v_extra    date[] := '{}';
  v_end      date;
  v_bad_dev  integer;
  v_existing uuid;
BEGIN
  -- Regra 15: device (kiosk) NUNCA escreve via RPC (device session é authenticated,
  -- então a negação é EXPLÍCITA aqui; defesa em profundidade além de tv_can_manage).
  IF (auth.jwt() -> 'user_metadata') ->> 'role' = 'tv_device' THEN
    RAISE EXCEPTION 'TV_DEVICE_WRITE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- RBAC/RBAC 2.0: escrita exige nível `full` do app TV no workspace (059).
  IF NOT public.tv_can_manage_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'TV_WORKSPACE_FULL_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Regra 2: data da reserva é obrigatória.
  IF p_reservation_date IS NULL THEN
    RAISE EXCEPTION 'RESERVATION_DATE_REQUIRED' USING ERRCODE = '23502';
  END IF;

  -- Regra 3/13: horário da reserva — ambos ou nenhum; início <= fim.
  IF (p_reservation_time_start IS NULL) <> (p_reservation_time_end IS NULL) THEN
    RAISE EXCEPTION 'INVALID_RESERVATION_TIMES' USING ERRCODE = '23514';
  END IF;
  IF p_reservation_time_start IS NOT NULL
     AND p_reservation_time_start > p_reservation_time_end THEN
    RAISE EXCEPTION 'RESERVATION_TIME_AFTER_END' USING ERRCODE = '23514';
  END IF;

  -- Regras 4/5/6/8: TVs alvo — deduplica e exige que TODAS pertençam ao workspace.
  IF p_target_device_ids IS NOT NULL AND array_length(p_target_device_ids, 1) > 0 THEN
    IF EXISTS (SELECT 1 FROM unnest(p_target_device_ids) u(did) WHERE u.did IS NULL) THEN
      RAISE EXCEPTION 'NULL_DEVICE_ID' USING ERRCODE = '23502';
    END IF;
    SELECT COALESCE(array_agg(DISTINCT did), '{}')
      INTO v_devs
      FROM unnest(p_target_device_ids) u(did);
    SELECT count(*) INTO v_bad_dev
      FROM unnest(v_devs) u(did)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.tv_devices d
        WHERE d.id = u.did AND d.workspace_id = p_workspace_id
     );
    IF v_bad_dev > 0 THEN
      RAISE EXCEPTION 'DEVICE_WORKSPACE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    v_scope := 'specific';
  ELSE
    v_scope := 'all';
  END IF;

  -- Regras 4/5: datas adicionais (opcionais, sem horário; nunca antes da data da reserva).
  IF p_additional_dates IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT d ORDER BY d), '{}')
      INTO v_extra
      FROM unnest(p_additional_dates) a(d)
     WHERE a.d IS NOT NULL AND a.d <> p_reservation_date;
    IF EXISTS (SELECT 1 FROM unnest(v_extra) u2(d) WHERE u2.d < p_reservation_date) THEN
      RAISE EXCEPTION 'ADDITIONAL_DATE_BEFORE_RESERVATION' USING ERRCODE = '23514';
    END IF;
  END IF;

  v_end := p_reservation_date;
  IF cardinality(v_extra) > 0 THEN
    SELECT max(d) INTO v_end FROM unnest(v_extra) t(d);
  END IF;

  -- Regra 1: conteúdo ÚNICO — reusa o evento da mesma reserva (idempotência);
  -- senão, atualiza p_event_id explícito; senão, cria evento novo.
  IF p_reservation_id IS NOT NULL THEN
    SELECT e.id INTO v_existing
      FROM public.tv_events e
     WHERE e.workspace_id = p_workspace_id
       AND e.reservation_id = p_reservation_id
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
      p_event_id := v_existing;
    END IF;
  END IF;

  IF p_event_id IS NULL THEN
    INSERT INTO public.tv_events (id, workspace_id, title, description, image_url, pdf_url,
                                  is_active, sort_order, reservation_id)
    VALUES (gen_random_uuid(), p_workspace_id, p_title, p_description, p_image_url, p_pdf_url,
            true, p_sort_order, p_reservation_id)
    RETURNING id INTO v_event_id;
  ELSE
    UPDATE public.tv_events
       SET title         = p_title,
           description   = p_description,
           image_url     = p_image_url,
           pdf_url       = p_pdf_url,
           sort_order    = p_sort_order,
           reservation_id = COALESCE(reservation_id, p_reservation_id)
     WHERE id = p_event_id
       AND workspace_id = p_workspace_id
     RETURNING id INTO v_event_id;
    IF v_event_id IS NULL THEN
      RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = '23503';
    END IF;
  END IF;

  -- Schedule: reusa o schedule do evento cujo DIA DA RESERVA bate com o informado
  -- (evita replicar schedule da mesma reserva a cada submit); senão, cria novo.
  SELECT s.id INTO v_sid
    FROM public.tv_schedules s
   WHERE s.workspace_id = p_workspace_id
     AND s.event_id = v_event_id
     AND EXISTS (
       SELECT 1 FROM public.tv_schedule_days d
        WHERE d.schedule_id = s.id
          AND d.date = p_reservation_date
          AND d.is_reservation_day
     )
   ORDER BY s.created_at
   LIMIT 1;

  IF v_sid IS NULL THEN
    INSERT INTO public.tv_schedules (id, workspace_id, event_id, starts_on, ends_on,
                                     schedule_mode, target_scope, is_active, sort_order)
    VALUES (gen_random_uuid(), p_workspace_id, v_event_id,
            p_reservation_date, v_end, 'specific_days', v_scope, true, p_sort_order)
    RETURNING id INTO v_sid;
  ELSE
    UPDATE public.tv_schedules
       SET ends_on = v_end, target_scope = v_scope, is_active = true
     WHERE id = v_sid;
  END IF;

  -- Dias: data da reserva (is_reservation_day + horário opcional) + adicionais (sem horário).
  DELETE FROM public.tv_schedule_days WHERE schedule_id = v_sid;
  INSERT INTO public.tv_schedule_days (schedule_id, date, time_start, time_end, is_reservation_day)
  VALUES (v_sid, p_reservation_date, p_reservation_time_start, p_reservation_time_end, true);
  IF cardinality(v_extra) > 0 THEN
    INSERT INTO public.tv_schedule_days (schedule_id, date)
    SELECT v_sid, d FROM unnest(v_extra) t(d);
  END IF;

  -- Targets: TV(s) escolhida(s) — guard tv_schedule_target_guard (062) reforça o workspace.
  DELETE FROM public.tv_schedule_targets WHERE schedule_id = v_sid;
  IF v_scope = 'specific' THEN
    INSERT INTO public.tv_schedule_targets (schedule_id, device_id)
    SELECT v_sid, dev FROM unnest(v_devs) dev;
  END IF;

  RETURN jsonb_build_object(
    'event_id',         v_event_id,
    'schedule_id',      v_sid,
    'reservation_date', p_reservation_date,
    'target_scope',     v_scope,
    'device_count',     cardinality(v_devs)
  );
END;
$$;

-- Acesso: SOMENTE authenticated (humano full by gate). anon/public: nada.
REVOKE ALL ON FUNCTION public.tv_reserve_event_upsert(uuid, date, text, text, text, text,
                                                      text, time, time, date[], uuid[], uuid, integer)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tv_reserve_event_upsert(uuid, date, text, text, text, text,
                                                         text, time, time, date[], uuid[], uuid, integer)
  TO authenticated;

-- ===============================================================================
-- VERIFICAÇÃO PÓS-MIGRATION (auditoria read-only; NÃO executa aqui):
--   SELECT prosrc LIKE '%tv_device%'        FROM pg_proc ... tv_reserve_event_upsert;
--   SELECT conname FROM pg_constraint WHERE conrelid='tv_schedule_days'::regclass;
--   -- chk_tv_schedule_days_time_set / time_order / time_reservation
--   SELECT indexname FROM pg_indexes WHERE tablename IN ('tv_events','tv_schedule_days');
--   -- uq_tv_events_workspace_reservation / uq_tv_schedule_days_single_reservation
--   SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc
--    WHERE proname IN ('tv_resolve_scheduled_content','tv_reserve_event_upsert');
--   -- resolver: 2 overloads (3-arg 063 intacto + 4-arg novo)
-- ===============================================================================