-- 118_chamados_workflow_outbox_reconcile_contract.sql
-- Verificação SOMENTE LEITURA do contrato criado pela migration 117.
-- Nenhum objeto é recriado; nenhum dado é escrito aqui.

DO $chamados_workflow_outbox_reconcile_contract$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_fn_names text[] := ARRAY[
    'chamados_workflow_outbox_reconcile_tick',
    'chamados_workflow_outbox_reconcile_candidates'
  ];
  v_fn_args text[] := ARRAY[
    'integer',
    'integer, integer'
  ];
  v_column text;
  v_rls boolean;
  v_force boolean;
  v_oid oid;
  v_config text;
  i integer;
BEGIN
  IF to_regclass('public.chamados_workflow_reconcile_state') IS NULL THEN
    RAISE EXCEPTION '118: public.chamados_workflow_reconcile_state ausente';
  END IF;

  FOREACH v_column IN ARRAY ARRAY['singleton', 'last_run_at'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'chamados_workflow_reconcile_state'
        AND column_name = v_column
    ) THEN
      v_missing := array_append(v_missing, 'coluna ' || v_column);
    END IF;
  END LOOP;

  SELECT relrowsecurity, relforcerowsecurity INTO v_rls, v_force
  FROM pg_class
  WHERE oid = 'public.chamados_workflow_reconcile_state'::regclass;
  IF NOT coalesce(v_rls, false) OR NOT coalesce(v_force, false) THEN
    v_missing := array_append(v_missing, 'RLS ENABLE/FORCE');
  END IF;

  IF NOT has_table_privilege('service_role', 'public.chamados_workflow_reconcile_state', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.chamados_workflow_reconcile_state', 'UPDATE') THEN
    v_missing := array_append(v_missing, 'grants de tabela para service_role');
  END IF;
  IF has_table_privilege('anon', 'public.chamados_workflow_reconcile_state', 'SELECT')
     OR has_table_privilege('authenticated', 'public.chamados_workflow_reconcile_state', 'SELECT') THEN
    v_missing := array_append(v_missing, 'grant indevido de tabela');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.chamados_workflow_reconcile_state WHERE singleton
  ) THEN
    v_missing := array_append(v_missing, 'linha singleton ausente');
  END IF;

  FOR i IN 1 .. array_length(v_fn_names, 1) LOOP
    SELECT p.oid, array_to_string(coalesce(p.proconfig, ARRAY[]::text[]), ',')
      INTO v_oid, v_config
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = v_fn_names[i]
      AND pg_catalog.oidvectortypes(p.proargtypes) = v_fn_args[i]
    ORDER BY p.oid
    LIMIT 1;

    IF v_oid IS NULL THEN
      v_missing := array_append(
        v_missing, 'funcao ' || v_fn_names[i] || '(' || v_fn_args[i] || ')'
      );
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_oid AND prosecdef) THEN
      v_missing := array_append(v_missing, 'SECURITY DEFINER em ' || v_fn_names[i]);
    END IF;
    IF coalesce(v_config, '') NOT LIKE '%search_path%' THEN
      v_missing := array_append(v_missing, 'search_path em ' || v_fn_names[i]);
    END IF;
    IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      v_missing := array_append(v_missing, 'grant EXECUTE em ' || v_fn_names[i]);
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE')
       OR has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR has_function_privilege('public', v_oid, 'EXECUTE') THEN
      v_missing := array_append(v_missing, 'grant EXECUTE indevido em ' || v_fn_names[i]);
    END IF;
  END LOOP;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION '118: contrato da migration 117 divergente: %',
      array_to_string(v_missing, '; ');
  END IF;
END;
$chamados_workflow_outbox_reconcile_contract$;
