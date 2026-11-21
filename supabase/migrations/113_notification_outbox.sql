-- 113_notification_outbox.sql
-- Outbox durável para eventos de notificação. PostgreSQL continua sendo a
-- fonte de verdade; Upstash Redis Streams transporta o trabalho operacional.
-- Todas as funções são SECURITY INVOKER e acessíveis somente a service_role.

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  event_id          text PRIMARY KEY,
  notification_id   text REFERENCES public.app_notifications(id) ON DELETE SET NULL,
  payload           jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'publishing', 'queued', 'processing', 'delivered', 'dead')),
  attempts          integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 100),
  publish_attempts  integer NOT NULL DEFAULT 0 CHECK (publish_attempts >= 0 AND publish_attempts <= 100),
  available_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  published_at      timestamptz,
  locked_by         text,
  lock_token        uuid,
  lock_expires_at   timestamptz,
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  delivered_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_publish
  ON public.notification_outbox (available_at, created_at)
  WHERE status IN ('pending', 'publishing');

CREATE INDEX IF NOT EXISTS idx_notification_outbox_queued_recovery
  ON public.notification_outbox (published_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_notification_outbox_status_updated
  ON public.notification_outbox (status, updated_at);

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_outbox TO service_role;

-- Idempotência do produtor: event_id é estável e a primeira gravação vence.
CREATE OR REPLACE FUNCTION public.notification_outbox_enqueue(
  p_event_id text,
  p_notification_id text,
  p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_inserted integer;
BEGIN
  IF nullif(btrim(p_event_id), '') IS NULL
     OR p_payload IS NULL
     OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid notification outbox event';
  END IF;

  INSERT INTO public.notification_outbox (event_id, notification_id, payload)
  VALUES (btrim(p_event_id), nullif(btrim(p_notification_id), ''), p_payload)
  ON CONFLICT (event_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END;
$$;

-- Reserva eventos duráveis para publicação no Redis. Eventos queued antigos
-- são republicados como recuperação caso o stream tenha perdido uma entrada.
CREATE OR REPLACE FUNCTION public.notification_outbox_claim_for_publish(
  p_worker_id text,
  p_limit integer DEFAULT 20,
  p_lease_seconds integer DEFAULT 90
)
RETURNS TABLE (
  event_id text,
  notification_id text,
  payload jsonb,
  publish_attempts integer,
  lock_token uuid
)
LANGUAGE sql
SET search_path = ''
AS $$
  WITH picked AS (
    SELECT o.event_id
    FROM public.notification_outbox AS o
    WHERE
      (o.status = 'pending' AND o.available_at <= clock_timestamp())
      OR (o.status = 'publishing' AND o.lock_expires_at <= clock_timestamp())
      OR (o.status = 'processing' AND o.lock_expires_at <= clock_timestamp())
      OR (o.status = 'queued' AND o.published_at <= clock_timestamp() - interval '5 minutes')
    ORDER BY o.available_at, o.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 20), 100))
  )
  UPDATE public.notification_outbox AS o
  SET status = 'publishing',
      publish_attempts = o.publish_attempts + 1,
      locked_by = left(coalesce(nullif(p_worker_id, ''), 'worker'), 128),
      lock_token = gen_random_uuid(),
      lock_expires_at = clock_timestamp()
        + make_interval(secs => greatest(10, least(coalesce(p_lease_seconds, 90), 600))),
      updated_at = clock_timestamp()
  FROM picked
  WHERE o.event_id = picked.event_id
  RETURNING o.event_id, o.notification_id, o.payload, o.publish_attempts, o.lock_token;
$$;

