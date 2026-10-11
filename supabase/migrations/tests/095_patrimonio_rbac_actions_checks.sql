-- =============================================================================
-- tests/095_patrimonio_rbac_actions_checks.sql — read-only, padrão da 036.
-- Matriz AJUSTADA: tec operacional; coordinator SOMENTE leitura (sem export);
-- vis/lider/demais: zero Actions; sem wildcards; scope=workspace.
-- =============================================================================

DO $$
DECLARE v_count integer; v_text text;
BEGIN
    -- 1. patrimonio.view: exatamente tec + coordinator
    SELECT count(*) INTO v_count FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    WHERE rp.action='patrimonio.view' AND rp.scope='workspace'
      AND r.slug IN ('tec','coordinator');
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'FAIL: patrimonio.view deve estar em tec+coordinator (encontradas %/2)', v_count;
    END IF;

    -- 2. Cada operação: exatamente 1 grant, e é do tec
    SELECT count(*) INTO v_count FROM public.role_permissions rp
    WHERE rp.action IN ('patrimonio.asset.create','patrimonio.asset.edit','patrimonio.asset.move',
                        'patrimonio.locations.manage','patrimonio.responsibles.manage',
                        'patrimonio.import.run','patrimonio.export')
      AND rp.scope='workspace';
    IF v_count <> 7 THEN
        RAISE EXCEPTION 'FAIL: operações de patrimonio devem ter 1 grant cada (encontradas %/7)', v_count;
    END IF;
    SELECT count(*) INTO v_count FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    WHERE rp.action IN ('patrimonio.asset.create','patrimonio.asset.edit','patrimonio.asset.move',
                        'patrimonio.locations.manage','patrimonio.responsibles.manage',
                        'patrimonio.import.run','patrimonio.export')
      AND r.slug <> 'tec';
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'FAIL: operação de patrimonio concedida fora de tec';
    END IF;

    -- 3. Coordenador: SEM exportação e SEM mutação (somente consulta)
    SELECT count(*) INTO v_count FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    WHERE r.slug='coordinator' AND rp.action LIKE 'patrimonio.%'
      AND rp.action <> 'patrimonio.view';
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'FAIL: coordinator tem Action de patrimonio além da leitura';
    END IF;

    -- 4. vis e lider: zero Actions de patrimônio
    SELECT count(*) INTO v_count FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    WHERE r.slug IN ('vis','lider') AND rp.action LIKE 'patrimonio.%';
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'FAIL: vis/lider com Actions de patrimonio';
    END IF;

    -- 5. Sem wildcards/genéricas e sem scope errado
    SELECT count(*) INTO v_count FROM public.role_permissions
    WHERE action LIKE 'patrimonio.%' AND (action LIKE '%*%' OR action = 'patrimonio.');
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'FAIL: Action de patrimonio com wildcard/genérica';
    END IF;
    SELECT count(*) INTO v_count FROM public.role_permissions
    WHERE action LIKE 'patrimonio.%' AND scope <> 'workspace';
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'FAIL: Action de patrimonio fora do scope workspace';
    END IF;

    RAISE NOTICE 'OK: 095 patrimonio rbac actions checks passed';
END $$;
