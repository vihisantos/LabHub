-- =============================================================================
-- 082_rbac2_checklist_sla_actions.sql
-- =============================================================================
-- F2-D-G — CHECKLIST TEMPLATES e SLA PASSAM A SER AUTORIZADOS POR ACTION.
--
-- Fecha os DOIS ÚLTIMOS fluxos VIVOS que ainda decidiam escrita pelo modelo
-- legado `Role.appAccess` / `profiles.app_access` (gate `requireWrite` no
-- frontend). A auditoria read-only F2-D-F mapeou os quatro gates legados
-- restantes e separou VIVOS de MORTOS:
--
--   FLUXO VIVO (migrado aqui)          ARQUITETURA REAL
--   ----------------------------------  ------------------------------------
--   PC Care → Checklist Templates       tabela REMOTA `pcare.checklist_templates`
--   Chamados → SLA Configuration        coleção LOCAL (`sla_configs`)
--
--   FLUXO MORTO/DEPRECATED (NAO mexido) — sem consumidor de produção:
--   `pcChecklistService`, `partUsageService`, `roomService`.
--   A tabela `pcare.pc_checklists` continua tendo o RLS endurecido abaixo
--   (defesa em profundidade do dado remoto), mas o service legado dela
--   permanece intocado — remover o guard dele é fase de limpeza, não esta.
--
-- ---------------------------------------------------------------------------
-- 1. AÇÕES CRIADAS (escopo `workspace` — as 4, o escopo é o mesmo das
--    `ticket.*`/`pcare.*`/`tv.*` já semeadas; `role_permissions.scope` é
--    CHECK em ('workspace','global','self') desde a 036)
-- ---------------------------------------------------------------------------
--
-- `pcare.checklist.create` | `pcare.checklist.edit` | `pcare.checklist.delete`
--   Uma Action por operação, seguindo a convenção do catálogo para escritas de
--   PC Care (`pcare.asset.create`/`edit`/`manage`, `pcare.part.create`/
--   `edit`/`delete` — 036:386-391). Nenhuma delas pode ser reaproveitada:
--   `pcare.asset.*` e `pcare.part.*` são semeadas para `tec` (same dono) MAS
--   protegem OUTROS recursos (ativos/peças) — usar uma delas como
--   authorization de checklist daria escrita de checklist a quem só tem
--   `pcare.asset.*` e, mais grave, o RLS de checklist ficaria autorizado por
--   uma Action que o app não apresenta como "checklist".
--
-- `chamados.settings.manage`
--   Administração das configurações do app de Chamados. Hoje a única config
--   com escrita é o SLA (Chamados → Settings). O nome segue a convenção
--   existente de settings: `tv.settings.manage` (036:446, 077) e
--   `appSettings.*` do spec §5. Deliberadamente genérica a nível de
--   "configurações do app" (e não `chamados.sla.manage`) porque: (a) é o nome
--   que casa com o precedente `tv.settings.manage`; (b) não amarra a Action a
--   uma única tela que já está instável. NÃO é Action de leitura — leitura
--   segue implícita pelo App Access (catálogo §5/§6: "não transformar cada
--   GET em Action").
--
-- ---------------------------------------------------------------------------
-- 2. QUEM RECEBE (semântica legada preservada — nenhum grant novo)
-- ---------------------------------------------------------------------------
-- Fonte: `DEFAULT_ROLES` (src/core/permissions/types.ts:60-123), que é o que
-- o `requireWrite` legado consultava via `resolveAppAccess`.
--
--   cargo         pc-care    chamados
--   ------------  ---------   ---------
--   technician    full       full      <- legacy gate liberava escrita
--   viewer        read       read      <- legacy gate NEGAVA escrita
--   lider         read       full      <- legacy gate liberava ESCRITA (só SLA)
--   coordinator   read       full      <- legacy gate liberava ESCRITA (só SLA)
--
-- Logo, preservando exatamente o comportamento observável:
--   · `pcare.checklist.*`  -> SOMENTE `tec` (era `pc-care: full` só no técnico)
--   · `chamados.settings.manage` -> `tec` + `lider` + `coordinator` (os três
--     com `chamados: full`). `lider` recebe SUA PRIMEIRA Action (a 045 o
--     semeou sem role_permissions) — isso é PRESERVAÇÃO de semântica legada,
--     não concessão nova: sem ela o `lider` perderia a edição de SLA que já
--     tinha no app. `vis`/`est`/`opv`/`adm` NÃO recebem (tinham leitura).
--
-- TRAVAS ANTI-MASS-GRANT (mesmo espírito da 077:130-138): a migration ABORTA
-- se alguma destas Actions aparecer em role fora da lista permitida, ou em
-- escopo diferente de `workspace`.
--
-- ---------------------------------------------------------------------------
-- 3. HELPER `public.user_has_action(ws_id uuid, p_action text)`
-- ---------------------------------------------------------------------------
-- O projeto ainda NÃO tinha uma função genérica de Action (a 077 é
-- `user_can_manage_tv(uuid)`, a 050 `user_can_cancel_tablet_reservation(uuid)`,
-- a 076 `can_manage_workspace_apps(uuid)` — todas hard-coded por domínio). Esta
-- é a generalização mínima no MESMO formato canônico dessas três:
-- SECURITY DEFINER + `SET search_path = public` + `LANGUAGE sql STABLE` +
-- um ÚNICO `EXISTS` sobre `memberships` (ativa) `JOIN role_permissions`, com o
-- caller vindo de `auth.uid()` e a membership presa à unidade avaliada.
-- Fail-closed: `ws_id` nulo/vazio ou `p_action` vazia => false. Sem ramo
-- permissivo, sem fallback para `profiles.role`/`profiles.app_access`.
--
-- Corresponde ao `has_action(auth.uid(), workspace_id, 'pcare.checklist.<op>')`
-- do enunciado; o `auth.uid()` é lido DENTRO da função (como em 049/050/077),
-- em vez de ser parâmetro — passar o caller por parâmetro permitiria a um
-- chamador argumentar por um terceiro.
--
-- SUPER ADMIN: NÃO entra na helper (invariante vigente desde a 059 — o bypass
-- vive NA POLICY: `is_super_admin() OR public.user_has_action(...)`). O
-- comportamento observável do super admin não muda: continua ALLOW.
-- `membership_overrides` NÃO é consultado (helper nova não amplia escopo).
--
-- ---------------------------------------------------------------------------
-- 4. RLS DE ESCRITA — `pcare.checklist_templates` e `pcare.pc_checklists`
-- ---------------------------------------------------------------------------
-- Antes (027:498-522 e 027:534+): escrita liberada a QUALQUER membro da
-- unidade, via `is_super_admin() OR user_belongs_to_workspace(workspace_id)`.
-- A Action não existia no banco — ou seja, a UI já negava (requireWrite) o
-- que o banco permitia, exatamente o gap descrito na auditoria F2-D-F.
--
-- Depois: escrita exige a Action da operação. Como a tabela é sincronizada
-- pelo frontend com a chave ANON (`pcareDb` — src/lib/sync.ts:132-140,
-- REMOTE_DB), quem executa o INSERT/UPDATE/DELETE é o próprio usuário, e o
-- RLS é a autoridade real: chamar a operation direto no banco, sem a Action,
-- é NEGADO (coberto por supabase/migrations/tests/082_*.sql).
--
-- SELECT NÃO é tocado: leitura continua implícita pelo App Access
-- (`is_super_admin() OR user_belongs_to_workspace(...)`), conforme a regra do
-- catálogo de não criar Action de leitura. As policies de SELECT continuam
-- sendo as da 027 — esta migration não as recria.
--
-- ---------------------------------------------------------------------------
-- 5. SLA — POR QUE NÃO HÁ POLICY NESTA MIGRATION
-- ---------------------------------------------------------------------------
-- A configuração de SLA é persistida numa coleção LOCAL do dispositivo:
-- `sla_configs` está em `LOCAL_ONLY_COLLECTIONS` (src/lib/sync.ts:120-128) e
-- NÃO existe em `REMOTE_DB` — logo não há tabela, não há rota Flask e não há
-- RLS possível (confirmado pela auditoria F2-D-F: 0 tabela, 0 endpoint,
-- 0 RPC). Inventar tabela/rota seria criar uma camada de segurança fictícia.
--
-- Portanto, no SLA a Action é aplicada NO SERVICE (gate assíncrono via
-- `membershipService.can`, a MESMA cadeia memberships→role_permissions que o
-- `useCanAccessAction` da UI e que esta helper implementa no banco) e a UI é
-- gated com `useCanAccessAction('chamados.settings.manage')`. A limitação é
-- real e está documentada: a persistência é local do dispositivo, portanto
-- um usuário com acesso ao aparelho e ao storage local consegue alterar o
-- valor — a Action governa a OPERAÇÃO DA APLICAÇÃO, não o storage do
-- dispositivo. Corrigir isso exige backend de configurações (fase futura).
--
-- ---------------------------------------------------------------------------
-- 6. FORA DE ESCOPO (deliberado)
-- ---------------------------------------------------------------------------
--   · NÃO remove `requireWrite` (partUsage/room/pcChecklist seguem legados);
--   · NÃO remove nem altera `profiles.app_access` / `profiles.role` — a coluna
--     continua existindo e legível pelos fluxos legados ainda não migrados
--     (diferente da 077, que revogou a chave `tv` porque a TV foi integralmente
--     migrada; aqui os fluxos legados ainda dependem dela);
--   · NÃO faz backfill nem promoção de profile/membership;
--   · NÃO altera nenhuma Action já existente, nem `memberships`, nem
--     `role_permissions` de outras Actions, nem RBAC_2_ENABLED, permissionService,
--     AppGuard, Push, Coordinator, Estoque, TV, ReservaLab;
--   · NÃO cria `pcare.part.usage` nem `chamados.room.manage` (fluxos mortos);
--   · NÃO cria Action de leitura.
-- =============================================================================


-- ─── 1. Seeds das Actions + travas anti-mass-grant ───────────────────────────
--     Idempotente: ON CONFLICT (role_id, action, scope) DO NOTHING (mesma chave
--     da 036/040/077). Nenhum DELETE de permission existente.
DO $$
DECLARE
  v_tec        uuid;
  v_lider      uuid;
  v_coordinator uuid;
  v_offended   integer;
BEGIN
  SELECT id INTO v_tec         FROM public.roles WHERE slug = 'tec';
  SELECT id INTO v_lider       FROM public.roles WHERE slug = 'lider';
  SELECT id INTO v_coordinator FROM public.roles WHERE slug = 'coordinator';

  -- `tec` vem da 036; `lider` da 045; `coordinator` da 040. Todas são
  -- anteriores a 082 na sequência — se faltarem, os seeds do RBAC 2.0 não
  -- foram aplicados e a semântica legada não é reproduzível.
  IF v_tec IS NULL OR v_lider IS NULL OR v_coordinator IS NULL THEN
    RAISE EXCEPTION 'FAIL: roles tec/lider/coordinator ausentes — seeds do RBAC 2.0 (036/040/045) nao aplicados?';
  END IF;

  INSERT INTO public.role_permissions (role_id, action, scope) VALUES
    -- PC Care: só o `tec` tinha `pc-care = full` (DEFAULT_ROLES/types.ts:66-71).
    (v_tec, 'pcare.checklist.create', 'workspace'),
    (v_tec, 'pcare.checklist.edit',   'workspace'),
    (v_tec, 'pcare.checklist.delete', 'workspace'),
    -- Chamados: `tec` + `lider` + `coordinator` tinham `chamados = full`.
    (v_tec,         'chamados.settings.manage', 'workspace'),
    (v_lider,       'chamados.settings.manage', 'workspace'),
    (v_coordinator, 'chamados.settings.manage', 'workspace')
  ON CONFLICT (role_id, action, scope) DO NOTHING;

  -- TRAVA 1 — as 3 Actions de checklist só podem existir em `tec`. Sem isto, um
  -- seed futuro mass-grantaria escrita de checklist a `lider`/`coordinator`
  -- (que têm `pc-care: read`) e a `vis`/`est` (que nem veem o app).
  SELECT count(*) INTO v_offended
  FROM public.role_permissions rp
  JOIN public.roles r ON r.id = rp.role_id
  WHERE rp.action IN ('pcare.checklist.create', 'pcare.checklist.edit', 'pcare.checklist.delete')
    AND r.slug <> 'tec';

  IF v_offended > 0 THEN
    RAISE EXCEPTION 'FAIL: pcare.checklist.* deve existir SOMENTE na role tec (encontradas % em outras roles)', v_offended;
  END IF;

  -- TRAVA 2 — `chamados.settings.manage` só nos 3 cargos que tinham
  -- `chamados = full`. `vis`/`est`/`opv`/`adm` não podem receber.
  SELECT count(*) INTO v_offended
  FROM public.role_permissions rp
  JOIN public.roles r ON r.id = rp.role_id
  WHERE rp.action = 'chamados.settings.manage'
    AND r.slug NOT IN ('tec', 'lider', 'coordinator');

  IF v_offended > 0 THEN
    RAISE EXCEPTION 'FAIL: chamados.settings.manage deve existir SOMENTE em tec/lider/coordinator (encontradas % fora)', v_offended;
  END IF;

  -- TRAVA 3 — escopo: todas em `workspace`. `global`/`self` aqui dariam
  -- semântica diferente da do App Access legado (por unidade).
  SELECT count(*) INTO v_offended
  FROM public.role_permissions
  WHERE action IN ('pcare.checklist.create', 'pcare.checklist.edit',
                   'pcare.checklist.delete', 'chamados.settings.manage')
    AND scope <> 'workspace';

  IF v_offended > 0 THEN
    RAISE EXCEPTION 'FAIL: as Actions da 082 devem existir somente em scope workspace (encontradas % fora)', v_offended;
  END IF;

  RAISE NOTICE 'rbac2 079: pcare.checklist.create/edit/delete@workspace -> tec; chamados.settings.manage@workspace -> tec, lider, coordinator';
END $$;


-- ─── 2. Helper genérica de Action (formato canônico 049/050/076/077) ─────────
CREATE OR REPLACE FUNCTION public.user_has_action(ws_id uuid, p_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ws_id IS NOT NULL
     AND p_action IS NOT NULL
     AND btrim(p_action) <> ''
     AND EXISTS (
       SELECT 1
       FROM public.memberships m
       JOIN public.role_permissions rp ON rp.role_id = m.role_id
       WHERE m.profile_id = auth.uid()
         AND m.workspace_id = ws_id
         AND m.status = 'active'
         AND rp.action = p_action
         AND rp.scope = 'workspace'
     )
$$;

COMMENT ON FUNCTION public.user_has_action(uuid, text) IS
  'RBAC 2.0 (F2-D-G): true se o caller (auth.uid()) tem membership ATIVA na unidade ws_id cuja role concede a Action p_action no escopo `workspace`. É a forma genérica das helpers por dominio do repo (user_can_manage_tv/077, user_can_cancel_tablet_reservation/050, can_manage_workspace_apps/076) — o caller NÃO é parâmetro de propósito: passar o caller permitiria argumentar por um terceiro. profiles.app_access / profiles.role NAO concedem nada aqui. Super admin NAO é tratado dentro da helper: o bypass vive nas policies (is_super_admin() OR ...), invariante vigente desde a 059. SECURITY DEFINER + search_path fixo (dono tem BYPASSRLS => ler memberships nao re-dispara as policies). Fail-closed: ws_id ou p_action vazios => false; sem ramo permissivo. membership_overrides nao é consultado.';

-- ACL: sem anon/PUBLIC; authenticated + service_role (padrão 044/049/050/077).
REVOKE EXECUTE ON FUNCTION public.user_has_action(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_has_action(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_has_action(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.user_has_action(uuid, text) TO service_role;


-- ─── 3. RLS de escrita — pcare.checklist_templates ───────────────────────────
-- INSERT (pcare.checklist.create) / UPDATE (pcare.checklist.edit) /
-- DELETE (pcare.checklist.delete). As policies de SELECT da 027 NAO sao
-- recriadas aqui: leitura segue implícita pelo App Access.
DROP POLICY IF EXISTS "checklist_templates_insert" ON pcare.checklist_templates;
DROP POLICY IF EXISTS "checklist_templates_update" ON pcare.checklist_templates;
DROP POLICY IF EXISTS "checklist_templates_delete" ON pcare.checklist_templates;

CREATE POLICY "checklist_templates_insert"
  ON pcare.checklist_templates FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR public.user_has_action(workspace_id, 'pcare.checklist.create')
  );

CREATE POLICY "checklist_templates_update"
  ON pcare.checklist_templates FOR UPDATE
  USING (
    is_super_admin()
    OR public.user_has_action(workspace_id, 'pcare.checklist.edit')
  )
  WITH CHECK (
    is_super_admin()
    OR public.user_has_action(workspace_id, 'pcare.checklist.edit')
  );

CREATE POLICY "checklist_templates_delete"
  ON pcare.checklist_templates FOR DELETE
  USING (
    is_super_admin()
    OR public.user_has_action(workspace_id, 'pcare.checklist.delete')
  );


-- ─── 4. RLS de escrita — pcare.pc_checklists (defesa em profundidade) ─────────
-- O fluxo `pcChecklistService` está sem consumidor de produção (F2-D-F) e o
-- service dele NÃO foi migrado nesta fase (§11: não mexer). A tabela, porém,
-- é remota e sincronizada com a chave ANON: sem isto, qualquer membro da
-- unidade ainda escreveria nela. O RLS passa a exigir a MESMA Action de
-- checklist, para que remover o serviço no futuro não exponha o dado.
DROP POLICY IF EXISTS "pc_checklists_insert" ON pcare.pc_checklists;
DROP POLICY IF EXISTS "pc_checklists_update" ON pcare.pc_checklists;
DROP POLICY IF EXISTS "pc_checklists_delete" ON pcare.pc_checklists;

CREATE POLICY "pc_checklists_insert"
  ON pcare.pc_checklists FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR public.user_has_action(workspace_id, 'pcare.checklist.create')
  );

CREATE POLICY "pc_checklists_update"
  ON pcare.pc_checklists FOR UPDATE
  USING (
    is_super_admin()
    OR public.user_has_action(workspace_id, 'pcare.checklist.edit')
  )
  WITH CHECK (
    is_super_admin()
    OR public.user_has_action(workspace_id, 'pcare.checklist.edit')
  );

CREATE POLICY "pc_checklists_delete"
  ON pcare.pc_checklists FOR DELETE
  USING (
    is_super_admin()
    OR public.user_has_action(workspace_id, 'pcare.checklist.delete')
  );
