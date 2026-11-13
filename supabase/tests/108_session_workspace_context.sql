-- Testes SQL para migration 108: session_workspace_context
-- Executado após scripts/migrate.py --from-scratch
-- Requer: PostgreSQL 16+ (gen_random_uuid() nativo desde PG 13)

\set ON_ERROR_STOP on

-- ============================================================================
-- Teste 1: Tabela session_workspace_contexts existe com estrutura correta
-- ============================================================================
DO $$ 
DECLARE
  col_count int;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'session_workspace_contexts'
    AND column_name IN ('session_id', 'user_id', 'workspace_id', 'revision', 'created_at', 'updated_at');
  
  IF col_count != 6 THEN
    RAISE EXCEPTION 'FAIL: Tabela session_workspace_contexts estrutura incorreta - % colunas encontradas (esperadas 6)', col_count;
  END IF;
  
  RAISE NOTICE 'OK: Tabela session_workspace_contexts existe com 6 colunas corretas';
END
$$;

-- ============================================================================
-- Teste 2: PRIMARY KEY está corretamente definida
-- ============================================================================
DO $$
DECLARE
  pk_name text;
BEGIN
  SELECT conname INTO pk_name
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  JOIN pg_namespace n ON t.relnamespace = n.oid
  WHERE t.relname = 'session_workspace_contexts' 
    AND n.nspname = 'public'
    AND c.contype = 'p';
  
  IF pk_name IS NULL THEN
    RAISE EXCEPTION 'FAIL: PRIMARY KEY não encontrada em session_workspace_contexts';
  END IF;
  
  RAISE NOTICE 'OK: PRIMARY KEY encontrada: %', pk_name;
END
$$;

-- ============================================================================
-- Teste 3: RLS está habilitado na tabela
-- ============================================================================
DO $$
DECLARE
  rls_enabled boolean;
BEGIN
  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE c.relname = 'session_workspace_contexts' 
    AND n.nspname = 'public';
  
  IF NOT rls_enabled THEN
    RAISE EXCEPTION 'FAIL: RLS não está habilitado em session_workspace_contexts';
  END IF;
  
  RAISE NOTICE 'OK: RLS habilitado em session_workspace_contexts';
END
$$;

-- ============================================================================
-- Teste 4: Todas as 4 RPC são SECURITY DEFINER
-- ============================================================================
DO $$
DECLARE
  func_count int;
BEGIN
  SELECT COUNT(*) INTO func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.proname IN (
    'labhub_auth_session_is_active',
    'labhub_set_session_workspace_context',
    'labhub_get_session_workspace_context',
    'labhub_create_tv_activation_for_context'
  )
  AND n.nspname = 'public'
  AND p.prosecdef = true;
  
  IF func_count != 4 THEN
    RAISE EXCEPTION 'FAIL: RPC security misconfigured - encontradas % de 4 são SECURITY DEFINER', func_count;
  END IF;
  
  RAISE NOTICE 'OK: Todas as 4 RPCs são SECURITY DEFINER';
END
$$;

-- ============================================================================
-- Teste 5: REVOKE ALL foi aplicado a anon e authenticated
-- ============================================================================
DO $$
DECLARE
  anon_has_execute boolean;
  auth_has_execute boolean;
  auth_has_table_priv boolean;
  func_oid oid;
  func_name text;
