-- =============================================================================
-- tests/097_assets_create_guard_checks.sql — read-only, padrão da 036.
-- =============================================================================

DO $$
DECLARE
    v_count integer;
    v_text text;
BEGIN
    IF to_regclass('public.assets') IS NULL THEN
        RAISE EXCEPTION 'FAIL: public.assets ausente';
    END IF;

    -- 1. Guarda de criação existe e é BEFORE INSERT em assets
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                   JOIN pg_namespace n ON n.oid=c.relnamespace
                   WHERE n.nspname='public' AND c.relname='assets' AND NOT t.tgisinternal
                   AND t.tgname='trg_assets_patrimonio_create_guard') THEN
        RAISE EXCEPTION 'FAIL: trigger trg_assets_patrimonio_create_guard ausente';
    END IF;
    IF (SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='assets' AND t.tgname='trg_assets_patrimonio_create_guard')
        NOT LIKE '%BEFORE INSERT%' THEN
        RAISE EXCEPTION 'FAIL: trg_assets_patrimonio_create_guard deve ser BEFORE INSERT';
    END IF;

    -- 2. assets passa a ter EXATAMENTE 3 triggers não-internos (guard 094,
    --    history 094, create_guard 097) — evita trigger de criação desaparecida
    SELECT count(*) INTO v_count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='assets' AND NOT t.tgisinternal;
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'FAIL: assets deve ter exatamente 3 triggers (guard/history/create_guard) - encontradas %', v_count;
    END IF;

    -- 3. Função SECURITY DEFINER com search_path fixo (padrão 094/097)
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname='patrimonio_assets_create_guard'
                   AND p.prosecdef
                   AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path%')) THEN
        RAISE EXCEPTION 'FAIL: patrimonio_assets_create_guard deve ser SECURITY DEFINER com search_path fixo';
    END IF;

    -- 4. A guarda valida AMBOS os campos e barra cross-workspace por 42501
    SELECT p.prosrc INTO v_text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='patrimonio_assets_create_guard';
    IF v_text NOT LIKE '%location_id%' OR v_text NOT LIKE '%responsible_id%' THEN
        RAISE EXCEPTION 'FAIL: guarda de criação não valida location_id/responsible_id';
    END IF;
    IF v_text NOT LIKE '%patrimonio_locations WHERE id = NEW.location_id%' THEN
        RAISE EXCEPTION 'FAIL: guarda não consulta a unidade do local inicial';
    END IF;
    IF v_text NOT LIKE '%patrimonio_responsibles WHERE id = NEW.responsible_id%' THEN
        RAISE EXCEPTION 'FAIL: guarda não consulta a unidade do responsável inicial';
    END IF;
    IF v_text NOT LIKE '%IS DISTINCT FROM NEW.workspace_id%' THEN
        RAISE EXCEPTION 'FAIL: guarda não compara a unidade da referência com a do ativo';
    END IF;

    RAISE NOTICE 'OK: 097 assets_create_guard checks passed';
END $$;