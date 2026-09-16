-- ===============================================================================
-- 062 — PROGRAMAcAO DE CONTEUDO NA TV (schedules + dias + targets)
-- ===============================================================================
-- Autoridade: o SERVIDOR/DB resolve QUEM ve o QUE e QUANDO. O Desktop nunca
-- mais decide "qual conteudo exibir" olhando apenas start_date/end_date.
--
-- Modelo normalizado (aprovado D1-D3):
--
--   tv_events (conteudo  UNICO; ja existe)
--        |
--        v
--   tv_schedules ----------------------> tv_schedule_days
--        |  (evento + intervalo + modo      (somente mode = 'specific_days';
--        |   + target_scope + workspace)     UNIQUE(schedule_id, date))
--        v
--   tv_schedule_targets
--        (somente target_scope = 'specific';
--         UNIQUE(schedule_id, device_id); device pertence ao MESMO workspace)
--
-- Semantica:
--   * uma schedule -> varias TVs (targets)  |  uma TV -> varias schedules
--   * uma schedule -> N dias especificos    |  uma TV -> varias schedules
--   * target_scope = 'all'  => TODAS as TVs do workspace (UMA linha, sem
--     materializar N linhas tv_schedule_targets)
--
-- Seguranca:
--   * workspace_id vem do contexto autorizado (gate RBAC), NUNCA do frontend.
--   * As unicas rotas de MUTAcAO sao os RPCs SECURITY DEFINER tv_schedule_*,
--     que validam tv_can_manage_workspace(workspace_id) e todas as invariantes.
--   * READ via RLS tv_can_access via can_access_tv_workspace(workspace_id).
--   * NENHUMA dependencia em tv_station/station_* — programacao e ortogonal.
-- ===============================================================================

-- ===============================================================================
-- 1) tv_schedules
-- ===============================================================================
CREATE TABLE IF NOT EXISTS public.tv_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id      uuid NOT NULL REFERENCES public.tv_events(id) ON DELETE CASCADE,
  starts_on     date NOT NULL,
  ends_on       date NOT NULL,
  schedule_mode text NOT NULL DEFAULT 'every_day'
                  CHECK (schedule_mode IN ('every_day', 'specific_days')),
  target_scope  text NOT NULL DEFAULT 'all'
                  CHECK (target_scope IN ('all', 'specific')),
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tv_schedules_interval_check CHECK (starts_on <= ends_on)
);

CREATE INDEX IF NOT EXISTS idx_tv_schedules_workspace_active
  ON public.tv_schedules(workspace_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_tv_schedules_event
  ON public.tv_schedules(event_id);

-- Guarda 1: o evento referenciado pertence ao MESMO workspace.
CREATE OR REPLACE FUNCTION public.tv_schedule_event_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ws uuid;
BEGIN
  SELECT e.workspace_id INTO v_ws FROM public.tv_events e WHERE e.id = NEW.event_id;
  IF v_ws IS NULL THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF v_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'EVENT_WORKSPACE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tv_schedule_event_guard ON public.tv_schedules;
CREATE TRIGGER trg_tv_schedule_event_guard
  BEFORE INSERT OR UPDATE OF event_id, workspace_id ON public.tv_schedules
  FOR EACH ROW EXECUTE FUNCTION public.tv_schedule_event_guard();

-- ===============================================================================
-- 2) tv_schedule_days (somente mode = 'specific_days')
-- ===============================================================================
CREATE TABLE IF NOT EXISTS public.tv_schedule_days (
  schedule_id   uuid NOT NULL REFERENCES public.tv_schedules(id) ON DELETE CASCADE,
  date          date NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schedule_id, date)
);

-- Guarda 3: dias so existem quando mode = 'specific_days' e dentro do intervalo.
CREATE OR REPLACE FUNCTION public.tv_schedule_day_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_st public.tv_schedules%ROWTYPE;
BEGIN
  SELECT * INTO v_st FROM public.tv_schedules s WHERE s.id = NEW.schedule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCHEDULE_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF v_st.schedule_mode <> 'specific_days' THEN
    RAISE EXCEPTION 'SCHEDULE_MODE_NOT_SPECIFIC_DAYS' USING ERRCODE = '23514';
  END IF;
  IF NEW.date < v_st.starts_on OR NEW.date > v_st.ends_on THEN
    RAISE EXCEPTION 'DAY_OUTSIDE_INTERVAL' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tv_schedule_day_guard ON public.tv_schedule_days;
CREATE TRIGGER trg_tv_schedule_day_guard
  BEFORE INSERT OR UPDATE OF schedule_id, date ON public.tv_schedule_days
  FOR EACH ROW EXECUTE FUNCTION public.tv_schedule_day_guard();

