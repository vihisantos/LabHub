-- =============================================================================
-- Migration 119: priorização de agendamentos ausentes + paginação da varredura.
-- Executado após a cadeia completa em PostgreSQL efêmero; rollback ao final.
-- =============================================================================
BEGIN;

DO $$
DECLARE
  v_workspace uuid := gen_random_uuid();
  v_done uuid := gen_random_uuid();
  v_first uuid := gen_random_uuid();
  v_second uuid := gen_random_uuid();
  v_third uuid := gen_random_uuid();
  v_hash text;
  v_cycle text;
  v_ids uuid[];
  v_count integer;
BEGIN
  -- O hash SQL precisa ser idêntico ao de chamados_workflow.cycle_key (Python).
  v_hash := public.chamados_workflow_sha256_hex(
    '11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:'
    || '2026-11-21T12:34:13.162592+00:00:{"assignedToUserId": "", "status": "aberto"}'
  );
  IF v_hash <> '6141f258ecdd315419726e15067a001200a938d12cff993f630df204708fbc05' THEN
    RAISE EXCEPTION '119 FAIL: hash SQL divergente da aplicação: %', v_hash;
  END IF;

  INSERT INTO public.workspaces (id, name, slug)
  VALUES (v_workspace, 'Workflow Priority CI', 'wf-priority-' || substr(gen_random_uuid()::text, 1, 8));

  INSERT INTO public.chamados_tickets (id, "workspace_id", status, "assignedToUserId", "updatedAt")
  VALUES
    (v_done,   v_workspace, 'aberto', '', clock_timestamp() - interval '4 minutes'),
    (v_first,  v_workspace, 'aberto', '', clock_timestamp() - interval '1 minute'),
    (v_second, v_workspace, 'aberto', '', clock_timestamp() - interval '2 minutes'),
    (v_third,  v_workspace, 'aberto', '', clock_timestamp() - interval '3 minutes');

  UPDATE public.chamados_workflow_reconcile_state
  SET cursor_updated_at = NULL, cursor_ticket_id = NULL
  WHERE singleton;

  -- v_done já tem agendamento para o ciclo vigente: não deve ser candidato.
  v_cycle := public.chamados_workflow_sha256_hex(
    v_done::text || ':' || v_workspace::text || ':'
    || to_char(
         (SELECT "updatedAt" FROM public.chamados_tickets WHERE id = v_done) AT TIME ZONE 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"'
       )
    || ':{"assignedToUserId": "", "status": "aberto"}'
  );
  PERFORM public.chamados_workflow_outbox_enqueue(
    gen_random_uuid(), v_done, v_workspace, v_cycle
  );

  -- Primeira página: os dois mais recentes AINDA SEM agendamento.
  SELECT array_agg(ticket_id ORDER BY updated_at DESC, ticket_id DESC), count(*)
  INTO v_ids, v_count
  FROM public.chamados_workflow_outbox_reconcile_candidates(1440, 2);
  IF v_count <> 2 OR NOT v_ids @> ARRAY[v_first, v_second] OR v_ids @> ARRAY[v_done] THEN
    RAISE EXCEPTION '119 FAIL: primeira página incorreta: ids=% count=%', v_ids, v_count;
  END IF;

  -- Segunda página: o cursor avançou; v_first/v_second não voltam a aparecer.
  SELECT array_agg(ticket_id ORDER BY updated_at DESC, ticket_id DESC), count(*)
  INTO v_ids, v_count
  FROM public.chamados_workflow_outbox_reconcile_candidates(1440, 2);
  IF v_count <> 1 OR NOT v_ids @> ARRAY[v_third] THEN
    RAISE EXCEPTION '119 FAIL: segunda página incorreta: ids=% count=%', v_ids, v_count;
  END IF;

  -- Fim da varredura.
  SELECT count(*) INTO v_count
  FROM public.chamados_workflow_outbox_reconcile_candidates(1440, 2);
  IF v_count <> 0 THEN
    RAISE EXCEPTION '119 FAIL: varredura repetiu candidatos: %', v_count;
  END IF;
END;
$$;

ROLLBACK;
