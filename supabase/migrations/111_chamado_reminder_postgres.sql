-- Lembretes de chamados e Push — migração do controle de Redis/Lua para PostgreSQL.
--
-- Substitui, com garantias equivalentes (e mais fortes), os seguintes recursos:
--   · `chamado:reminder:state:{ticket}`  -> public.chamado_reminder_states
--   · `chamado:reminder:lock:{ticket}`   -> lock_token/lock_expires_at na mesma linha
--   · `chamado:reminder:sent:{...}`      -> public.chamado_reminder_sent_marks
--   · `push:chamado:{ticket}`            -> public.chamado_push_subscriptions
--   · `push:subscribers`                 -> public.push_subscriptions
--   · `push:sent:{...}`                  -> public.push_dedup_marks
--
-- Concorrência: todas as RPCs tomam `pg_advisory_xact_lock` pela chave do ticket
-- (ou do destinatário) e usam `SELECT ... FOR UPDATE`. O token de posse e a
-- geração de transição fazem o papel do fencing dos scripts Lua: um worker que
-- perdeu o lock ou cuja geração foi alterada por uma transição HTTP não grava.
-- Nenhuma escrita é feita sem a checagem atômica das duas condições.

BEGIN;

-- ── Estado dos lembretes ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chamado_reminder_states (
  ticket_id              uuid PRIMARY KEY
                         REFERENCES public.chamados_tickets (id) ON DELETE CASCADE,
  workspace_id           uuid
                         REFERENCES public.workspaces (id) ON DELETE CASCADE,
  cycle_id               text NOT NULL DEFAULT '',
  reminder_count         integer NOT NULL DEFAULT 0
                         CHECK (reminder_count >= 0 AND reminder_count <= 10),
  last_reminder_at       timestamptz,
  last_known_status      text NOT NULL DEFAULT 'aberto',
  transition_generation  bigint NOT NULL DEFAULT 0
                         CHECK (transition_generation >= 0
                                AND transition_generation <= 1000000000),
  lock_token             uuid,
  lock_expires_at        timestamptz,
  expires_at             timestamptz NOT NULL
                         DEFAULT (clock_timestamp() + INTERVAL '7 days'),
  updated_at             timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_chamado_reminder_states_workspace
  ON public.chamado_reminder_states (workspace_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_chamado_reminder_states_expiry
  ON public.chamado_reminder_states (expires_at);

CREATE TABLE IF NOT EXISTS public.chamado_reminder_sent_marks (
  ticket_id    uuid NOT NULL
               REFERENCES public.chamados_tickets (id) ON DELETE CASCADE,
  cycle_id     text NOT NULL,
  wave         integer NOT NULL CHECK (wave > 0),
  identity     text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at   timestamptz NOT NULL
               DEFAULT (clock_timestamp() + INTERVAL '7 days'),
  PRIMARY KEY (ticket_id, cycle_id, wave, identity)
);

CREATE INDEX IF NOT EXISTS idx_chamado_reminder_sent_marks_expiry
  ON public.chamado_reminder_sent_marks (expires_at);

-- Preparação para intervalo configurável por workspace. O motor ainda usa a
-- constante única de 120s; a tabela existe para uma futura RPC/tela escolher
-- o valor sem nova migration estrutural. Nenhum código lê esta tabela ainda.
CREATE TABLE IF NOT EXISTS public.chamado_reminder_workspace_settings (
  workspace_id  uuid PRIMARY KEY
                REFERENCES public.workspaces (id) ON DELETE CASCADE,
  interval_seconds integer NOT NULL DEFAULT 120
                CHECK (interval_seconds >= 60 AND interval_seconds <= 86400),
  max_count     integer NOT NULL DEFAULT 10
                CHECK (max_count >= 1 AND max_count <= 10),
  updated_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.chamado_reminder_workspace_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chamado_reminder_workspace_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chamado_reminder_workspace_settings TO service_role;

-- ── Inscrições Push ──────────────────────────────────────────────────────────

-- `payload` guarda o registro exuto que o backend usa em _target_subs: chaves
-- de criptografia, user (role/apps/notify_settings) e dados de diagnóstico.
-- O endpoint é a identidade estável de um dispositivo (dedup por dispositivo).
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint     text PRIMARY KEY,
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at   timestamptz
);

CREATE TABLE IF NOT EXISTS public.chamado_push_subscriptions (
  ticket_id    uuid NOT NULL
               REFERENCES public.chamados_tickets (id) ON DELETE CASCADE,
  endpoint     text NOT NULL,
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at   timestamptz,
  PRIMARY KEY (ticket_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_chamado_push_subscriptions_ticket
  ON public.chamado_push_subscriptions (ticket_id);

-- ── Dedup individual do Push ─────────────────────────────────────────────────

-- A chave é a mesma string usada hoje (`push:sent:{event}:{identity}[:ws:...]`).
-- `state` é 'reserved', 'accepted', 'attempted' (legado) ou outro valor
-- desconhecido — que deve falhar fechado, como no Redis.
CREATE TABLE IF NOT EXISTS public.push_dedup_marks (
  key          text PRIMARY KEY,
  state        text NOT NULL,
  token        text,
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at   timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_dedup_marks_expiry
  ON public.push_dedup_marks (expires_at);

-- ── RLS / privilégios ────────────────────────────────────────────────────────

ALTER TABLE public.chamado_reminder_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chamado_reminder_sent_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chamado_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_dedup_marks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.chamado_reminder_states FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.chamado_reminder_sent_marks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.chamado_push_subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.push_dedup_marks FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chamado_reminder_states TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chamado_reminder_sent_marks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chamado_push_subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_dedup_marks TO service_role;

-- ── RPCs de lembretes ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chamado_reminder_acquire(
  p_ticket_id uuid,
  p_workspace_id uuid,
  p_token uuid,
  p_lock_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_locked_until timestamptz;
  v_owner uuid;
  v_workspace_id uuid;
BEGIN
  IF p_ticket_id IS NULL OR p_token IS NULL
     OR p_lock_seconds IS NULL OR p_lock_seconds <= 0 THEN
    RETURN false;
  END IF;

  -- O workspace do ticket é a autoridade; o parâmetro é apenas fallback para
  -- tickets legados sem workspace (a coluna é nullable no schema base).
  SELECT workspace_id INTO v_workspace_id
  FROM public.chamados_tickets WHERE id = p_ticket_id;
  v_workspace_id := COALESCE(v_workspace_id, p_workspace_id);

  -- Serializa a aquisição mesmo quando a linha ainda não existe.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));

  INSERT INTO public.chamado_reminder_states (ticket_id, workspace_id)
  VALUES (p_ticket_id, v_workspace_id)
  ON CONFLICT (ticket_id) DO NOTHING;

  SELECT lock_token, lock_expires_at INTO v_owner, v_locked_until
  FROM public.chamado_reminder_states
  WHERE ticket_id = p_ticket_id
  FOR UPDATE;

  -- Lock vigente de outro token: fail-closed (equivale a SET NX recusado).
  IF v_locked_until IS NOT NULL AND v_locked_until > clock_timestamp()
     AND v_owner IS DISTINCT FROM p_token THEN
    RETURN false;
  END IF;

  UPDATE public.chamado_reminder_states
  SET lock_token = p_token,
      lock_expires_at = clock_timestamp() + make_interval(secs => p_lock_seconds),
      expires_at = clock_timestamp() + INTERVAL '7 days',
      updated_at = clock_timestamp()
  WHERE ticket_id = p_ticket_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.chamado_reminder_renew(
  p_ticket_id uuid,
  p_token uuid,
  p_lock_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_ticket_id IS NULL OR p_token IS NULL OR p_lock_seconds IS NULL
     OR p_lock_seconds <= 0 THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));

  -- Só o dono atual renova; um lock já expirado não pode ser ressuscitado.
  UPDATE public.chamado_reminder_states
  SET lock_expires_at = clock_timestamp() + make_interval(secs => p_lock_seconds),
      updated_at = clock_timestamp()
  WHERE ticket_id = p_ticket_id
    AND lock_token = p_token
    AND lock_expires_at IS NOT NULL
    AND lock_expires_at > clock_timestamp();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.chamado_reminder_release(
  p_ticket_id uuid,
  p_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_ticket_id IS NULL OR p_token IS NULL THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));
  UPDATE public.chamado_reminder_states
  SET lock_token = NULL, lock_expires_at = NULL, updated_at = clock_timestamp()
  WHERE ticket_id = p_ticket_id AND lock_token = p_token;
  RETURN FOUND;
END;
$$;

-- Devolve `{"ok": true, "state": {...}}` (ou state null quando ainda não há
-- estado) e `{"ok": false}` quando o lock foi perdido. `ok=false` é falha de
-- leitura: o chamador deve pular o chamado, não tratar como estado vazio.
CREATE OR REPLACE FUNCTION public.chamado_reminder_read(
  p_ticket_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.chamado_reminder_states%ROWTYPE;
  v_owner uuid;
  v_until timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));
  SELECT * INTO v_row FROM public.chamado_reminder_states
  WHERE ticket_id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'state', NULL);
  END IF;

  IF p_token IS NOT NULL THEN
    SELECT lock_token, lock_expires_at INTO v_owner, v_until
    FROM public.chamado_reminder_states WHERE ticket_id = p_ticket_id;
    IF v_owner IS DISTINCT FROM p_token
       OR v_until IS NULL OR v_until <= clock_timestamp() THEN
      RETURN jsonb_build_object('ok', false);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'state', jsonb_build_object(
      'ticket_id', v_row.ticket_id::text,
      'workspace_id', v_row.workspace_id::text,
      'reminder_count', v_row.reminder_count,
      'cycle_id', v_row.cycle_id,
      'last_reminder_at',
        CASE WHEN v_row.last_reminder_at IS NULL THEN NULL
             ELSE to_char(v_row.last_reminder_at AT TIME ZONE 'UTC',
                          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
      'last_known_status', v_row.last_known_status,
      'transition_generation', v_row.transition_generation
    )
  );