-- ===============================================================================
-- 3) tv_schedule_targets (somente target_scope = 'specific')
-- ===============================================================================
CREATE TABLE IF NOT EXISTS public.tv_schedule_targets (
  schedule_id   uuid NOT NULL REFERENCES public.tv_schedules(id) ON DELETE CASCADE,
  device_id     uuid NOT NULL REFERENCES public.tv_devices(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schedule_id, device_id)
);

-- Guarda 4: device pertence ao MESMO workspace (espelho do 055 event-device-guard).
CREATE OR REPLACE FUNCTION public.tv_schedule_target_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ws       uuid;
  v_scope    text;
BEGIN
  SELECT s.target_scope, s.workspace_id INTO v_scope, v_ws
    FROM public.tv_schedules s WHERE s.id = NEW.schedule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCHEDULE_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  -- Regra do briefing: 'all' nunca carrega targets.
  IF v_scope = 'all' THEN
    RAISE EXCEPTION 'TARGET_SCOPE_ALL_WITH_TARGETS' USING ERRCODE = '23514';
  END IF;

  SELECT d.workspace_id INTO v_ws
    FROM public.tv_devices d WHERE d.id = NEW.device_id;
  IF v_ws IS NULL THEN
    RAISE EXCEPTION 'DEVICE_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  SELECT s.workspace_id INTO v_ws FROM public.tv_schedules s WHERE s.id = NEW.schedule_id;
  SELECT d.workspace_id INTO v_ws
    FROM public.tv_devices d WHERE d.id = NEW.device_id;

  IF (SELECT s.workspace_id FROM public.tv_schedules s WHERE s.id = NEW.schedule_id)
     IS DISTINCT FROM
     (SELECT d.workspace_id FROM public.tv_devices d WHERE d.id = NEW.device_id) THEN
    RAISE EXCEPTION 'DEVICE_WORKSPACE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tv_schedule_target_guard ON public.tv_schedule_targets;
CREATE TRIGGER trg_tv_schedule_target_guard
  BEFORE INSERT OR UPDATE OF schedule_id, device_id ON public.tv_schedule_targets
  FOR EACH ROW EXECUTE FUNCTION public.tv_schedule_target_guard();

-- ===============================================================================
-- 4) RLS: READ (can_access_tv_workspace) vs FULL (tv_can_manage_workspace)
--    Nenhuma tabela de schedule e mutavel por escrita REST direta — so RPCs.
-- ===============================================================================
ALTER TABLE public.tv_schedules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_schedule_days  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_schedule_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tv_schedules_read" ON public.tv_schedules;
CREATE POLICY "tv_schedules_read" ON public.tv_schedules
  FOR SELECT TO authenticated
  USING (public.can_access_tv_workspace(workspace_id));

DROP POLICY IF EXISTS "tv_schedule_days_read" ON public.tv_schedule_days;
CREATE POLICY "tv_schedule_days_read" ON public.tv_schedule_days
  FOR SELECT TO authenticated
  USING (
    public.can_access_tv_workspace(
      (
        SELECT s.workspace_id
        FROM public.tv_schedules s
        WHERE s.id = schedule_id
      )
    )
  );

DROP POLICY IF EXISTS "tv_schedule_targets_read" ON public.tv_schedule_targets;
CREATE POLICY "tv_schedule_targets_read" ON public.tv_schedule_targets
  FOR SELECT TO authenticated
  USING (
    public.can_access_tv_workspace(
      (
        SELECT s.workspace_id
        FROM public.tv_schedules s
        WHERE s.id = schedule_id
      )
    )
  );

-- Sem INSERT/UPDATE/DELETE policies: unica mutacao via RPC SECURITY DEFINER.
-- (service_role faz bypass de RLS, mantendo o gate no RPC.)
REVOKE ALL ON public.tv_schedules, public.tv_schedule_days,
              public.tv_schedule_targets FROM anon, authenticated;
GRANT SELECT ON public.tv_schedules, public.tv_schedule_days,
              public.tv_schedule_targets TO authenticated;

