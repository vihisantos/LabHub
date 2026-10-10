-- =============================================================================
-- tests/091_patrimonio_locations_checks.sql
-- =============================================================================
-- Asserções estruturais da 091. Rodar APÓS aplicar a migration. Qualquer drift
-- dispara RAISE EXCEPTION; execução limpa termina com NOTICE OK. Read-only.
-- =============================================================================

DO $$
DECLARE v_count integer; v_text text;
BEGIN
    -- 1. Tabela e colunas
    IF to_regclass('public.patrimonio_locations') IS NULL THEN
        RAISE EXCEPTION 'FAIL: public.patrimonio_locations ausente';
    END IF;
    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema='public' AND table_name='patrimonio_locations'
      AND column_name IN ('id','workspace_id','predio','andar','nome','complemento','notes','created_at','updated_at');
    IF v_count <> 9 THEN
        RAISE EXCEPTION 'FAIL: colunas de patrimonio_locations divergentes (esperado 9, encontrado %)', v_count;
    END IF;

    -- 2. UNIQUE por (workspace, predio, andar, nome)
    SELECT count(*) INTO v_count FROM pg_indexes
    WHERE schemaname='public' AND tablename='patrimonio_locations'
      AND indexdef LIKE '%UNIQUE%workspace_id, predio, andar, nome%';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'FAIL: unique (workspace,predio,andar,nome) ausente';
    END IF;

    -- 3. RLS habilitado
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                   WHERE n.nspname='public' AND c.relname='patrimonio_locations' AND c.relrowsecurity) THEN
        RAISE EXCEPTION 'FAIL: RLS nao habilitado em patrimonio_locations';
    END IF;

    -- 4. Policies: SELECT com patrimonio.view; INSERT/UPDATE/DELETE com locations.manage
    SELECT pg_get_expr(qual, 0) INTO v_text FROM pg_policies
    WHERE schemaname='public' AND tablename='patrimonio_locations' AND policyname='patrimonio_locations_select';
    IF v_text IS NULL OR position('patrimonio.view' in v_text) = 0 THEN
        RAISE EXCEPTION 'FAIL: select policy sem gate patrimonio.view';
    END IF;
    SELECT count(*) INTO v_count FROM pg_policies
    WHERE schemaname='public' AND tablename='patrimonio_locations'
      AND policyname IN ('patrimonio_locations_insert','patrimonio_locations_update','patrimonio_locations_delete')
      AND coalesce(pg_get_expr(with_check, 0), pg_get_expr(qual, 0)) LIKE '%patrimonio.locations.manage%';
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'FAIL: policies de escrita sem gate locations.manage (encontradas %/3)', v_count;
    END IF;

    -- 5. ACL: anon fora; authenticated dentro; service_role tudo
    IF has_table_privilege('anon', 'public.patrimonio_locations', 'SELECT') THEN
        RAISE EXCEPTION 'FAIL: anon ainda tem SELECT em patrimonio_locations';
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.patrimonio_locations', 'INSERT') THEN
        RAISE EXCEPTION 'FAIL: authenticated sem INSERT em patrimonio_locations';
    END IF;

    RAISE NOTICE 'OK: 091 patrimonio_locations checks passed';
END $$;
