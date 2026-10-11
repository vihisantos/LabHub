-- =============================================================================
-- tests/094_asset_movements_checks.sql — read-only, padrão da 036.
-- =============================================================================

DO $$
DECLARE v_count integer; v_text text;
BEGIN
    IF to_regclass('public.asset_movements') IS NULL THEN
        RAISE EXCEPTION 'FAIL: public.asset_movements ausente';
    END IF;

    -- 1. Append-only: EXATAMENTE 2 policies (select/insert) e NENHUMA de UPDATE/DELETE
    SELECT count(*) INTO v_count FROM pg_policies
    WHERE schemaname='public' AND tablename='asset_movements';
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'FAIL: asset_movements deve ter exatamente 2 policies (encontradas %)', v_count;
    END IF;
    SELECT count(*) INTO v_count FROM pg_policies
    WHERE schemaname='public' AND tablename='asset_movements' AND cmd IN ('UPDATE','DELETE');
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'FAIL: asset_movements tem policy de UPDATE/DELETE - historico seria reescritavel';
    END IF;

    -- 2. Grants: authenticated SEM UPDATE/DELETE; anon sem nada
    IF has_table_privilege('authenticated', 'public.asset_movements', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.asset_movements', 'DELETE') THEN
        RAISE EXCEPTION 'FAIL: authenticated nao pode ter UPDATE/DELETE em asset_movements';
    END IF;
    IF has_table_privilege('anon', 'public.asset_movements', 'SELECT') THEN
        RAISE EXCEPTION 'FAIL: anon ainda tem SELECT em asset_movements';
    END IF;

    -- 3. Gates: SELECT=patrimonio.view; INSERT=patrimonio.asset.move
    SELECT qual INTO v_text FROM pg_policies
    WHERE schemaname='public' AND tablename='asset_movements' AND policyname='asset_movements_select';
    IF v_text NOT LIKE '%patrimonio.view%' THEN
        RAISE EXCEPTION 'FAIL: select de movimentos sem gate patrimonio.view';
    END IF;
    SELECT with_check INTO v_text FROM pg_policies
    WHERE schemaname='public' AND tablename='asset_movements' AND policyname='asset_movements_insert';
    IF v_text NOT LIKE '%patrimonio.asset.move%' THEN
        RAISE EXCEPTION 'FAIL: insert de movimentos sem gate patrimonio.asset.move';
    END IF;

    -- 4. Triggers e funções SECURITY DEFINER
    SELECT count(*) INTO v_count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='assets' AND NOT t.tgisinternal
      AND t.tgname IN ('trg_assets_patrimonio_guard','trg_assets_patrimonio_history');
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'FAIL: triggers de assets ausentes (guard/history)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                   JOIN pg_namespace n ON n.oid=c.relnamespace
                   WHERE n.nspname='public' AND c.relname='asset_movements' AND NOT t.tgisinternal
                   AND t.tgname='trg_asset_movements_apply' AND (t.tgtype & 7) = 7) THEN
        RAISE EXCEPTION 'FAIL: trigger trg_asset_movements_apply ausente ou nao e BEFORE INSERT';
    END IF;
    SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('patrimonio_assets_guard','patrimonio_asset_created_history','patrimonio_apply_movement')
      AND p.prosecdef
      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path%');
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'FAIL: funções do patrimonio devem ser SECURITY DEFINER com search_path fixo (encontradas %/3)', v_count;
    END IF;

    -- 5. Guarda usa pg_trigger_depth (cliente não pode forjar) e bloqueia
    --    workspace mutável
    SELECT p.prosrc INTO v_text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='patrimonio_assets_guard';
    IF v_text NOT LIKE '%pg_trigger_depth%' THEN
        RAISE EXCEPTION 'FAIL: guarda sem pg_trigger_depth';
    END IF;
    IF v_text NOT LIKE '%workspace_id IS DISTINCT FROM OLD.workspace_id%' THEN
        RAISE EXCEPTION 'FAIL: guarda não trava workspace_id mutável';
    END IF;

    -- 6. Motor: trava movimento cross-workspace e criacao forjada
    SELECT p.prosrc INTO v_text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='patrimonio_apply_movement';
    IF v_text NOT LIKE '%movimento em workspace diferente do ativo%'
       OR v_text NOT LIKE '%gerado automaticamente no INSERT do ativo%' THEN
        RAISE EXCEPTION 'FAIL: motor sem travas de workspace/criacao';
    END IF;

    RAISE NOTICE 'OK: 094 asset_movements checks passed';
END $$;