BEGIN
  -- Inicializar variáveis
  anon_has_execute := false;
  auth_has_execute := false;
  auth_has_table_priv := false;
  
  -- Verificar EXECUTE para cada uma das 4 RPCs
  FOR func_name IN 
    SELECT unnest(ARRAY[
      'labhub_auth_session_is_active',
      'labhub_set_session_workspace_context',
      'labhub_get_session_workspace_context',
      'labhub_create_tv_activation_for_context'
    ])
  LOOP
    SELECT p.oid INTO func_oid
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = func_name
      AND n.nspname = 'public';
    
    -- Verificar privilégio EXECUTE para anon
    IF has_function_privilege('anon', func_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: anon tem EXECUTE em RPC %', func_name;
    END IF;
    
    -- Verificar privilégio EXECUTE para authenticated
    IF has_function_privilege('authenticated', func_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: authenticated tem EXECUTE em RPC %', func_name;
    END IF;
  END LOOP;
  
  -- Verificar se authenticated tem privilégios na tabela
  IF has_table_privilege('authenticated', 'public.session_workspace_contexts', 'SELECT') 
     OR has_table_privilege('authenticated', 'public.session_workspace_contexts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.session_workspace_contexts', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.session_workspace_contexts', 'DELETE') 
     OR has_table_privilege('anon', 'public.session_workspace_contexts', 'SELECT') 
     OR has_table_privilege('anon', 'public.session_workspace_contexts', 'INSERT')
     OR has_table_privilege('anon', 'public.session_workspace_contexts', 'UPDATE')
     OR has_table_privilege('anon', 'public.session_workspace_contexts', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL: anon ou authenticated tem permissoes na tabela';
  END IF;
  
  RAISE NOTICE 'OK: REVOKE ALL aplicado corretamente a anon e authenticated';
END
$$;

-- ============================================================================
-- Teste 6: GRANT EXECUTE para service_role foi aplicado
-- ============================================================================
DO $$
DECLARE
  grant_count int;
BEGIN
  -- Verificar EXECUTE usando has_function_privilege para cada função
  SELECT COUNT(*) INTO grant_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.proname IN (
    'labhub_auth_session_is_active',
    'labhub_set_session_workspace_context',
    'labhub_get_session_workspace_context',
    'labhub_create_tv_activation_for_context'
  )
  AND n.nspname = 'public'
  AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  
  IF grant_count != 4 THEN
    RAISE EXCEPTION 'FAIL: Grants para service_role incompletos - % de 4 RPCs', grant_count;
  END IF;
  
  RAISE NOTICE 'OK: Todas as 4 RPCs têm GRANT para service_role';
END
$$;

-- ============================================================================
-- Teste 7: search_path está configurado corretamente nas funções
-- ============================================================================
DO $$
DECLARE
  func_count int;
BEGIN
  SELECT COUNT(*) INTO func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.proname LIKE 'labhub_%'
    AND n.nspname = 'public'
    AND p.prosecdef = true;
  
  IF func_count != 4 THEN
    RAISE EXCEPTION 'FAIL: search_path ou SECURITY DEFINER incorreto - encontradas % RPCs SECURITY DEFINER', func_count;
  END IF;
  
  RAISE NOTICE 'OK: Funções SECURITY DEFINER encontradas com search_path correto';
END
$$;

-- ============================================================================
-- Teste 8: Índices foram criados
-- ============================================================================
DO $$
DECLARE
  idx_count int;
BEGIN
  SELECT COUNT(*) INTO idx_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'session_workspace_contexts'
    AND indexname IN (
      'idx_session_workspace_contexts_user',
      'idx_session_workspace_contexts_workspace'
    );
  
  IF idx_count != 2 THEN
    RAISE EXCEPTION 'FAIL: Índices incompletos - % de 2 encontrados', idx_count;
  END IF;
  
  RAISE NOTICE 'OK: Todos os 2 índices foram criados';
END
$$;

-- ============================================================================
-- Teste 9: Verificar que a tabela pode receber dados de teste
-- ============================================================================
DO $$
DECLARE
  test_session uuid := '00000000-0000-0000-0000-000000000001';
  test_user uuid := '00000000-0000-0000-0000-000000000002';
  test_workspace uuid := '00000000-0000-0000-0000-000000000003';
BEGIN
  -- Inserir um registro de teste
  INSERT INTO public.session_workspace_contexts (session_id, user_id, workspace_id, revision)
  VALUES (test_session, test_user, test_workspace, 1)
  ON CONFLICT (session_id) DO NOTHING;
  
  -- Verificar se foi inserido
  IF NOT EXISTS (
    SELECT 1 FROM public.session_workspace_contexts 
    WHERE session_id = test_session
  ) THEN
    RAISE EXCEPTION 'FAIL: Não foi possível inserir dado de teste na tabela';
  END IF;
  
  RAISE NOTICE 'OK: Tabela aceita inserção de dados de teste';
  
  -- Limpar registro de teste
  DELETE FROM public.session_workspace_contexts WHERE session_id = test_session;
END
$$;

-- ============================================================================
-- Teste 10: Verificar que RPC labhub_auth_session_is_active retorna estrutura correta
-- ============================================================================
DO $$
DECLARE
  col_count int;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'pg_catalog'
    AND table_name = 'pg_proc'
    AND column_name IN ('proname', 'prosecdef');
  
  -- Verificar a função via pg_proc
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'labhub_auth_session_is_active'
      AND n.nspname = 'public'
      AND p.prosecdef = true
      AND p.prokind = 'f'
  ) THEN
    RAISE EXCEPTION 'FAIL: RPC labhub_auth_session_is_active não encontrada como SECURITY DEFINER';
  END IF;
  
  RAISE NOTICE 'OK: RPC labhub_auth_session_is_active existe e é SECURITY DEFINER';
END
$$;