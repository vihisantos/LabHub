-- =============================================================================
-- Migration 115: outbox dedicada de agendamento de Workflows de Chamados.
-- Executado após a cadeia completa em PostgreSQL efêmero; rollback ao final.
-- =============================================================================
BEGIN;

DO $$
DECLARE
  v_job_a uuid := gen_random_uuid();
  v_job_b uuid := gen_random_uuid();
  v_ticket uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_other_workspace uuid := gen_random_uuid();
  v_cycle text := repeat('a', 64);
  v_next_cycle text := repeat('b', 64);
  v_enqueued uuid;
  v_claim record;
  v_token uuid;
  v_ok boolean;
  v_current uuid;
  v_attempts integer;
  v_i integer;
  v_expected text;
BEGIN
  -- Primeira gravação vence; repetir o mesmo ciclo devolve o MESMO job_id.
  v_enqueued := public.chamados_workflow_outbox_enqueue(
    v_job_a, v_ticket, v_workspace, v_cycle
  );
  IF v_enqueued <> v_job_a THEN
    RAISE EXCEPTION '115 FAIL: enqueue não devolveu o job_id criado';
  END IF;
  v_enqueued := public.chamados_workflow_outbox_enqueue(
    v_job_b, v_ticket, v_workspace, v_cycle
  );
  IF v_enqueued <> v_job_a THEN
    RAISE EXCEPTION '115 FAIL: ciclo repetido criou outro job';
  END IF;
  IF (SELECT count(*) FROM public.chamados_workflow_outbox
      WHERE ticket_id = v_ticket AND workspace_id = v_workspace) <> 1 THEN
    RAISE EXCEPTION '115 FAIL: dedup por ciclo falhou';
  END IF;

  -- Claim reserva com token e devolve somente o lote disponível.
  SELECT * INTO v_claim
  FROM public.chamados_workflow_outbox_claim('ci-dispatch', 10, 60)
  WHERE job_id = v_job_a;
  IF v_claim.job_id IS NULL OR v_claim.lock_token IS NULL OR v_claim.attempts <> 1 THEN
    RAISE EXCEPTION '115 FAIL: claim não reservou o job';
  END IF;
  v_token := v_claim.lock_token;
  IF public.chamados_workflow_outbox_mark_published(v_job_a, gen_random_uuid()) IS NOT FALSE THEN
    RAISE EXCEPTION '115 FAIL: mark aceitou token inválido';
  END IF;
  IF public.chamados_workflow_outbox_mark_published(v_job_a, v_token) IS NOT TRUE THEN
    RAISE EXCEPTION '115 FAIL: mark recusou token válido';
  END IF;

  -- Ciclo vigente é o job publicado, isolado por workspace.
  v_current := public.chamados_workflow_outbox_current(v_ticket, v_workspace);
  IF v_current <> v_job_a THEN
    RAISE EXCEPTION '115 FAIL: ciclo vigente divergente';
  END IF;
  IF public.chamados_workflow_outbox_current(v_ticket, v_other_workspace) IS NOT NULL THEN
    RAISE EXCEPTION '115 FAIL: vazamento entre workspaces';
  END IF;

  -- Novo ciclo (reabertura) passa a ser a autoridade; antigo fica obsoleto.
  v_enqueued := public.chamados_workflow_outbox_enqueue(
    v_job_b, v_ticket, v_workspace, v_next_cycle
  );
  IF v_enqueued <> v_job_b THEN
    RAISE EXCEPTION '115 FAIL: novo ciclo não foi gravado';
  END IF;
  IF public.chamados_workflow_outbox_current(v_ticket, v_workspace) <> v_job_b THEN
    RAISE EXCEPTION '115 FAIL: ciclo antigo ainda é vigente';
  END IF;

  -- Falha de publicação devolve com backoff; lease expirado é recuperado.
  SELECT * INTO v_claim
  FROM public.chamados_workflow_outbox_claim('ci-dispatch', 10, 60)
  WHERE job_id = v_job_b;
  v_token := v_claim.lock_token;
  IF public.chamados_workflow_outbox_release(
    v_job_b, v_token, 'QStashError', 1
  ) <> 'pending' THEN
    RAISE EXCEPTION '115 FAIL: release não devolveu pending';
  END IF;
  SELECT attempts INTO v_attempts
  FROM public.chamados_workflow_outbox WHERE job_id = v_job_b;
  IF v_attempts <> 1 THEN
    RAISE EXCEPTION '115 FAIL: tentativas não incrementadas';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.chamados_workflow_outbox
    WHERE job_id = v_job_b AND status = 'pending'
      AND available_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION '115 FAIL: backoff não aplicado';
  END IF;

  FOR v_i IN 2..5 LOOP
    UPDATE public.chamados_workflow_outbox
    SET available_at = clock_timestamp() - interval '1 second'
    WHERE job_id = v_job_b;
    SELECT * INTO v_claim
    FROM public.chamados_workflow_outbox_claim('ci-dispatch', 10, 60)
    WHERE job_id = v_job_b;
    v_expected := CASE WHEN v_i = 5 THEN 'dead' ELSE 'pending' END;
    IF public.chamados_workflow_outbox_release(
      v_job_b, v_claim.lock_token, 'QStashError', 1
    ) <> v_expected THEN
      RAISE EXCEPTION '115 FAIL: release da tentativa % divergente', v_i;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.chamados_workflow_outbox
    WHERE job_id = v_job_b AND status = 'dead'
  ) THEN
    RAISE EXCEPTION '115 FAIL: esgotamento de tentativas não marcou dead';
  END IF;
  IF public.chamados_workflow_outbox_current(v_ticket, v_workspace) <> v_job_b THEN
    RAISE EXCEPTION '115 FAIL: job dead deveria continuar como ciclo vigente';
  END IF;

  -- Nenhuma linha da fila é apagada pela recuperação.
  IF (SELECT count(*) FROM public.chamados_workflow_outbox
      WHERE ticket_id = v_ticket) <> 2 THEN
    RAISE EXCEPTION '115 FAIL: linhas foram apagadas';
  END IF;
END;
$$;

ROLLBACK;