END;
$$;

-- Escrita da onda: exige lock vigente E geração inalterada. Um terminal ou
-- assunção concorrente incrementa a geração e faz a escrita falhar, sem poder
-- restaurar `aberto` sobre um ciclo encerrado.
CREATE OR REPLACE FUNCTION public.chamado_reminder_write(
  p_ticket_id uuid,
  p_token uuid,
  p_expected_generation bigint,
  p_state jsonb,
  p_terminal_confirmed boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.chamado_reminder_states%ROWTYPE;
  v_incoming_status text;
  v_incoming_cycle text;
BEGIN
  IF p_ticket_id IS NULL OR p_token IS NULL OR p_expected_generation IS NULL
     OR p_state IS NULL THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));

  SELECT * INTO v_row FROM public.chamado_reminder_states
  WHERE ticket_id = p_ticket_id FOR UPDATE;
  IF NOT FOUND
     OR v_row.lock_token IS DISTINCT FROM p_token
     OR v_row.lock_expires_at IS NULL
     OR v_row.lock_expires_at <= clock_timestamp()
     OR v_row.transition_generation <> p_expected_generation THEN
    RETURN false;
  END IF;

  v_incoming_status := COALESCE(p_state ->> 'last_known_status', '');
  v_incoming_cycle := COALESCE(p_state ->> 'cycle_id', '');

  IF p_terminal_confirmed
     AND v_row.last_known_status IN ('resolvido', 'fechado', 'indeferido')
     AND v_row.last_known_status <> v_incoming_status
     AND v_row.cycle_id = v_incoming_cycle THEN
    RETURN false;
  END IF;

  -- Qualquer valor inválido no payload falha fechado: nunca normalizar
  -- corrupção com CAST permissivo nem com LEAST/GREATEST silenciosos.
  IF COALESCE(p_state ->> 'reminder_count', '') !~ '^\d+$'
     OR (p_state ->> 'reminder_count')::integer < 0
     OR (p_state ->> 'reminder_count')::integer > 10 THEN
    RETURN false;
  END IF;
  IF p_state ->> 'last_reminder_at' IS NOT NULL
     AND p_state ->> 'last_reminder_at' !~ '^\d{4}-\d{2}-\d{2}T' THEN
    RETURN false;
  END IF;

  UPDATE public.chamado_reminder_states
  SET cycle_id = v_incoming_cycle,
      reminder_count = (p_state ->> 'reminder_count')::integer,
      last_reminder_at = (p_state ->> 'last_reminder_at')::timestamptz,
      last_known_status = v_incoming_status,
      transition_generation = p_expected_generation,
      expires_at = clock_timestamp() + INTERVAL '7 days',
      updated_at = clock_timestamp()
  WHERE ticket_id = p_ticket_id;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.chamado_reminder_mark_sent(
  p_ticket_id uuid,
  p_cycle_id text,
  p_wave integer,
  p_identity text,
  p_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_owner uuid;
  v_until timestamptz;
BEGIN
  IF p_ticket_id IS NULL OR p_token IS NULL OR p_cycle_id IS NULL
     OR p_identity IS NULL OR p_wave IS NULL OR p_wave <= 0 THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));
  SELECT lock_token, lock_expires_at INTO v_owner, v_until
  FROM public.chamado_reminder_states WHERE ticket_id = p_ticket_id;
  IF v_owner IS DISTINCT FROM p_token OR v_until IS NULL
     OR v_until <= clock_timestamp() THEN
    RETURN false;
  END IF;

  INSERT INTO public.chamado_reminder_sent_marks
    (ticket_id, cycle_id, wave, identity)
  VALUES (p_ticket_id, p_cycle_id, p_wave, p_identity)
  ON CONFLICT (ticket_id, cycle_id, wave, identity) DO NOTHING;
  RETURN true;
