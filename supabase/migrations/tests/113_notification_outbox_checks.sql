-- =============================================================================
-- Migration 113: outbox durável e transições de publicação/entrega.
-- Executado após a cadeia completa em PostgreSQL efêmero; rollback ao final.
-- =============================================================================
BEGIN;

DO $$
DECLARE
  v_event text := 'ci-notification-outbox-' || gen_random_uuid()::text;
  v_retry_event text := 'ci-notification-outbox-retry-' || gen_random_uuid()::text;
  v_claim record;
  v_worker_claim record;
  v_token uuid;
  v_second_token uuid;
  v_result boolean;
  v_status text;
  v_count integer;
BEGIN
  -- Idempotência da entrada: mesmo event_id não cria uma segunda linha.
  IF public.notification_outbox_enqueue(v_event, NULL, '{"title":"CI event","target":"user"}'::jsonb) IS NOT TRUE THEN
    RAISE EXCEPTION '113 FAIL: primeiro enqueue não inseriu';
  END IF;
  IF public.notification_outbox_enqueue(v_event, NULL, '{"title":"different payload"}'::jsonb) IS NOT FALSE THEN
    RAISE EXCEPTION '113 FAIL: enqueue duplicado deveria ser ignorado';
  END IF;

  -- Claim de publicação cria lease/token e incrementa tentativas de publish.
  SELECT * INTO v_claim
  FROM public.notification_outbox_claim_for_publish('ci-publisher', 10, 60)
  WHERE event_id = v_event;
  IF v_claim.event_id IS NULL OR v_claim.lock_token IS NULL OR v_claim.publish_attempts <> 1 THEN
    RAISE EXCEPTION '113 FAIL: claim_for_publish não reservou o evento';
  END IF;
  v_token := v_claim.lock_token;

  IF public.notification_outbox_mark_queued(v_event, v_token) IS NOT TRUE THEN
    RAISE EXCEPTION '113 FAIL: mark_queued recusou token válido';
  END IF;
  IF public.notification_outbox_mark_queued(v_event, gen_random_uuid()) IS NOT FALSE THEN
    RAISE EXCEPTION '113 FAIL: mark_queued aceitou token inválido';
  END IF;

  -- Claim de consumo retorna payload/token; token incorreto não conclui.
  SELECT * INTO v_worker_claim
  FROM public.notification_outbox_claim_event(v_event, 'ci-consumer', 60);
  IF v_worker_claim.payload->>'title' <> 'CI event'
     OR v_worker_claim.lock_token IS NULL
     OR v_worker_claim.attempts <> 1 THEN
    RAISE EXCEPTION '113 FAIL: claim_event não reservou o evento';
  END IF;
  IF public.notification_outbox_complete(v_event, gen_random_uuid()) IS NOT FALSE THEN
    RAISE EXCEPTION '113 FAIL: complete aceitou token inválido';
  END IF;
  IF public.notification_outbox_complete(v_event, v_worker_claim.lock_token) IS NOT TRUE THEN
    RAISE EXCEPTION '113 FAIL: complete recusou token válido';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.notification_outbox_claim_event(v_event, 'ci-duplicate', 60);
  IF v_count <> 0 THEN
    RAISE EXCEPTION '113 FAIL: evento entregue foi reivindicado novamente';
  END IF;

  -- Falha de entrega devolve para pending; após oito tentativas vira dead.
  IF public.notification_outbox_enqueue(v_retry_event, NULL, '{"title":"retry"}'::jsonb) IS NOT TRUE THEN
    RAISE EXCEPTION '113 FAIL: evento de retry não inserido';
  END IF;
  SELECT * INTO v_claim
  FROM public.notification_outbox_claim_for_publish('ci-publisher', 10, 60)
  WHERE event_id = v_retry_event;
  IF v_claim.event_id IS NULL THEN
    RAISE EXCEPTION '113 FAIL: retry event não foi reservado para publish';
  END IF;
  IF public.notification_outbox_mark_queued(v_retry_event, v_claim.lock_token) IS NOT TRUE THEN
    RAISE EXCEPTION '113 FAIL: retry event não foi marcado como queued';
  END IF;
  SELECT * INTO v_worker_claim
  FROM public.notification_outbox_claim_event(v_retry_event, 'ci-consumer', 60);
  -- RETURNS TABLE não inclui event_id; testa o payload/lock_token.
  IF v_worker_claim.payload->>'title' <> 'retry' OR v_worker_claim.lock_token IS NULL THEN
    RAISE EXCEPTION '113 FAIL: retry event não foi reivindicado';
  END IF;
  UPDATE public.notification_outbox SET attempts = 7 WHERE event_id = v_retry_event;
  v_status := public.notification_outbox_retry(
    v_retry_event, v_worker_claim.lock_token, 'repeated failure', 1
  );
  IF v_status <> 'dead' THEN
    RAISE EXCEPTION '113 FAIL: oitava falha deveria mover para dead, retornou %', v_status;
  END IF;

  -- A linha dead deve continuar terminal e não pode ser publicada novamente.
  SELECT count(*) INTO v_count
  FROM public.notification_outbox_claim_for_publish('ci-publisher', 10, 60)
  WHERE event_id = v_retry_event;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '113 FAIL: dead-letter foi republicado';
  END IF;

  -- RLS e privilégio mínimo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'notification_outbox'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION '113 FAIL: RLS/FORCE RLS ausente';
  END IF;
  IF has_table_privilege('anon', 'public.notification_outbox', 'SELECT')
     OR has_table_privilege('authenticated', 'public.notification_outbox', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.notification_outbox', 'SELECT') THEN
    RAISE EXCEPTION '113 FAIL: grants da tabela incorretos';
  END IF;
  IF has_function_privilege('anon', 'public.notification_outbox_enqueue(text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.notification_outbox_enqueue(text,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.notification_outbox_enqueue(text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '113 FAIL: grants da RPC incorretos';
  END IF;

  RAISE NOTICE 'OK: migration 113 notification outbox checks passed';
END
$$;

ROLLBACK;
