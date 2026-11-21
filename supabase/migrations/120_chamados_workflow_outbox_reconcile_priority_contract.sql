-- 120_chamados_workflow_outbox_reconcile_priority_contract.sql
-- Verificação SOMENTE LEITURA da migration 119. Nenhum objeto é recriado.

DO $chamados_workflow_reconcile_priority_contract$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_config text;
  v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'chamados_tickets'
      AND indexname = 'idx_chamados_tickets_workflow_reconcile'
  ) THEN
    v_missing := array_append(v_missing, 'índice idx_chamados_tickets_workflow_reconcile');
  END IF;

  -- Função de hash: template/schema explícitos e grants restritos.
  IF to_regprocedure('public.chamados_workflow_sha256_hex(text)') IS NULL THEN
    v_missing := array_append(v_missing, 'função chamados_workflow_sha256_hex(text)');
  ELSE
    IF NOT has_function_privilege(
      'service_role', 'public.chamados_workflow_sha256_hex(text)', 'EXECUTE'
    ) THEN
      v_missing := array_append(v_missing, 'grant EXECUTE do hash para service_role');
    END IF;
    IF has_function_privilege('anon', 'public.chamados_workflow_sha256_hex(text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.chamados_workflow_sha256_hex(text)', 'EXECUTE') THEN
      v_missing := array_append(v_missing, 'grant EXECUTE indevido do hash');
    END IF;
  END IF;

  -- A RPC de candidatos continua invisível a papéis não privilegiados.
  SELECT array_to_string(coalesce(p.proconfig, ARRAY[]::text[]), ',')
  INTO v_config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'chamados_workflow_outbox_reconcile_candidates'
    AND pg_catalog.oidvectortypes(p.proargtypes) = 'integer, integer'
  LIMIT 1;
  IF coalesce(v_config, '') NOT LIKE '%search_path%' THEN
    v_missing := array_append(v_missing, 'search_path da RPC de candidatos');
  END IF;
  IF NOT has_function_privilege(
    'service_role', 'public.chamados_workflow_outbox_reconcile_candidates(integer,integer)', 'EXECUTE'
  ) THEN
    v_missing := array_append(v_missing, 'grant EXECUTE da RPC para service_role');
  END IF;

  SELECT pg_get_functiondef(
    'public.chamados_workflow_outbox_reconcile_candidates(integer,integer)'::regprocedure
  ) INTO v_def;
  IF v_def NOT LIKE '%NOT EXISTS%' OR v_def NOT LIKE '%ORDER BY c.updated_at ASC%'
     OR v_def NOT LIKE '%chamados_workflow_sha256_hex%' THEN
    v_missing := array_append(v_missing, 'seleção priorizada/FIFO ausente');
  END IF;
  -- Nenhum cursor persistente: um chamado criado depois do início da varredura
  -- não pode ficar preso atrás de um marcador antigo.
  IF v_def LIKE '%cursor%' THEN
    v_missing := array_append(v_missing, 'cursor persistente na RPC de candidatos');
  END IF;
  IF v_def LIKE '%SECURITY DEFINER%' THEN
    v_missing := array_append(v_missing, 'SECURITY DEFINER na RPC de candidatos');
  END IF;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION '120: contrato da migration 119 divergente: %',
      array_to_string(v_missing, '; ');
  END IF;
END;
$chamados_workflow_reconcile_priority_contract$;