END;
$$;

-- `{"ok": true, "marked": bool}` / `{"ok": false}` (lock perdido).
CREATE OR REPLACE FUNCTION public.chamado_reminder_is_marked(
  p_ticket_id uuid,
  p_cycle_id text,
  p_wave integer,
  p_identity text,
  p_token uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_owner uuid;
  v_until timestamptz;
  v_marked boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));
  IF p_token IS NOT NULL THEN
    SELECT lock_token, lock_expires_at INTO v_owner, v_until
    FROM public.chamado_reminder_states WHERE ticket_id = p_ticket_id;
    IF v_owner IS DISTINCT FROM p_token OR v_until IS NULL
       OR v_until <= clock_timestamp() THEN
      RETURN jsonb_build_object('ok', false);
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.chamado_reminder_sent_marks
    WHERE ticket_id = p_ticket_id AND cycle_id = p_cycle_id
      AND wave = p_wave AND identity = p_identity
      AND expires_at > clock_timestamp()
  ) INTO v_marked;
  RETURN jsonb_build_object('ok', true, 'marked', v_marked);
END;
$$;

CREATE OR REPLACE FUNCTION public.chamado_reminder_clear_marks(
  p_ticket_id uuid,
  p_cycle_id text,
  p_wave integer,
  p_identities text[],
  p_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_owner uuid;
  v_until timestamptz;
BEGIN
  IF p_ticket_id IS NULL OR p_token IS NULL OR p_wave IS NULL OR p_wave <= 1 THEN
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));
  SELECT lock_token, lock_expires_at INTO v_owner, v_until
  FROM public.chamado_reminder_states WHERE ticket_id = p_ticket_id;
  IF v_owner IS DISTINCT FROM p_token OR v_until IS NULL
     OR v_until <= clock_timestamp() THEN
    RETURN;
  END IF;

  DELETE FROM public.chamado_reminder_sent_marks
  WHERE ticket_id = p_ticket_id AND cycle_id = p_cycle_id
    AND wave < p_wave AND identity = ANY(COALESCE(p_identities, ARRAY[]::text[]));
