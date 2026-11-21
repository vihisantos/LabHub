-- =============================================================================
-- Migration 119: priorização de agendamentos ausentes + lotes FIFO limitados.
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
  v_new uuid := gen_random_uuid();
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

  -- Timestamps fixos tornam a ordem FIFO determinística.
  INSERT INTO public.chamados_tickets (id, "workspace_id", status, "assignedToUserId", "updatedAt")
  VALUES
    (v_done,   v_workspace, 'aberto', '', '2026-11-21 12:00:00+00'::timestamptz),
    (v_first,  v_workspace, 'aberto', '', '2026-11-21 12:01:00+00'::timestamptz),
    (v_second, v_workspace, 'aberto', '', '2026-11-21 12:02:00+00'::timestamptz),
    (v_third,  v_workspace, 'aberto', '', '2026-11-21 12:03:00+00'::timestamptz);

  -- v_done já tem agendamento para o ciclo vigente: não deve ser candidato.
  SELECT public.chamados_workflow_sha256_hex(
    v_done::text || ':' || v_workspace::text || ':'
    || to_char(
         (SELECT "updatedAt" FROM public.chamados_tickets WHERE id = v_done) AT TIME ZONE 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"'
       )
    || ':{"assignedToUserId": "", "status": "aberto"}'
  ) INTO v_cycle;
  PERFORM public.chamados_workflow_outbox_enqueue(
    gen_random_uuid(), v_done, v_workspace, v_cycle
  );

  -- Primeiro lote: os dois mais antigos AINDA SEM agendamento, em ordem FIFO.
  SELECT array_agg(ticket_id ORDER BY updated_at ASC, ticket_id ASC), count(*)
  INTO v_ids, v_count
  FROM public.chamados_workflow_outbox_reconcile_candidates(1440, 2);
  IF v_ids <> ARRAY[v_first, v_second] OR v_count <> 2 THEN
    RAISE EXCEPTION '119 FAIL: primeiro lote incorreto: ids=% count=%', v_ids, v_count;
  END IF;

  -- Enfileira o primeiro lote e cria um chamado NOVO (mais recente) antes do
  -- próximo tick. Sem cursor persistente, ele não fica invisível.
  SELECT public.chamados_workflow_sha256_hex(
    t.id::text || ':' || t."workspace_id"::text || ':'
    || to_char(t."updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"')
    || ':{"assignedToUserId": "", "status": "aberto"}'
  ) INTO v_cycle
  FROM public.chamados_tickets AS t WHERE t.id = v_first;
  PERFORM public.chamados_workflow_outbox_enqueue(
    gen_random_uuid(), v_first, v_workspace, v_cycle
  );

  SELECT public.chamados_workflow_sha256_hex(
    t.id::text || ':' || t."workspace_id"::text || ':'
    || to_char(t."updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"')
    || ':{"assignedToUserId": "", "status": "aberto"}'
  ) INTO v_cycle
  FROM public.chamados_tickets AS t WHERE t.id = v_second;
  PERFORM public.chamados_workflow_outbox_enqueue(
    gen_random_uuid(), v_second, v_workspace, v_cycle
  );

  INSERT INTO public.chamados_tickets (id, "workspace_id", status, "assignedToUserId", "updatedAt")
  VALUES (v_new, v_workspace, 'aberto', '', '2026-11-21 12:04:00+00'::timestamptz);

  -- Segundo lote: v_third e o chamado criado depois da primeira varredura.
  SELECT array_agg(ticket_id ORDER BY updated_at ASC, ticket_id ASC), count(*)
  INTO v_ids, v_count
  FROM public.chamados_workflow_outbox_reconcile_candidates(1440, 2);
  IF v_ids <> ARRAY[v_third, v_new] OR v_count <> 2 THEN
    RAISE EXCEPTION '119 FAIL: segundo lote incorreto: ids=% count=%', v_ids, v_count;
  END IF;

  -- Fim da varredura: nenhum candidato se repete.
  SELECT count(*) INTO v_count
  FROM public.chamados_workflow_outbox_reconcile_candidates(1440, 2);
  IF v_count <> 0 THEN
    RAISE EXCEPTION '119 FAIL: varredura repetiu candidatos: %', v_count;
  END IF;
END;
$$;

ROLLBACK;