-- ===============================================================================
-- 5) RPC de CRIACAO/EDICAO atomica (unica rota de mutacao; valida tudo server-side)
-- ===============================================================================
CREATE OR REPLACE FUNCTION public.tv_schedule_upsert(
  p_workspace_id uuid,
  p_event_id     uuid,
  p_starts_on    date,
  p_ends_on      date,
  p_mode         text,
  p_target_scope text,
  p_device_ids   uuid[],
  p_day_dates    date[],
  p_is_active    boolean DEFAULT true,
  p_sort_order   integer DEFAULT 0,
  p_schedule_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sid    uuid := COALESCE(p_schedule_id, gen_random_uuid());
  v_target bigint;
  BEGIN
  IF NOT public.tv_can_manage_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'TV_WORKSPACE_FULL_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_starts_on > p_ends_on THEN
    RAISE EXCEPTION 'INVALID_INTERVAL' USING ERRCODE = '23514';
  END IF;
  IF p_mode NOT IN ('every_day','specific_days') THEN
    RAISE EXCEPTION 'INVALID_MODE' USING ERRCODE = '23514';
  END IF;
  IF p_target_scope NOT IN ('all','specific') THEN
    RAISE EXCEPTION 'INVALID_TARGET_SCOPE' USING ERRCODE = '23514';
  END IF;

  IF p_target_scope = 'specific' AND COALESCE(array_length(p_device_ids,1),0) = 0 THEN
    RAISE EXCEPTION 'TARGET_SCOPE_SPECIFIC_WITHOUT_TARGETS' USING ERRCODE = '23514';
  END IF;
  IF p_target_scope = 'all' AND COALESCE(array_length(p_device_ids,1),0) > 0 THEN
    RAISE EXCEPTION 'TARGET_SCOPE_ALL_WITH_TARGETS' USING ERRCODE = '23514';
  END IF;

  IF p_mode = 'specific_days' AND COALESCE(array_length(p_day_dates,1),0) = 0 THEN
    RAISE EXCEPTION 'MODE_SPECIFIC_DAYS_WITHOUT_DAYS' USING ERRCODE = '23514';
  END IF;
  IF p_mode = 'every_day' AND p_day_dates IS NOT NULL
     AND array_length(p_day_dates,1) > 0 THEN
    RAISE EXCEPTION 'MODE_EVERY_DAY_WITH_DAYS' USING ERRCODE = '23514';
  END IF;

  -- cada DAY dentro do intervalo
  IF p_day_dates IS NOT NULL THEN
    PERFORM 1 FROM unnest(p_day_dates) d WHERE d < p_starts_on OR d > p_ends_on;
    IF FOUND THEN
      RAISE EXCEPTION 'DAY_OUTSIDE_INTERVAL' USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO public.tv_schedules (id, workspace_id, event_id, starts_on, ends_on,
                                   schedule_mode, target_scope, is_active, sort_order)
  VALUES (v_sid, p_workspace_id, p_event_id, p_starts_on, p_ends_on,
          p_mode, p_target_scope, p_is_active, p_sort_order)
  ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id,
    starts_on = EXCLUDED.starts_on, ends_on = EXCLUDED.ends_on,
    schedule_mode = EXCLUDED.schedule_mode, target_scope = EXCLUDED.target_scope,
    is_active = EXCLUDED.is_active, sort_order = EXCLUDED.sort_order,
    updated_at = now();

  DELETE FROM public.tv_schedule_days     WHERE schedule_id = v_sid;
  DELETE FROM public.tv_schedule_targets  WHERE schedule_id = v_sid;

  IF p_mode = 'specific_days' THEN
    INSERT INTO public.tv_schedule_days (schedule_id, date)
    SELECT v_sid, d FROM unnest(p_day_dates) d;
  END IF;

  IF p_target_scope = 'specific' THEN
    INSERT INTO public.tv_schedule_targets (schedule_id, device_id)
    SELECT v_sid, dev FROM unnest(p_device_ids) dev;
  END IF;

  RETURN jsonb_build_object('schedule_id', v_sid);
END;
$$;

-- delete seguro (apenas FULL)
CREATE OR REPLACE FUNCTION public.tv_schedule_delete(p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ws uuid;
BEGIN
  SELECT s.workspace_id INTO v_ws FROM public.tv_schedules s WHERE s.id = p_schedule_id;
  IF v_ws IS NULL THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'NOT_FOUND');
  END IF;
  IF NOT public.tv_can_manage_workspace(v_ws) THEN
    RAISE EXCEPTION 'TV_WORKSPACE_FULL_REQUIRED' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.tv_schedules WHERE id = p_schedule_id;
  RETURN jsonb_build_object('deleted', true);
END;
$$;

revoke all on function public.tv_schedule_upsert(uuid,uuid,date,date,text,text,uuid[],date[],boolean,integer,uuid) from public;
revoke all on function public.tv_schedule_delete(uuid) from public;
GRANT EXECUTE ON FUNCTION public.tv_schedule_upsert(uuid,uuid,date,date,text,text,uuid[],date[],boolean,integer,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tv_schedule_delete(uuid) TO authenticated;

-- ===============================================================================
-- VERIFICAcAO POS-MIGRATION:
--   SELECT tablename, policyname FROM pg_policies
--    WHERE tablename LIKE 'tv_schedule%';
--   -- tv_schedules/tv_schedule_days/tv_schedule_targets: somente *_read.
--   -- NENHUMA policy INSERT/UPDATE/DELETE (mutation = RPC tv_schedule_*).
-- ===============================================================================