END;
$$;

-- Transição HTTP (status terminal/assunção): incremento atômico da geração,
-- sem lock do worker e sem snapshot no cliente. Estado novo nasce na geração 1.
CREATE OR REPLACE FUNCTION public.chamado_reminder_transition(
  p_ticket_id uuid,
  p_status text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_workspace_id uuid;
  v_generation bigint;
BEGIN
  IF p_ticket_id IS NULL OR p_status IS NULL OR p_status = '' THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));

  SELECT workspace_id INTO v_workspace_id
  FROM public.chamados_tickets WHERE id = p_ticket_id;
  IF v_workspace_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.chamado_reminder_states (ticket_id, workspace_id)
  VALUES (p_ticket_id, v_workspace_id)
  ON CONFLICT (ticket_id) DO NOTHING;

  UPDATE public.chamado_reminder_states
  SET transition_generation = transition_generation + 1,
      last_known_status = p_status,
      expires_at = clock_timestamp() + INTERVAL '7 days',
      updated_at = clock_timestamp()
  WHERE ticket_id = p_ticket_id
    AND transition_generation < 1000000000
  RETURNING transition_generation INTO v_generation;
  RETURN v_generation;
END;
$$;

CREATE OR REPLACE FUNCTION public.chamado_reminder_cleanup()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_removed integer;
BEGIN
  DELETE FROM public.chamado_reminder_sent_marks
  WHERE expires_at <= clock_timestamp();
  DELETE FROM public.chamado_reminder_states
  WHERE expires_at <= clock_timestamp()
    AND (lock_expires_at IS NULL OR lock_expires_at <= clock_timestamp());
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RETURN v_removed;
END;
$$;

