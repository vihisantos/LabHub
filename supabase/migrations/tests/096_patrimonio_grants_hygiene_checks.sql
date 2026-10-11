-- =============================================================================
-- tests/096_patrimonio_grants_hygiene_checks.sql
-- =============================================================================
-- Asserções estruturais da 096, executadas APÓS a cadeia completa. Qualquer
-- drift dispara RAISE EXCEPTION; execução limpa termina com NOTICE OK.
-- Read-only. Não presunção de default privileges de plataforma: aqui os
-- privilégios de `authenticated` vêm EXCLUSIVAMENTE das migrations.
-- =============================================================================

DO $$
DECLARE v_count integer;
BEGIN
    -- 1. append-only de asset_movements a nível de GRANT:
    --    sem UPDATE/DELETE/TRUNCATE; com SELECT/INSERT
    IF has_table_privilege('authenticated', 'public.asset_movements', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.asset_movements', 'DELETE')
       OR has_table_privilege('authenticated', 'public.asset_movements', 'TRUNCATE') THEN
        RAISE EXCEPTION 'FAIL: authenticated tem UPDATE/DELETE/TRUNCATE em asset_movements';
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.asset_movements', 'SELECT')
       OR NOT has_table_privilege('authenticated', 'public.asset_movements', 'INSERT') THEN
        RAISE EXCEPTION 'FAIL: authenticated perdeu SELECT/INSERT em asset_movements';
    END IF;

    -- 2. TRUNCATE revogado nas demais tabelas patrimoniais
    IF has_table_privilege('authenticated', 'public.assets', 'TRUNCATE')
       OR has_table_privilege('authenticated', 'public.patrimonio_locations', 'TRUNCATE')
       OR has_table_privilege('authenticated', 'public.patrimonio_responsibles', 'TRUNCATE') THEN
        RAISE EXCEPTION 'FAIL: authenticated ainda tem TRUNCATE em tabela patrimonial';
    END IF;

    -- 3. UPDATE/DELETE de assets/locations/responsibles PRESERVADOS (gated por RLS)
    IF NOT has_table_privilege('authenticated', 'public.assets', 'UPDATE')
       OR NOT has_table_privilege('authenticated', 'public.assets', 'DELETE')
       OR NOT has_table_privilege('authenticated', 'public.patrimonio_locations', 'UPDATE')
       OR NOT has_table_privilege('authenticated', 'public.patrimonio_locations', 'DELETE')
       OR NOT has_table_privilege('authenticated', 'public.patrimonio_responsibles', 'UPDATE')
       OR NOT has_table_privilege('authenticated', 'public.patrimonio_responsibles', 'DELETE') THEN
        RAISE EXCEPTION 'FAIL: DML autorizado de assets/locations/responsibles foi removido indevidamente';
    END IF;

    -- 4. service_role intacto (DML+TRUNCATE completos nas 4 tabelas)
    FOR v_count IN 1..1 LOOP
        IF NOT has_table_privilege('service_role', 'public.asset_movements', 'SELECT')
           OR NOT has_table_privilege('service_role', 'public.asset_movements', 'INSERT')
           OR NOT has_table_privilege('service_role', 'public.asset_movements', 'UPDATE')
           OR NOT has_table_privilege('service_role', 'public.asset_movements', 'DELETE')
           OR NOT has_table_privilege('service_role', 'public.assets', 'SELECT')
           OR NOT has_table_privilege('service_role', 'public.assets', 'INSERT')
           OR NOT has_table_privilege('service_role', 'public.patrimonio_locations', 'SELECT')
           OR NOT has_table_privilege('service_role', 'public.patrimonio_responsibles', 'SELECT') THEN
            RAISE EXCEPTION 'FAIL: service_role alterado pela 096';
        END IF;
    END LOOP;

    -- 5. anon sem nenhum privilégio nas 4 tabelas
    IF has_table_privilege('anon', 'public.asset_movements', 'SELECT')
       OR has_table_privilege('anon', 'public.assets', 'SELECT')
       OR has_table_privilege('anon', 'public.patrimonio_locations', 'SELECT')
       OR has_table_privilege('anon', 'public.patrimonio_responsibles', 'SELECT') THEN
        RAISE EXCEPTION 'FAIL: anon tem privilégios em tabela patrimonial';
    END IF;

    -- 6. RLS/policies intactas (2 em movements append-only; 4 nas demais)
    SELECT count(*) INTO v_count FROM pg_policies
    WHERE schemaname='public' AND tablename='asset_movements';
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'FAIL: policies de asset_movements alteradas (esperado 2, encontrado %)', v_count;
    END IF;
    SELECT count(*) INTO v_count FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('assets','patrimonio_locations','patrimonio_responsibles');
    IF v_count <> 12 THEN
        RAISE EXCEPTION 'FAIL: policies de assets/locations/responsibles alteradas (esperado 12, encontrado %)', v_count;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public'
                 AND c.relname IN ('asset_movements','assets','patrimonio_locations','patrimonio_responsibles')
                 AND NOT c.relrowsecurity) THEN
        RAISE EXCEPTION 'FAIL: RLS desabilitado em tabela patrimonial';
    END IF;

    -- 7. nenhum grant da 096 vazou para o Stock
    IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
               WHERE table_schema='stock' AND grantee='authenticated'
                 AND privilege_type='TRUNCATE') THEN
        RAISE EXCEPTION 'FAIL: TRUNCATE concedido a tabela do Stock';
    END IF;

    RAISE NOTICE 'OK: 096 patrimonio grants hygiene checks passed';
END $$;
