-- =============================================================================
-- 092_patrimonio_responsibles.sql
-- =============================================================================
-- Issue #289 — Patrimônio institucional de TI (PR-1, modelo de dados).
--
-- Diretório de responsáveis INSTITUCIONAIS por unidade. O responsável de um
-- ativo NÃO depende de conta no LabHub: pessoa sem conta é cadastrada aqui
-- (nome + matrícula opcional + e-mail opcional); o vínculo com um perfil
-- existente (`profile_id`) é OPCIONAL e nunca é a única via.
--
-- Minimização de PII: nome, matrícula e e-mail opcional. Sem telefone/endereço.
-- Quando `profile_id` está setado, a UI prefere os dados atuais do perfil
-- (join); o `nome` do diretório é snapshot de cadastro e fallback.
--
-- Segurança: leitura `patrimonio.view` (tec/coordinator); escrita
-- `patrimonio.responsibles.manage` (tec); super admin bypass nas policies.
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.patrimonio_responsibles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    nome         TEXT NOT NULL,
    matricula    TEXT,
    email        TEXT,
    profile_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes        TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT patrimonio_responsibles_nome_check CHECK (btrim(nome) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_patrimonio_responsibles_ws_profile
    ON public.patrimonio_responsibles (workspace_id, profile_id)
    WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_patrimonio_responsibles_ws_matricula
    ON public.patrimonio_responsibles (workspace_id, matricula)
    WHERE matricula IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patrimonio_responsibles_workspace
    ON public.patrimonio_responsibles (workspace_id);

ALTER TABLE public.patrimonio_responsibles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patrimonio_responsibles_select" ON public.patrimonio_responsibles;
DROP POLICY IF EXISTS "patrimonio_responsibles_insert" ON public.patrimonio_responsibles;
DROP POLICY IF EXISTS "patrimonio_responsibles_update" ON public.patrimonio_responsibles;
DROP POLICY IF EXISTS "patrimonio_responsibles_delete" ON public.patrimonio_responsibles;

CREATE POLICY "patrimonio_responsibles_select"
    ON public.patrimonio_responsibles
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR public.user_has_action(workspace_id, 'patrimonio.view')
    );

CREATE POLICY "patrimonio_responsibles_insert"
    ON public.patrimonio_responsibles
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_super_admin()
        OR public.user_has_action(workspace_id, 'patrimonio.responsibles.manage')
    );

CREATE POLICY "patrimonio_responsibles_update"
    ON public.patrimonio_responsibles
    FOR UPDATE TO authenticated
    USING (
        public.is_super_admin()
        OR public.user_has_action(workspace_id, 'patrimonio.responsibles.manage')
    )
    WITH CHECK (
        public.is_super_admin()
        OR public.user_has_action(workspace_id, 'patrimonio.responsibles.manage')
    );

CREATE POLICY "patrimonio_responsibles_delete"
    ON public.patrimonio_responsibles
    FOR DELETE TO authenticated
    USING (
        public.is_super_admin()
        OR public.user_has_action(workspace_id, 'patrimonio.responsibles.manage')
    );

REVOKE ALL ON public.patrimonio_responsibles FROM anon;
REVOKE ALL ON public.patrimonio_responsibles FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patrimonio_responsibles TO authenticated;
GRANT ALL ON public.patrimonio_responsibles TO service_role;

COMMENT ON TABLE public.patrimonio_responsibles IS
  'Diretorio de responsaveis institucionais por unidade (issue #289): conta LabHub OPCIONAL (profile_id); matricula preservada quando disponivel. Leitura patrimonio.view; escrita patrimonio.responsibles.manage.';