-- ── RPCs de inscrições Push ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.push_subs_list()
RETURNS SETOF jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT payload FROM public.push_subscriptions
  WHERE expires_at IS NULL OR expires_at > clock_timestamp();
$$;

CREATE OR REPLACE FUNCTION public.push_subs_save(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_endpoint text := COALESCE(p_payload ->> 'endpoint', '');
BEGIN
  IF v_endpoint = '' THEN
    RAISE EXCEPTION 'endpoint obrigatório' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.push_subscriptions (endpoint, payload)
  VALUES (v_endpoint, p_payload)
  ON CONFLICT (endpoint) DO UPDATE
  SET payload = EXCLUDED.payload,
      updated_at = clock_timestamp(),
      expires_at = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.push_subs_remove(p_endpoint text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Preserva o comportamento anterior: HTTP 404/410 remove apenas a
  -- inscrição global. A inscrição anônima por chamado é gerida por
  -- `_notify_ticket_status`, que conhece o contexto do ticket.
  DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint;
END;
$$;

CREATE OR REPLACE FUNCTION public.push_subs_expire(p_endpoint text, p_seconds integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.push_subscriptions
  SET expires_at = clock_timestamp() + make_interval(secs => GREATEST(p_seconds, 0))
  WHERE endpoint = p_endpoint;
END;
$$;

CREATE OR REPLACE FUNCTION public.chamado_subs_list(p_ticket_id uuid)
RETURNS SETOF jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT payload FROM public.chamado_push_subscriptions
  WHERE ticket_id = p_ticket_id
    AND (expires_at IS NULL OR expires_at > clock_timestamp());
$$;

CREATE OR REPLACE FUNCTION public.chamado_subs_save(p_ticket_id uuid, p_subs jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sub jsonb;
BEGIN
  DELETE FROM public.chamado_push_subscriptions WHERE ticket_id = p_ticket_id;
  FOR v_sub IN SELECT value FROM jsonb_array_elements(COALESCE(p_subs, '[]'::jsonb)) LIMIT 10 LOOP
    INSERT INTO public.chamado_push_subscriptions (ticket_id, endpoint, payload)
    VALUES (p_ticket_id, COALESCE(v_sub ->> 'endpoint', ''), v_sub)
    ON CONFLICT (ticket_id, endpoint) DO UPDATE
    SET payload = EXCLUDED.payload, expires_at = NULL;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.chamado_subs_expire(p_ticket_id uuid, p_seconds integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.chamado_push_subscriptions
  SET expires_at = clock_timestamp() + make_interval(secs => GREATEST(p_seconds, 0))
  WHERE ticket_id = p_ticket_id;
END;
$$;

-- ── RPCs de dedup individual do Push ─────────────────────────────────────────

-- Discussão do estado legado: `attempted` é tentativa antiga ('1'), NÃO aceitação.
CREATE OR REPLACE FUNCTION public.push_dedup_state(p_key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_state text;
  v_token text;
  v_expires timestamptz;
BEGIN
  SELECT state, token, expires_at INTO v_state, v_token, v_expires
  FROM public.push_dedup_marks WHERE key = p_key;
  IF NOT FOUND OR v_expires <= clock_timestamp() THEN
    RETURN 'absent';
  END IF;
  IF v_state = 'attempted' AND v_token IS NULL THEN
    RETURN 'attempted';
  END IF;
  IF v_token IS NULL OR v_token = '' THEN
    RETURN 'unknown';
  END IF;
  IF v_state IN ('reserved', 'accepted') THEN
    RETURN v_state;
  END IF;
  RETURN 'unknown';
END;
$$;

CREATE OR REPLACE FUNCTION public.push_dedup_reserve(
  p_key text, p_token text, p_ttl integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_key IS NULL OR p_token IS NULL OR p_ttl IS NULL OR p_ttl <= 0 THEN
    RETURN false;
  END IF;
  DELETE FROM public.push_dedup_marks
  WHERE key = p_key AND expires_at <= clock_timestamp();
  INSERT INTO public.push_dedup_marks (key, state, token, expires_at)
  VALUES (p_key, 'reserved', p_token,
          clock_timestamp() + make_interval(secs => p_ttl))
  ON CONFLICT (key) DO NOTHING;
  RETURN FOUND;
END;
$$;

-- Preserva o TTL original: confirmar não renova o prazo da marca.
CREATE OR REPLACE FUNCTION public.push_dedup_confirm(
  p_key text, p_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.push_dedup_marks
  SET state = 'accepted'
  WHERE key = p_key AND state = 'reserved' AND token = p_token
    AND expires_at > clock_timestamp();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.push_dedup_release(p_key text, p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.push_dedup_marks
  WHERE key = p_key AND state = 'reserved' AND token = p_token;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.push_dedup_cleanup()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_removed integer;
BEGIN
  DELETE FROM public.push_dedup_marks WHERE expires_at <= clock_timestamp();
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RETURN v_removed;
END;
$$;

-- ── Privilégios das funções ──────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.chamado_reminder_acquire(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamado_reminder_renew(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamado_reminder_release(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamado_reminder_read(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamado_reminder_write(uuid, uuid, bigint, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamado_reminder_mark_sent(uuid, text, integer, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamado_reminder_is_marked(uuid, text, integer, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamado_reminder_clear_marks(uuid, text, integer, text[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamado_reminder_transition(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamado_reminder_cleanup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_subs_list() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_subs_save(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_subs_remove(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_subs_expire(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamado_subs_list(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamado_subs_save(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chamado_subs_expire(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_dedup_state(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_dedup_reserve(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_dedup_confirm(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_dedup_release(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_dedup_cleanup() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.chamado_reminder_acquire(uuid, uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.chamado_reminder_renew(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.chamado_reminder_release(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.chamado_reminder_read(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.chamado_reminder_write(uuid, uuid, bigint, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.chamado_reminder_mark_sent(uuid, text, integer, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.chamado_reminder_is_marked(uuid, text, integer, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.chamado_reminder_clear_marks(uuid, text, integer, text[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.chamado_reminder_transition(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.chamado_reminder_cleanup() TO service_role;
GRANT EXECUTE ON FUNCTION public.push_subs_list() TO service_role;
GRANT EXECUTE ON FUNCTION public.push_subs_save(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_subs_remove(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_subs_expire(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.chamado_subs_list(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.chamado_subs_save(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.chamado_subs_expire(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_dedup_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_dedup_reserve(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_dedup_confirm(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_dedup_release(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_dedup_cleanup() TO service_role;

COMMIT;
