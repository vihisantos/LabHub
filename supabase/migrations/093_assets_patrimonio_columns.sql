-- =============================================================================
-- 093_assets_patrimonio_columns.sql
-- =============================================================================
-- Issue #289 — Patrimônio institucional de TI (PR-1, modelo de dados).
--
-- Evolui `public.assets` (024) SEM migrar dados: a tabela está VAZIA em DEV e
-- PROD (auditado em 2026-10-10), então constraints novas são seguras.
--
-- 1. `responsible_id` → diretório institucional (092). O responsável NÃO
--    depende de conta; `created_by` (024) permanece como autoria do registro.
-- 2. `condition` separada do status: condição é o estado FÍSICO
--    (novo/bom/regular/danificado/inservivel); status é a CUSTÓDIA/fluxo.
--    "danificado" deixa de ser status — um ativo danificado em prateleira é
--    condition='danificado' + status='disponivel'; em reparo, status='manutencao'.
-- 3. CHECK de status com o ciclo oficial:
--    draft → disponivel → em_uso → (emprestado ↔ devolução) →
--    manutencao/em_transito/nao_localizado → baixado (terminal).
-- 4. `location_id` (024, coluna órfã) ganha FK RESTRICT para 091: não dá para
--    apagar um local em uso — e o RESTRICT fecha o buraco de bypass em que um
--    ON DELETE SET NULL mudaria campos "quentes" do ativo sem passar pelo
--    histórico de movimentações.
-- 5. Endurecimento das policies de escrita: INSERT exige
--    `patrimonio.asset.create` e UPDATE exige `patrimonio.asset.edit`
--    (antes: membership genérica da 033). Tabela sem linhas e sem consumidor
--    de UI — zero risco de quebra; DELETE continua super admin only (033).
-- =============================================================================

ALTER TABLE public.assets
    ADD COLUMN IF NOT EXISTS responsible_id UUID
        REFERENCES public.patrimonio_responsibles(id) ON DELETE RESTRICT;

ALTER TABLE public.assets
    ADD COLUMN IF NOT EXISTS condition TEXT NOT NULL DEFAULT 'bom';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'assets_condition_check'
    ) THEN
        ALTER TABLE public.assets
            ADD CONSTRAINT assets_condition_check
            CHECK (condition IN ('novo', 'bom', 'regular', 'danificado', 'inservivel'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'assets_status_check'
    ) THEN
        ALTER TABLE public.assets
            ADD CONSTRAINT assets_status_check
            CHECK (status IN ('draft', 'disponivel', 'em_uso', 'emprestado',
                              'manutencao', 'em_transito', 'nao_localizado', 'baixado'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'assets_location_fk'
    ) THEN
        ALTER TABLE public.assets
            ADD CONSTRAINT assets_location_fk
            FOREIGN KEY (location_id) REFERENCES public.patrimonio_locations(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assets_ws_serial
    ON public.assets (workspace_id, serial_number);
CREATE INDEX IF NOT EXISTS idx_assets_responsible
    ON public.assets (responsible_id);
CREATE INDEX IF NOT EXISTS idx_assets_condition
    ON public.assets (condition);

-- Endurecimento: INSERT/UPDATE exigem a Action da operação (antes: membership
-- genérica da 033). SELECT passa a exigir `patrimonio.view` — leitura de dado
-- patrimonial NÃO é automática para quem só tem membership na unidade.
DROP POLICY IF EXISTS "public_assets_select" ON public.assets;
DROP POLICY IF EXISTS "public_assets_insert" ON public.assets;
DROP POLICY IF EXISTS "public_assets_update" ON public.assets;
DROP POLICY IF EXISTS "public_assets_delete" ON public.assets;

CREATE POLICY "public_assets_select"
    ON public.assets
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR public.user_has_action(workspace_id, 'patrimonio.view')
    );

CREATE POLICY "public_assets_insert"
    ON public.assets
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_super_admin()
        OR public.user_has_action(workspace_id, 'patrimonio.asset.create')
    );

CREATE POLICY "public_assets_update"
    ON public.assets
    FOR UPDATE TO authenticated
    USING (
        public.is_super_admin()
        OR public.user_has_action(workspace_id, 'patrimonio.asset.edit')
    )
    WITH CHECK (
        public.is_super_admin()
        OR public.user_has_action(workspace_id, 'patrimonio.asset.edit')
    );

CREATE POLICY "public_assets_delete"
    ON public.assets
    FOR DELETE TO authenticated
    USING (public.is_super_admin());

COMMENT ON COLUMN public.assets.condition IS
  'Estado FISICO do ativo (independente da custodia): novo|bom|regular|danificado|inservivel. "danificado" NAO e status.';
COMMENT ON COLUMN public.assets.responsible_id IS
  'Responsavel INSTITUCIONAL (patrimonio_responsibles): nao exige conta LabHub. Mudanca de responsavel segue por asset_movements (094).';
