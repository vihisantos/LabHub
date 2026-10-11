-- =============================================================================
-- 097_assets_create_guard.sql
-- =============================================================================
-- Issue #289 — Patrimônio institucional de TI (PR-4, cadastro/edição de bens).
--
-- LACUNA FECHADA: o INSERT de um ativo aceita `location_id`/`responsible_id`
-- como ESTADO INICIAL (o histórico `criacao` da 094 registra esses valores no
-- momento da criação), mas NINGUÉM validava que o local/responsável inicial
-- pertencia à MESMA unidade do ativo — a FK só garante existência, e a RLS de
-- INSERT (093) verifica apenas o `workspace_id` DA LINHA, não os das
-- referências. Um cliente com `patrimonio.asset.create` podia criar um ativo
-- apontando para um local/responsável de OUTRO campus.
--
-- Esta migration adiciona a guarda de CRIação: BEFORE INSERT em `public.assets`
-- que rejeita (42501) local/responsável inicial de outra unidade e (23503)
-- referência inexistente — a MESMA defesa que `patrimonio_apply_movement`
-- (094) já aplica aos movimentos. O efeito é server-side e vale para qualquer
-- cliente (PostgREST, service_role, trigger de importação), então a validação
-- da UI do PR-4 é apenas pré-voo — a autoridade é esta guarda + RLS.
--
-- Trava fail-closed, no padrão das migrations 082/086/095.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.patrimonio_assets_create_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ws UUID;
BEGIN
    -- Local inicial: precisa EXISTIR e pertencer à mesma unidade do ativo.
    -- A FK `assets_location_fk` (093) já garante existência, mas o SELECT
    -- abaixo também cobre o caso e deixa o erro explícito (23503 na guarda).
    IF NEW.location_id IS NOT NULL THEN
        SELECT workspace_id INTO v_ws
        FROM public.patrimonio_locations WHERE id = NEW.location_id;
        IF v_ws IS NULL THEN
            RAISE EXCEPTION 'patrimonio: local inicial inexistente'
                USING ERRCODE = '23503';
        END IF;
        IF v_ws IS DISTINCT FROM NEW.workspace_id THEN
            RAISE EXCEPTION 'patrimonio: local inicial pertence a outra unidade'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Responsável inicial: idem.
    IF NEW.responsible_id IS NOT NULL THEN
        SELECT workspace_id INTO v_ws
        FROM public.patrimonio_responsibles WHERE id = NEW.responsible_id;
        IF v_ws IS NULL THEN
            RAISE EXCEPTION 'patrimonio: responsavel inicial inexistente'
                USING ERRCODE = '23503';
        END IF;
        IF v_ws IS DISTINCT FROM NEW.workspace_id THEN
            RAISE EXCEPTION 'patrimonio: responsavel inicial pertence a outra unidade'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assets_patrimonio_create_guard ON public.assets;
CREATE TRIGGER trg_assets_patrimonio_create_guard
    BEFORE INSERT ON public.assets
    FOR EACH ROW EXECUTE FUNCTION public.patrimonio_assets_create_guard();

COMMENT ON FUNCTION public.patrimonio_assets_create_guard() IS
  'Guarda de CRIACAO do patrimonio (097): local/responsavel INICIAIS devem existir e pertencer a MESMA unidade do ativo (defesa em profundidade alem da RLS de INSERT).';