-- =============================================================================
-- Migration 108: comportamento real da RPC em PostgreSQL efêmero.
-- Tudo é executado em uma transação e revertido no final.
-- =============================================================================
BEGIN;

DO $$
DECLARE
  v_ws_a uuid;
  v_ws_b uuid;
  v_old uuid;
  v_recent uuid;
  v_reopened uuid;
  v_already_archived uuid;
  v_other_workspace uuid;
  v_count integer;
  v_events integer;
  v_audits integer;
BEGIN
  INSERT INTO public.workspaces (name, slug)
  VALUES ('CI auto archive A', 'ci-auto-archive-a-' || gen_random_uuid()::text)
  RETURNING id INTO v_ws_a;

  INSERT INTO public.workspaces (name, slug)
  VALUES ('CI auto archive B', 'ci-auto-archive-b-' || gen_random_uuid()::text)
  RETURNING id INTO v_ws_b;

  -- Elegível: resolvido há mais de 30 minutos.
  INSERT INTO public.chamados_tickets
    (workspace_id, status, "resolvedAt", "ticketNumber", "roomName")
  VALUES
    (v_ws_a, 'resolvido', clock_timestamp() - interval '31 minutes',
     floor(random() * 1000000)::integer, 'CI sala antiga')
  RETURNING id INTO v_old;

  -- Ainda dentro da janela: não pode fechar.
  INSERT INTO public.chamados_tickets
    (workspace_id, status, "resolvedAt", "ticketNumber", "roomName")
  VALUES
    (v_ws_a, 'resolvido', clock_timestamp() - interval '29 minutes',
     floor(random() * 1000000)::integer, 'CI sala recente')
  RETURNING id INTO v_recent;

  -- Foi reaberto: resolvedAt antigo não pode provocar fechamento.
  INSERT INTO public.chamados_tickets
    (workspace_id, status, "resolvedAt", "ticketNumber", "roomName")
  VALUES
    (v_ws_a, 'aberto', clock_timestamp() - interval '2 hours',
     floor(random() * 1000000)::integer, 'CI sala reaberta')
  RETURNING id INTO v_reopened;

  -- Já arquivado: não pode gerar novo evento/auditoria.
  INSERT INTO public.chamados_tickets
    (workspace_id, status, "resolvedAt", archived, "ticketNumber", "roomName")
  VALUES
    (v_ws_a, 'resolvido', clock_timestamp() - interval '2 hours', true,
     floor(random() * 1000000)::integer, 'CI sala arquivada')
  RETURNING id INTO v_already_archived;

  -- Elegível, mas fora do workspace informado na primeira chamada.
  INSERT INTO public.chamados_tickets
    (workspace_id, status, "resolvedAt", "ticketNumber", "roomName")
  VALUES
    (v_ws_b, 'resolvido', clock_timestamp() - interval '45 minutes',
     floor(random() * 1000000)::integer, 'CI outro workspace')
  RETURNING id INTO v_other_workspace;

  -- Escopo limitado: somente o ticket antigo do workspace A.
  SELECT count(*) INTO v_count
  FROM public.auto_archive_resolved_tickets(ARRAY[v_ws_a]);

  IF v_count <> 1 THEN
    RAISE EXCEPTION '108 FAIL: esperava 1 ticket no workspace A, retornou %', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.chamados_tickets
    WHERE id = v_old AND status = 'fechado' AND archived IS TRUE
      AND "closedBy" = 'Sistema' AND "closedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION '108 FAIL: ticket elegível não foi fechado corretamente';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.chamados_tickets
    WHERE id IN (v_recent, v_reopened, v_already_archived, v_other_workspace)
      AND (status = 'fechado' AND archived IS TRUE)
  ) THEN
    RAISE EXCEPTION '108 FAIL: ticket recente, reaberto, já arquivado ou de outro workspace foi alterado';
  END IF;

  SELECT count(*) INTO v_events
  FROM public.ticket_events
  WHERE "ticket_id" = v_old
    AND type = 'status'
    AND content = 'Arquivado pelo sistema'
    AND author = 'Sistema'
    AND "newStatus" = 'fechado';

  IF v_events <> 1 THEN
    RAISE EXCEPTION '108 FAIL: esperado 1 evento de timeline, encontrado %', v_events;
  END IF;

  SELECT count(*) INTO v_audits
  FROM public.app_audit_logs
  WHERE entity = 'ticket'
    AND entity_id = v_old::text
    AND action = 'auto_archived'
    AND actor_name = 'Sistema'
    AND workspace_id = v_ws_a
    AND meta->>'origin' = 'auto_archive_resolved_30m';

  IF v_audits <> 1 THEN
    RAISE EXCEPTION '108 FAIL: esperado 1 registro de auditoria, encontrado %', v_audits;
  END IF;

  -- Idempotência: segunda execução não retorna nem duplica registros.
  SELECT count(*) INTO v_count
  FROM public.auto_archive_resolved_tickets(ARRAY[v_ws_a]);

  IF v_count <> 0 THEN
    RAISE EXCEPTION '108 FAIL: segunda execução retornou % tickets', v_count;
  END IF;

  SELECT count(*) INTO v_events
  FROM public.ticket_events
  WHERE "ticket_id" = v_old AND content = 'Arquivado pelo sistema';

  SELECT count(*) INTO v_audits
  FROM public.app_audit_logs
  WHERE entity_id = v_old::text AND action = 'auto_archived';

  IF v_events <> 1 OR v_audits <> 1 THEN
    RAISE EXCEPTION '108 FAIL: idempotência falhou (eventos %, auditorias %)', v_events, v_audits;
  END IF;

  -- A segunda workspace só é processada quando explicitamente incluída.
  SELECT count(*) INTO v_count
  FROM public.auto_archive_resolved_tickets(ARRAY[v_ws_b]);

  IF v_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.chamados_tickets
    WHERE id = v_other_workspace AND status = 'fechado' AND archived IS TRUE
  ) THEN
    RAISE EXCEPTION '108 FAIL: workspace B não foi processado isoladamente';
  END IF;

  -- Privilégios: RPC restrita ao service_role.
  IF has_function_privilege('anon', 'public.auto_archive_resolved_tickets(uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.auto_archive_resolved_tickets(uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.auto_archive_resolved_tickets(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION '108 FAIL: grants da RPC não correspondem ao contrato esperado';
  END IF;

  -- Concorrência: a implementação precisa manter o lock por linha e ignorar
  -- linhas já bloqueadas, evitando que duas execuções processem o mesmo ticket.
  IF pg_get_functiondef('public.auto_archive_resolved_tickets(uuid[])'::regprocedure)
       NOT ILIKE '%FOR UPDATE SKIP LOCKED%' THEN
    RAISE EXCEPTION '108 FAIL: RPC sem FOR UPDATE SKIP LOCKED';
  END IF;

  RAISE NOTICE 'OK: migration 108 behavioral checks passed';
END
$$;

ROLLBACK;
