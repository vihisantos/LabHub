-- 114_notification_outbox_contract.sql
-- Verificação SOMENTE LEITURA do contrato criado pela migration 113.
--
-- Motivo: em Staging os objetos da 113 existiam sem o registro correspondente
-- em public.schema_migrations (DDL aplicado de forma ad-hoc). A correção é
-- rodar a 113 pelo runner oficial — o SQL dela é idempotente (IF NOT EXISTS /
-- OR REPLACE) e registra a versão na mesma transação — e esta migration prova,
-- no próprio banco, que tabela, colunas, índices, RLS, grants e funções conferem
-- com o esperado. Nenhum objeto é recriado e nada é escrito no histórico aqui.

DO $notification_outbox_contract$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_fn_names text[] := ARRAY[
    'notification_outbox_enqueue',
    'notification_create_with_outbox',
    'notification_outbox_claim_for_publish',
    'notification_outbox_mark_queued',
    'notification_outbox_release_publish',
    'notification_outbox_claim_event',
    'notification_outbox_complete',
    'notification_outbox_retry'
  ];
  v_fn_args text[] := ARRAY[
    'text, text, jsonb',
    'jsonb, jsonb',
    'text, integer, integer',
    'text, uuid',
    'text, uuid, text, integer',
    'text, text, integer',
    'text, uuid',
    'text, uuid, text, integer'
  ];
  v_column text;
  v_index text;
  v_rls boolean;
  v_force boolean;
  v_oid oid;
  v_config text;
  i integer;
BEGIN
  IF to_regclass('public.notification_outbox') IS NULL THEN
    RAISE EXCEPTION '114: public.notification_outbox ausente';
  END IF;

  FOREACH v_column IN ARRAY ARRAY[
    'event_id', 'notification_id', 'payload', 'status', 'attempts',
    'publish_attempts', 'available_at', 'published_at', 'locked_by',
    'lock_token', 'lock_expires_at', 'last_error', 'created_at',
    'updated_at', 'delivered_at'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notification_outbox'
        AND column_name = v_column
    ) THEN
      v_missing := array_append(v_missing, 'coluna ' || v_column);
    END IF;
  END LOOP;

  FOREACH v_index IN ARRAY ARRAY[
    'idx_notification_outbox_publish',
    'idx_notification_outbox_queued_recovery',
    'idx_notification_outbox_status_updated',
    'idx_notification_outbox_processing_lease'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'notification_outbox'
        AND indexname = v_index
    ) THEN
      v_missing := array_append(v_missing, 'indice ' || v_index);
    END IF;
  END LOOP;

  SELECT relrowsecurity, relforcerowsecurity INTO v_rls, v_force
  FROM pg_class
  WHERE oid = 'public.notification_outbox'::regclass;
  IF NOT coalesce(v_rls, false) OR NOT coalesce(v_force, false) THEN
    v_missing := array_append(v_missing, 'RLS ENABLE/FORCE');
  END IF;

  IF NOT has_table_privilege('service_role', 'public.notification_outbox', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.notification_outbox', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.notification_outbox', 'UPDATE') THEN
    v_missing := array_append(v_missing, 'grants de tabela para service_role');
  END IF;
  IF has_table_privilege('anon', 'public.notification_outbox', 'SELECT')
     OR has_table_privilege('authenticated', 'public.notification_outbox', 'SELECT') THEN
    v_missing := array_append(v_missing, 'grant indevido de tabela');
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
    RAISE EXCEPTION '114: contrato da migration 113 divergente: %',
      array_to_string(v_missing, '; ');
  END IF;
END;
$notification_outbox_contract$;
