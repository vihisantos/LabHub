-- =============================================================================
-- tests/092_patrimonio_responsibles_checks.sql — read-only, padrão da 036.
-- =============================================================================

DO $$
DECLARE v_count integer; v_text text;
BEGIN
    IF to_regclass('public.patrimonio_responsibles') IS NULL THEN
        RAISE EXCEPTION 'FAIL: public.patrimonio_responsibles ausente';
    END IF;

    -- Colunas essenciais (responsável sem conta é cidadão de primeira classe)
    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema='public' AND table_name='patrimonio_responsibles'
      AND column_name IN ('id','workspace_id','nome','matricula','email','profile_id');
    IF v_count <> 6 THEN
        RAISE EXCEPTION 'FAIL: colunas de patrimonio_responsibles divergentes (esperado 6, encontrado %)', v_count;
    END IF;

    -- Uniques parciais: um registro por perfil e por matrícula, POR workspace
    SELECT count(*) INTO v_count FROM pg_indexes
    WHERE schemaname='public' AND tablename='patrimonio_responsibles'
      AND indexdef LIKE '%UNIQUE%WHERE%'
      AND (indexdef LIKE '%profile_id%' OR indexdef LIKE '%matricula%');
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'FAIL: uniques parciais (profile_id/matricula) ausentes (encontradas %/2)', v_count;
    END IF;

    -- profile_id é OPCIONAL (responsável sem conta) e aponta para profiles
    SELECT COUNT(*) INTO v_count FROM pg_constraint
    WHERE conrelid = 'public.patrimonio_responsibles'::regclass
      AND conname LIKE '%profile_id%fkey' AND confdeltype = 's';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'FAIL: FK de profile_id ausente ou ON DELETE incorreto';
    END IF;

    -- Gates de Action
    SELECT pg_get_expr(qual, 0) INTO v_text FROM pg_policies
    WHERE schemaname='public' AND tablename='patrimonio_responsibles' AND policyname='patrimonio_responsibles_select';
    IF v_text IS NULL OR position('patrimonio.view' in v_text) = 0 THEN
        RAISE EXCEPTION 'FAIL: select policy sem gate patrimonio.view';
    END IF;
    SELECT count(*) INTO v_count FROM pg_policies
    WHERE schemaname='public' AND tablename='patrimonio_responsibles'
      AND policyname IN ('patrimonio_responsibles_insert','patrimonio_responsibles_update','patrimonio_responsibles_delete')
      AND coalesce(pg_get_expr(with_check, 0), pg_get_expr(qual, 0)) LIKE '%patrimonio.responsibles.manage%';
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'FAIL: policies de escrita sem gate responsibles.manage (encontradas %/3)', v_count;
    END IF;

    IF has_table_privilege('anon', 'public.patrimonio_responsibles', 'SELECT') THEN
        RAISE EXCEPTION 'FAIL: anon ainda tem SELECT em patrimonio_responsibles';
    END IF;

    RAISE NOTICE 'OK: 092 patrimonio_responsibles checks passed';
END $$;
