-- =============================================================================
-- 095_patrimonio_rbac_actions.sql
-- =============================================================================
-- Issue #289 — Patrimônio institucional de TI (PR-1, matriz de acesso AJUSTADA).
--
-- Matriz efetiva (substitui propostas anteriores):
--   patrimonio.view                → tec, coordinator   (leitura de DADO — RLS)
--   patrimonio.asset.create        → tec
--   patrimonio.asset.edit          → tec
--   patrimonio.asset.move          → tec   (INSERT em asset_movements)
--   patrimonio.locations.manage    → tec
--   patrimonio.responsibles.manage → tec
--   patrimonio.import.run          → tec
--   patrimonio.export              → tec   (coordenador: consulta SEM exportação
--                                            até decisão explícita em contrário)
--
-- Regras:
--   · vis / lider / adm / opv / est: ZERO Actions de patrimônio — leitura de
--     dado patrimonial também é negada no banco (RLS com patrimonio.view);
--     a ausência do app no launcher não é a única barreira;
--   · nenhuma Action genérica/wildcard (o motor é exact-match e wildcard seria
--     concessão indevida ou no-op perigoso);
--   · super admin NÃO entra em nenhuma Action: o bypass vive nas policies
--     (`is_super_admin() OR …`), invariante desde a 059;
--   · a visibilidade do APP (launcher/rotas) é eixo separado
--     (moduleVisibility.ts, PR de UI) — aqui só o eixo de AUTORIZAÇÃO.
--
-- TRAVAS fail-closed no padrão 082/086: qualquer desvio aborta a migration.
-- =============================================================================

DO $$
DECLARE
    v_tec         uuid;
    v_coordinator uuid;
    v_offended    integer;
BEGIN
    SELECT id INTO v_tec         FROM public.roles WHERE slug = 'tec';
    SELECT id INTO v_coordinator FROM public.roles WHERE slug = 'coordinator';

    -- tec (036) e coordinator (040) precedem esta migration na cadeia.
    IF v_tec IS NULL OR v_coordinator IS NULL THEN
        RAISE EXCEPTION 'FAIL: roles tec/coordinator ausentes — seeds do RBAC 2.0 (036/040) nao aplicados?';
    END IF;

    INSERT INTO public.role_permissions (role_id, action, scope) VALUES
        -- leitura de DADO patrimonial (RLS de todas as tabelas 091-094)
        (v_tec,         'patrimonio.view', 'workspace'),
        (v_coordinator, 'patrimonio.view', 'workspace'),
        -- operações (EXCLUSIVAS de tec)
        (v_tec, 'patrimonio.asset.create',        'workspace'),
        (v_tec, 'patrimonio.asset.edit',          'workspace'),
        (v_tec, 'patrimonio.asset.move',          'workspace'),
        (v_tec, 'patrimonio.locations.manage',    'workspace'),
        (v_tec, 'patrimonio.responsibles.manage', 'workspace'),
        (v_tec, 'patrimonio.import.run',          'workspace'),
        (v_tec, 'patrimonio.export',              'workspace')
    ON CONFLICT (role_id, action, scope) DO NOTHING;

    -- TRAVA 1 — `patrimonio.view` só em tec/coordinator. Qualquer outro cargo
    -- com leitura de dado patrimonial = escalada indevida.
    SELECT count(*) INTO v_offended
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    WHERE rp.action = 'patrimonio.view'
      AND r.slug NOT IN ('tec', 'coordinator');
    IF v_offended > 0 THEN
        RAISE EXCEPTION 'FAIL: patrimonio.view deve existir SOMENTE em tec/coordinator (encontradas % fora)', v_offended;
    END IF;

    -- TRAVA 2 — Actions de MUTAÇÃO/OPERAÇÃO só em tec.
    SELECT count(*) INTO v_offended
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    WHERE rp.action IN (
        'patrimonio.asset.create', 'patrimonio.asset.edit', 'patrimonio.asset.move',
        'patrimonio.locations.manage', 'patrimonio.responsibles.manage',
        'patrimonio.import.run', 'patrimonio.export')
      AND r.slug <> 'tec';
    IF v_offended > 0 THEN
        RAISE EXCEPTION 'FAIL: operações de patrimonio devem existir SOMENTE em tec (encontradas % fora)', v_offended;
    END IF;

    -- TRAVA 3 — vis e lider têm ZERO Actions de patrimônio.
    SELECT count(*) INTO v_offended
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    WHERE r.slug IN ('vis', 'lider')
      AND rp.action LIKE 'patrimonio.%';
    IF v_offended > 0 THEN
        RAISE EXCEPTION 'FAIL: vis/lider nao podem ter Actions de patrimonio (encontradas %)', v_offended;
    END IF;

    -- TRAVA 4 — sem wildcards no namespace (engine exact-match; wildcard seria
    -- concessão indevida ou no-op perigoso).
    SELECT count(*) INTO v_offended
    FROM public.role_permissions rp
    WHERE rp.action LIKE 'patrimonio.%'
      AND (rp.action LIKE '%*%' OR rp.action LIKE '%?%' OR rp.action = 'patrimonio.');
    IF v_offended > 0 THEN
        RAISE EXCEPTION 'FAIL: Actions de patrimonio com wildcard/invalidas (encontradas %)', v_offended;
    END IF;

    -- TRAVA 5 — escopo: tudo em 'workspace' (nunca global/self).
    SELECT count(*) INTO v_offended
    FROM public.role_permissions rp
    WHERE rp.action LIKE 'patrimonio.%'
      AND rp.scope <> 'workspace';
    IF v_offended > 0 THEN
        RAISE EXCEPTION 'FAIL: Actions de patrimonio devem ter scope=workspace (encontradas % fora)', v_offended;
    END IF;
END $$;
