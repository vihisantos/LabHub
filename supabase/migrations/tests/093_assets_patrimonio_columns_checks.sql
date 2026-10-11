-- =============================================================================
-- tests/093_assets_patrimonio_columns_checks.sql — read-only, padrão da 036.
-- =============================================================================

DO $$
DECLARE v_count integer; v_text text;
BEGIN
    -- 1. Colunas novas em public.assets
    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema='public' AND table_name='assets'
      AND column_name IN ('responsible_id','condition');
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'FAIL: colunas patrimonio ausentes em assets (encontradas %/2)', v_count;
    END IF;

    -- 2. Constraints de domínio
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='assets_condition_check'
                   AND pg_get_constraintdef(oid) LIKE '%danificado%') THEN
        RAISE EXCEPTION 'FAIL: assets_condition_check ausente/incorreto';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='assets_status_check'
                   AND pg_get_constraintdef(oid) LIKE '%em_transito%'
                   AND pg_get_constraintdef(oid) LIKE '%nao_localizado%') THEN
        RAISE EXCEPTION 'FAIL: assets_status_check ausente ou sem os status da matriz';
    END IF;

    -- 3. FKs "quentes" com ON DELETE RESTRICT (fecham bypass de histórico)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='assets_location_fk'
                   AND confdeltype = 'r') THEN
        RAISE EXCEPTION 'FAIL: assets_location_fk ausente ou sem ON DELETE RESTRICT';
    END IF;
    SELECT count(*) INTO v_count FROM pg_constraint
    WHERE conrelid='public.assets'::regclass AND contype='f'
      AND confdeltype='r' AND (pg_get_constraintdef(oid) LIKE '%patrimonio_responsibles%');
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'FAIL: FK de responsible_id ausente ou sem RESTRICT';
    END IF;

    -- 4. Policies endurecidas: INSERT=asset.create, UPDATE=asset.edit,
    --    SELECT=patrimonio.view, DELETE=super admin apenas
    SELECT coalesce(with_check, '') INTO v_text FROM pg_policies
    WHERE schemaname='public' AND tablename='assets' AND policyname='public_assets_insert';
    IF v_text NOT LIKE '%patrimonio.asset.create%' THEN
        RAISE EXCEPTION 'FAIL: public_assets_insert sem gate patrimonio.asset.create';
    END IF;
    SELECT with_check INTO v_text FROM pg_policies
    WHERE schemaname='public' AND tablename='assets' AND policyname='public_assets_update';
    IF v_text NOT LIKE '%patrimonio.asset.edit%' THEN
        RAISE EXCEPTION 'FAIL: public_assets_update sem gate patrimonio.asset.edit';
    END IF;
    SELECT qual INTO v_text FROM pg_policies
    WHERE schemaname='public' AND tablename='assets' AND policyname='public_assets_select';
    IF v_text NOT LIKE '%patrimonio.view%' THEN
        RAISE EXCEPTION 'FAIL: public_assets_select sem gate patrimonio.view';
    END IF;
    SELECT qual INTO v_text FROM pg_policies
    WHERE schemaname='public' AND tablename='assets' AND policyname='public_assets_delete';
    IF v_text IS NULL OR v_text NOT LIKE '%is_super_admin%' OR v_text LIKE '%user_has_action%' THEN
        RAISE EXCEPTION 'FAIL: public_assets_delete deve ser exclusivo de super admin';
    END IF;

    -- 5. Índice composto para deduplicação de importação
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='assets'
                   AND indexdef LIKE '%workspace_id, serial_number%') THEN
        RAISE EXCEPTION 'FAIL: indice (workspace_id, serial_number) ausente';
    END IF;

    -- 6. Grants normalizados (não dependem de default privileges da plataforma)
    IF has_table_privilege('anon', 'public.assets', 'SELECT')
       OR has_table_privilege('anon', 'public.assets', 'INSERT') THEN
        RAISE EXCEPTION 'FAIL: anon ainda tem privilégios em public.assets';
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.assets', 'SELECT')
       OR NOT has_table_privilege('authenticated', 'public.assets', 'INSERT')
       OR NOT has_table_privilege('authenticated', 'public.assets', 'UPDATE') THEN
        RAISE EXCEPTION 'FAIL: authenticated sem DML em public.assets';
    END IF;

    RAISE NOTICE 'OK: 093 assets patrimonio columns checks passed';
END $$;
