-- =============================================================================
-- 094_asset_movements.sql
-- =============================================================================
-- Issue #289 — Patrimônio institucional de TI (PR-1, modelo de dados).
--
-- HISTÓRICO DE MOVIMENTAÇÕES APPEND-ONLY + motor transacional de mudanças.
--
-- Contrato (matriz da PR-1):
--   · TODA mudança de local/responsável/status acontece via INSERT em
--     `asset_movements` — a trigger BEFORE INSERT aplica o efeito no ativo e
--     grava os snapshots NA MESMA transação (uma declaração do cliente);
--   · escrita direta de campos "quentes" em `assets` é BLOQUEADA pela guarda
--     (`pg_trigger_depth() = 1` só vale fora de contexto de trigger, que o
--     cliente não consegue forjar);
--   · INSERT em `assets` gera automaticamente o movimento `criacao` — não
--     existe ativo sem história — e o registro automático NÃO é reaplicado
--     (discriminado por profundidade de trigger);
--   · `workspace_id` do ativo é imutável (sem transferência entre campi);
--   · append-only de verdade: SEM policies de UPDATE/DELETE e SEM grants de
--     UPDATE/DELETE — nem super admin reescreve histórico (retificação é um
--     movimento novo `correcao`);
--   · leitura exige `patrimonio.view` (tec/coordinator); INSERT exige
--     `patrimonio.asset.move` (tec). vis/lider/demais: nada.
--
-- Estados sem contradição (validados na trigger):
--   emprestimo    → exige responsável + expected_return_at; status='emprestado';
--                   bloqueia empréstimo duplo;
--   devolucao     → exige empréstimo ativo; responsável volta a NULL;
--   transferencia → exige local de destino do MESMO workspace;
--   baixa         → status 'baixado' TERMINAL (só `correcao` depois);
--   local/responsável de destino sempre da MESMA unidade do ativo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.asset_movements (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id              UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    asset_id                  UUID NOT NULL REFERENCES public.assets(id) ON DELETE RESTRICT,
    type                      TEXT NOT NULL,
    to_location_id            UUID REFERENCES public.patrimonio_locations(id) ON DELETE RESTRICT,
    to_responsible_id         UUID REFERENCES public.patrimonio_responsibles(id) ON DELETE RESTRICT,
    to_status                 TEXT,
    to_responsible_nome       TEXT,
    to_responsible_matricula  TEXT,
    expected_return_at        TIMESTAMPTZ,
    note                      TEXT NOT NULL DEFAULT '',
    performed_by              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    performed_by_nome         TEXT,
    source                    TEXT NOT NULL DEFAULT 'ui',
    import_batch_id           UUID,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT asset_movements_type_check CHECK (type IN (
        'criacao', 'transferencia', 'responsavel', 'emprestimo', 'devolucao',
        'manutencao', 'baixa', 'inventario', 'correcao')),
    CONSTRAINT asset_movements_to_status_check CHECK (to_status IS NULL OR to_status IN (
        'draft', 'disponivel', 'em_uso', 'emprestado', 'manutencao',
        'em_transito', 'nao_localizado', 'baixado')),
    CONSTRAINT asset_movements_source_check CHECK (source IN ('ui', 'import', 'api')),
    CONSTRAINT asset_movements_expected_return_check
        CHECK (type <> 'emprestimo' OR expected_return_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_asset_movements_asset
    ON public.asset_movements (asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_movements_workspace
    ON public.asset_movements (workspace_id, created_at DESC);

ALTER TABLE public.asset_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_movements_select" ON public.asset_movements;
DROP POLICY IF EXISTS "asset_movements_insert" ON public.asset_movements;

CREATE POLICY "asset_movements_select"
    ON public.asset_movements
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR public.user_has_action(workspace_id, 'patrimonio.view')
    );

CREATE POLICY "asset_movements_insert"
    ON public.asset_movements
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_super_admin()
        OR public.user_has_action(workspace_id, 'patrimonio.asset.move')
    );

-- Append-only: NÃO existem policies de UPDATE/DELETE, e o GRANT não concede.
REVOKE ALL ON public.asset_movements FROM anon;
REVOKE ALL ON public.asset_movements FROM PUBLIC;
GRANT SELECT, INSERT ON public.asset_movements TO authenticated;
GRANT ALL ON public.asset_movements TO service_role;

-- ---------------------------------------------------------------------------
-- 1. Guarda do ativo: campos quentes só mudam via movimentação.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.patrimonio_assets_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
        RAISE EXCEPTION
            'patrimonio: o workspace (campus) do ativo e imutavel - transferencia entre unidades nao e suportada'
            USING ERRCODE = '42501';
    END IF;

    -- `pg_trigger_depth() = 1` significa UPDATE direto (PostgREST/SQL). Dentro
    -- da aplicação da movimentação (trigger de INSERT em asset_movements) a
    -- profundidade é > 1 e o efeito é legítimo. O cliente não consegue forjar
    -- profundidade de trigger.
    IF pg_trigger_depth() <= 1 AND (
        NEW.location_id       IS DISTINCT FROM OLD.location_id
        OR NEW.responsible_id IS DISTINCT FROM OLD.responsible_id
        OR NEW.status         IS DISTINCT FROM OLD.status
    ) THEN
        RAISE EXCEPTION
            'patrimonio: local/responsavel/status mudam somente via INSERT em asset_movements'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assets_patrimonio_guard ON public.assets;
CREATE TRIGGER trg_assets_patrimonio_guard
    BEFORE UPDATE ON public.assets
    FOR EACH ROW EXECUTE FUNCTION public.patrimonio_assets_guard();

COMMENT ON FUNCTION public.patrimonio_assets_guard() IS
  'Guarda de integridade do patrimonio (094): workspace_id imutavel; local/responsavel/status mudam apenas via asset_movements (pg_trigger_depth>1).';

-- ---------------------------------------------------------------------------
-- 2. Histórico automático de criação: ativo inserido ⇒ movimento `criacao`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.patrimonio_asset_created_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resp_nome      TEXT;
    v_resp_matricula TEXT;
    v_source         TEXT;
    v_batch          UUID;
    v_actor          UUID := auth.uid();
    v_actor_nome     TEXT;
BEGIN
    IF NEW.responsible_id IS NOT NULL THEN
        SELECT nome, matricula INTO v_resp_nome, v_resp_matricula
        FROM public.patrimonio_responsibles WHERE id = NEW.responsible_id;
    END IF;

    -- Proveniência: em sessão autenticada a origem é sempre 'ui' (o cliente
    -- não escolhe — um INSERT de usuário com metadata.source='import' NÃO
    -- vira importação no histórico). Sem auth.uid() o chamador é o servidor
    -- (service_role) e os valores que ele gravar em metadata são legítimos.
    IF v_actor IS NOT NULL THEN
        SELECT name INTO v_actor_nome FROM public.profiles WHERE id = v_actor;
        v_source := 'ui';
        v_batch  := NULL;
    ELSE
        v_source := COALESCE(NEW.metadata ->> 'source', 'api');
        IF v_source NOT IN ('ui', 'import', 'api') THEN
            v_source := 'api';
        END IF;
        BEGIN
            v_batch := (NEW.metadata ->> 'import_batch_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_batch := NULL;
        END;
    END IF;

    -- INSERT como definer: não passa pela RLS de asset_movements (é a própria
    -- infraestrutura de histórico, não uma ação do usuário). A autoria é o
    -- criador real do ativo (auth.uid()) ou NULL em operação de servidor — e
    -- o NOME do autor fica em snapshot (performed_by_nome), imune à exclusão
    -- futura do perfil (mesma convenção de app_audit_logs.actor_name, 054).
    INSERT INTO public.asset_movements (
        workspace_id, asset_id, type,
        to_location_id, to_responsible_id, to_status,
        to_responsible_nome, to_responsible_matricula,
        performed_by, performed_by_nome, source, import_batch_id
    ) VALUES (
        NEW.workspace_id, NEW.id, 'criacao',
        NEW.location_id, NEW.responsible_id, NEW.status,
        v_resp_nome, v_resp_matricula,
        v_actor, v_actor_nome, v_source, v_batch
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assets_patrimonio_history ON public.assets;
CREATE TRIGGER trg_assets_patrimonio_history
    AFTER INSERT ON public.assets
    FOR EACH ROW EXECUTE FUNCTION public.patrimonio_asset_created_history();

COMMENT ON FUNCTION public.patrimonio_asset_created_history() IS
  'Historico automatico (094): todo INSERT em assets gera movimento criacao com o estado inicial (fonte via metadata.source).';

-- ---------------------------------------------------------------------------
-- 3. Aplicação da movimentação (BEFORE INSERT: valida, aplica no ativo e
--    preenche os snapshots do próprio movimento — tudo na mesma transação).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.patrimonio_apply_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_asset          public.assets%ROWTYPE;
    v_loc_ws         UUID;
    v_resp_ws        UUID;
    v_resp_nome      TEXT;
    v_resp_matricula TEXT;
    v_status         TEXT;
BEGIN
    -- O registro `criacao` é gerado pela trigger de histórico (profundidade 2):
    -- é o próprio registro de criação, nada a aplicar. Um `criacao` inserido
    -- DIRETAMENTE por usuário (profundidade 1) é rejeitado — o histórico não
    -- pode ser forjado.
    IF NEW.type = 'criacao' THEN
        IF pg_trigger_depth() <= 1 THEN
            RAISE EXCEPTION
                'patrimonio: o movimento criacao e gerado automaticamente no INSERT do ativo'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    -- AUDITORIA — autoria e proveniência NUNCA vem do cliente:
    --   · com sessão autenticada, `performed_by` é SEMPRE auth.uid() (o valor
    --     enviado é descartado mesmo que seja um uuid válido — um usuário não
    --     pode assinar uma movimentação em nome de outro perfil); o NOME do
    --     autor é capturado agora (snapshot) e a fonte de uma ação de usuário
    --     é 'ui', sem lote de importação;
    --   · sem auth.uid() o chamador é o PRÓPRIO SERVIDOR (service_role:
    --     importação, rotinas internas) — os valores que ele gravar são
    --     legítimos e podem ser NULL (operação de sistema). Anon não chega
    --     aqui (RLS).
    IF auth.uid() IS NOT NULL THEN
        NEW.performed_by      := auth.uid();
        NEW.performed_by_nome := (SELECT name FROM public.profiles WHERE id = auth.uid());
        NEW.source            := 'ui';
        NEW.import_batch_id   := NULL;
    END IF;

    -- Serializa movimentos concorrentes sobre o MESMO ativo (atomicidade real).
    SELECT * INTO v_asset FROM public.assets WHERE id = NEW.asset_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'patrimonio: ativo % nao encontrado', NEW.asset_id;
    END IF;

    -- Isolamento por workspace (defesa em profundidade além da RLS):
    IF NEW.workspace_id IS DISTINCT FROM v_asset.workspace_id THEN
        RAISE EXCEPTION 'patrimonio: movimento em workspace diferente do ativo'
            USING ERRCODE = '42501';
    END IF;

    IF v_asset.status = 'baixado' AND NEW.type <> 'correcao' THEN
        RAISE EXCEPTION 'patrimonio: ativo baixado e terminal - somente correcao e permitida'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.to_location_id IS NOT NULL THEN
        SELECT workspace_id INTO v_loc_ws
        FROM public.patrimonio_locations WHERE id = NEW.to_location_id;
        IF v_loc_ws IS NULL OR v_loc_ws IS DISTINCT FROM v_asset.workspace_id THEN
            RAISE EXCEPTION 'patrimonio: local de destino pertence a outra unidade'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF NEW.to_responsible_id IS NOT NULL THEN
        SELECT workspace_id, nome, matricula INTO v_resp_ws, v_resp_nome, v_resp_matricula
        FROM public.patrimonio_responsibles WHERE id = NEW.to_responsible_id;
        IF v_resp_ws IS NULL OR v_resp_ws IS DISTINCT FROM v_asset.workspace_id THEN
            RAISE EXCEPTION 'patrimonio: responsavel de destino pertence a outra unidade'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF NEW.type = 'emprestimo' THEN
        IF NEW.to_responsible_id IS NULL THEN
            RAISE EXCEPTION 'patrimonio: emprestimo exige responsavel' USING ERRCODE = '42501';
        END IF;
        IF v_asset.status = 'emprestado' THEN
            RAISE EXCEPTION 'patrimonio: ativo ja esta emprestado - registre a devolucao primeiro'
                USING ERRCODE = '42501';
        END IF;
        v_status := 'emprestado';
    ELSIF NEW.type = 'devolucao' THEN
        IF v_asset.status IS DISTINCT FROM 'emprestado' THEN
            RAISE EXCEPTION 'patrimonio: devolucao sem emprestimo ativo' USING ERRCODE = '42501';
        END IF;
        v_status := COALESCE(NEW.to_status, 'disponivel');
    ELSIF NEW.type = 'transferencia' THEN
        IF NEW.to_location_id IS NULL THEN
            RAISE EXCEPTION 'patrimonio: transferencia exige local de destino' USING ERRCODE = '42501';
        END IF;
        IF NEW.to_status NOT IN ('em_transito', 'disponivel', 'em_uso') THEN
            RAISE EXCEPTION 'patrimonio: status invalido para transferencia (%)', COALESCE(NEW.to_status, 'null')
                USING ERRCODE = '42501';
        END IF;
        v_status := NEW.to_status;
    ELSIF NEW.type = 'responsavel' THEN
        IF NEW.to_responsible_id IS NULL THEN
            RAISE EXCEPTION 'patrimonio: troca de responsavel exige responsavel de destino' USING ERRCODE = '42501';
        END IF;
        IF NEW.to_status NOT IN ('em_uso', 'disponivel') THEN
            RAISE EXCEPTION 'patrimonio: status invalido para troca de responsavel (%)', COALESCE(NEW.to_status, 'null')
                USING ERRCODE = '42501';
        END IF;
        v_status := NEW.to_status;
    ELSIF NEW.type = 'manutencao' THEN
        v_status := 'manutencao';
    ELSIF NEW.type = 'baixa' THEN
        v_status := 'baixado';
    ELSIF NEW.type = 'inventario' THEN
        IF NEW.to_status NOT IN ('nao_localizado', 'disponivel', 'em_uso') THEN
            RAISE EXCEPTION 'patrimonio: status invalido para contagem (%)', COALESCE(NEW.to_status, 'null')
                USING ERRCODE = '42501';
        END IF;
        v_status := NEW.to_status;
    ELSE -- correcao
        v_status := COALESCE(NEW.to_status, v_asset.status);
    END IF;

    -- Efeito ATÔMICO no ativo (mesma transação do INSERT do movimento).
    UPDATE public.assets SET
        location_id = CASE
            WHEN NEW.type = 'transferencia' THEN NEW.to_location_id
            ELSE COALESCE(NEW.to_location_id, v_asset.location_id)
        END,
        responsible_id = CASE
            WHEN NEW.type IN ('devolucao', 'baixa') THEN NULL
            ELSE COALESCE(NEW.to_responsible_id, v_asset.responsible_id)
        END,
        status = v_status,
        updated_at = now()
    WHERE id = v_asset.id;

    -- Snapshots do responsável gravados NO PRÓPRIO movimento (imunes a
    -- renomeação futura do diretório). BEFORE INSERT ⇒ NEW persiste.
    NEW.to_responsible_nome       := v_resp_nome;
    NEW.to_responsible_matricula  := v_resp_matricula;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_asset_movements_apply ON public.asset_movements;
CREATE TRIGGER trg_asset_movements_apply
    BEFORE INSERT ON public.asset_movements
    FOR EACH ROW EXECUTE FUNCTION public.patrimonio_apply_movement();

COMMENT ON FUNCTION public.patrimonio_apply_movement() IS
  'Motor transacional do patrimonio (094): valida regras de estado (emprestimo/devolucao/baixa terminal/workspace), aplica local/responsavel/status no ativo e grava snapshots — tudo na transacao do INSERT. Histórico append-only.';
