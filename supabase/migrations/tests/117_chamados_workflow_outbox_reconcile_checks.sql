-- =============================================================================
-- Migration 117: reconciliação durável, limitada e idempotente.
-- Executado após a cadeia completa em PostgreSQL efêmero; rollback ao final.
-- =============================================================================
BEGIN;

DO $$
DECLARE
  v_workspace uuid := gen_random_uuid();
  v_open uuid := gen_random_uuid();
  v_assigned uuid := gen_random_uuid();
  v_closed uuid := gen_random_uuid();
  v_old uuid := gen_random_uuid();
  v_rows integer;
  v_tick boolean;
  v_found boolean;
BEGIN
  INSERT INTO public.workspaces (id, name, slug)
  VALUES (v_workspace, 'Workflow Reconcile CI', 'wf-reconcile-' || substr(gen_random_uuid()::text, 1, 8));

  INSERT INTO public.chamados_tickets (id, "workspace_id", status, "assignedToUserId", "updatedAt")
  VALUES
    (v_open, v_workspace, 'aberto', '', clock_timestamp()),
    (v_assigned, v_workspace, 'aberto', gen_random_uuid()::text, clock_timestamp()),
    (v_closed, v_workspace, 'resolvido', '', clock_timestamp()),
    (v_old, v_workspace, 'aberto', '', clock_timestamp() - interval '2 days');

  -- O tick é atômico: a primeira chamada vence; repetir não varre de novo.
  v_tick := public.chamados_workflow_outbox_reconcile_tick(900);
  IF v_tick IS NOT TRUE THEN
    RAISE EXCEPTION '117 FAIL: primeiro tick não foi concedido';
  END IF;
  v_tick := public.chamados_workflow_outbox_reconcile_tick(900);
  IF v_tick IS NOT FALSE THEN
    RAISE EXCEPTION '117 FAIL: segundo tick não foi bloqueado';
  END IF;

  -- Somente chamados abertos, sem responsável e dentro da janela.
  SELECT count(*), bool_or(ticket_id = v_open AND workspace_id = v_workspace)
  INTO v_rows, v_found
  FROM public.chamados_workflow_outbox_reconcile_candidates(1440, 20);
  IF v_rows <> 1 OR v_found IS NOT TRUE THEN
    RAISE EXCEPTION '117 FAIL: candidato elegível divergente (rows=%, found=%)', v_rows, v_found;
  END IF;

  -- Limite aplicado no banco, sem varrer a tabela inteira.
  SELECT count(*) INTO v_rows
  FROM public.chamados_workflow_outbox_reconcile_candidates(1440, 1);
  IF v_rows <> 1 THEN
    RAISE EXCEPTION '117 FAIL: limite de candidatos divergente';
  END IF;

  -- Depois da janela, o tick volta a ser concedido para nova reconciliação.
  UPDATE public.chamados_workflow_reconcile_state
  SET last_run_at = clock_timestamp() - interval '20 minutes'
  WHERE singleton;
  IF public.chamados_workflow_outbox_reconcile_tick(900) IS NOT TRUE THEN
    RAISE EXCEPTION '117 FAIL: tick não foi renovado após a janela';
  END IF;
END;
$$;

ROLLBACK;