CREATE OR REPLACE FUNCTION public.notification_outbox_mark_queued(
  p_event_id text,
  p_lock_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.notification_outbox
  SET status = 'queued',
      published_at = clock_timestamp(),
      locked_by = NULL,
      lock_token = NULL,
      lock_expires_at = NULL,
      last_error = NULL,
      updated_at = clock_timestamp()
  WHERE event_id = p_event_id
    AND status = 'publishing'
    AND lock_token = p_lock_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_outbox_release_publish(
  p_event_id text,
  p_lock_token uuid,
  p_error text DEFAULT NULL,
  p_delay_seconds integer DEFAULT 15
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.notification_outbox
  SET status = 'pending',
      available_at = clock_timestamp()
        + make_interval(secs => greatest(1, least(coalesce(p_delay_seconds, 15), 3600))),
      locked_by = NULL,
      lock_token = NULL,
      lock_expires_at = NULL,
      last_error = left(coalesce(p_error, 'publish failed'), 1000),
      updated_at = clock_timestamp()
  WHERE event_id = p_event_id
    AND status = 'publishing'
    AND lock_token = p_lock_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- Claim individual pelo consumidor Redis. Se já foi entregue/morreu ou outro
-- worker mantém lease válido, devolve zero linhas: duplicatas podem ser ACK.
CREATE OR REPLACE FUNCTION public.notification_outbox_claim_event(
  p_event_id text,
  p_worker_id text,
  p_lease_seconds integer DEFAULT 90
)
RETURNS TABLE (payload jsonb, lock_token uuid, attempts integer)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_row public.notification_outbox%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.notification_outbox
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.status IN ('delivered', 'dead') THEN
    RETURN;
  END IF;

  IF v_row.status = 'processing'
     AND v_row.lock_expires_at > clock_timestamp() THEN
    RETURN;
  END IF;

  IF v_row.status = 'pending'
     AND v_row.available_at > clock_timestamp() THEN
    RETURN;
  END IF;

  UPDATE public.notification_outbox AS o
  SET status = 'processing',
      attempts = o.attempts + 1,
      locked_by = left(coalesce(nullif(p_worker_id, ''), 'worker'), 128),
      lock_token = gen_random_uuid(),
      lock_expires_at = clock_timestamp()
        + make_interval(secs => greatest(10, least(coalesce(p_lease_seconds, 90), 600))),
      updated_at = clock_timestamp()
  WHERE o.event_id = p_event_id
  RETURNING o.payload, o.lock_token, o.attempts
  INTO payload, lock_token, attempts;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_outbox_complete(
  p_event_id text,
  p_lock_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.notification_outbox
  SET status = 'delivered',
      delivered_at = clock_timestamp(),
      locked_by = NULL,
      lock_token = NULL,
      lock_expires_at = NULL,
      last_error = NULL,
      updated_at = clock_timestamp()
  WHERE event_id = p_event_id
    AND status = 'processing'
    AND lock_token = p_lock_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- Retry com backoff definido pelo worker; após oito tentativas vira dead-letter
-- durável no próprio PostgreSQL. O Redis só recebe ACK depois desta gravação.
CREATE OR REPLACE FUNCTION public.notification_outbox_retry(
  p_event_id text,
  p_lock_token uuid,
  p_error text DEFAULT NULL,
  p_delay_seconds integer DEFAULT 30
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  UPDATE public.notification_outbox
  SET status = CASE WHEN attempts >= 8 THEN 'dead' ELSE 'pending' END,
      available_at = CASE WHEN attempts >= 8 THEN clock_timestamp()
        ELSE clock_timestamp()
          + make_interval(secs => greatest(1, least(coalesce(p_delay_seconds, 30), 3600)))
        END,
      locked_by = NULL,
      lock_token = NULL,
      lock_expires_at = NULL,
      last_error = left(coalesce(p_error, 'notification delivery failed'), 1000),
      updated_at = clock_timestamp()
  WHERE event_id = p_event_id
    AND status = 'processing'
    AND lock_token = p_lock_token
  RETURNING status INTO v_status;

  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_outbox_enqueue(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_outbox_claim_for_publish(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_outbox_mark_queued(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_outbox_release_publish(text, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_outbox_claim_event(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_outbox_complete(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_outbox_retry(text, uuid, text, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.notification_outbox_enqueue(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_outbox_claim_for_publish(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_outbox_mark_queued(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_outbox_release_publish(text, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_outbox_claim_event(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_outbox_complete(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_outbox_retry(text, uuid, text, integer) TO service_role;
