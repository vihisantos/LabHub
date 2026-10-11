-- =============================================================================
-- 091_patrimonio_locations.sql
-- =============================================================================
-- Issue #289 — Patrimônio institucional de TI (PR-1, modelo de dados).
--
-- Locais PATRIMONIAIS estruturados por nível: campus (workspace) → prédio →
-- andar → sala/ambiente → complemento (ponto de uso, único campo de forma
-- livre). O campus é o workspace (009); unidade pode ter vários prédios e
-- salas — uma linha por local.
--
-- Segurança (matriz da PR-1):
--   · leitura: `patrimonio.view` (tec e coordinator) via user_has_action;
--     quem tem membership mas não tem a Action (vis, lider, adm, opv, est)
--     NÃO lê dado patrimonial — a ausência de ícone no launcher não é a
--     única barreira;
--   · escrita: `patrimonio.locations.manage` (tec);
--   · super admin: bypass nas policies (invariante desde a 059 — nada novo);
--   · RLS habilitado; REVOKE anon (padrão 026/033).
--
-- Idempotente: IF NOT EXISTS / DROP IF EXISTS / ON CONFLICT DO NOTHING.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.patrimonio_locations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    predio       TEXT NOT NULL DEFAULT '',
    andar        TEXT NOT NULL DEFAULT '',
    nome         TEXT NOT NULL,
    complemento  TEXT NOT NULL DEFAULT '',
    notes        TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT patrimonio_locations_nome_check CHECK (btrim(nome) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_patrimonio_locations_ws_full
    ON public.patrimonio_locations (workspace_id, predio, andar, nome);
CREATE INDEX IF NOT EXISTS idx_patrimonio_locations_workspace
    ON public.patrimonio_locations (workspace_id);

ALTER TABLE public.patrimonio_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patrimonio_locations_select" ON public.patrimonio_locations;
DROP POLICY IF EXISTS "patrimonio_locations_insert" ON public.patrimonio_locations;
DROP POLICY IF EXISTS "patrimonio_locations_update" ON public.patrimonio_locations;
DROP POLICY IF EXISTS "patrimonio_locations_delete" ON public.patrimonio_locations;

CREATE POLICY "patrimonio_locations_select"
    ON public.patrimonio_locations
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR public.user_has_action(workspace_id, 'patrimonio.view')
    );

CREATE POLICY "patrimonio_locations_insert"
    ON public.patrimonio_locations
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_super_admin()
        OR public.user_has_action(workspace_id, 'patrimonio.locations.manage')
    );

CREATE POLICY "patrimonio_locations_update"
    ON public.patrimonio_locations
    FOR UPDATE TO authenticated
    USING (
        public.is_super_admin()
        OR public.user_has_action(workspace_id, 'patrimonio.locations.manage')
    )
    WITH CHECK (
        public.is_super_admin()
        OR public.user_has_action(workspace_id, 'patrimonio.locations.manage')
    );

CREATE POLICY "patrimonio_locations_delete"
    ON public.patrimonio_locations
    FOR DELETE TO authenticated
    USING (
        public.is_super_admin()
        OR public.user_has_action(workspace_id, 'patrimonio.locations.manage')
    );

REVOKE ALL ON public.patrimonio_locations FROM anon;
REVOKE ALL ON public.patrimonio_locations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patrimonio_locations TO authenticated;
GRANT ALL ON public.patrimonio_locations TO service_role;

COMMENT ON TABLE public.patrimonio_locations IS
  'Locais patrimoniais por nivel: campus (workspace_id), predio, andar, sala/ambiente e complemento (issue #289). Leitura exige Action patrimonio.view; escrita exige patrimonio.locations.manage.';
