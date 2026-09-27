-- =============================================================================
-- 076_rbac2_can_manage_workspace_apps.sql
-- =============================================================================
-- #296 (PR-4A) — ALINHA O RLS DE CONFIGURAÇÃO DE APPS AO RBAC 2.0.
--
-- Problema (achado da auditoria read-only de `profiles.role`/`app_access`):
--   `public.can_manage_workspace_apps(uuid)` foi criada na 031 com
--   `profiles.role = 'admin'` como AUTORIDADE REAL. Ela é consumida por 4
--   policies RLS:
--     · workspace_app_settings — INSERT   (WITH CHECK)
--     · workspace_app_settings — UPDATE   (USING + WITH CHECK)
--     · workspace_app_settings — DELETE   (USING)
--     · app_data_backups       — INSERT   (WITH CHECK)
--   Logo, `profiles.role` continuava sendo fonte de autorização no banco.
--
-- Divergência corrigida aqui:
--     ANTES:  API  → RBAC 2.0 (Action `admin.app.purge`, via
--                         `_require_workspace_app_manager` / `require_action_rbac`)
--             RLS  → `profiles.role = 'admin'`        (legado, migration 031)
--     DEPOIS: API  → RBAC 2.0
--             RLS  → RBAC 2.0   (esta migration)
--
-- A Action é a MESMA já sembeada na 036 para a role `adm`
-- (`036_rbac2_schema.sql:444`: `(v_adm, 'admin.app.purge', 'workspace')`).
-- Nenhuma Action nova é criada e `admin.app.purge` não é alterada — apenas
-- passa a ser consultada também pelo caminho RLS, igualando as duas camadas.
--
-- MODELO REUTILIZADO (não é uma implementação paralela):
--   O padrão canônico de autorização RBAC 2.0 em SQL/RLS do repositório é o de
--   `user_can_cancel_tablet_reservation` (050, linhas 67-76): `memberships`
--   JOIN `role_permissions`, com `status='active'` e `scope='workspace'`.
--   A mesma forma é usada aqui — muda a Action, não a estrutura.
--   (`role_permissions` NÃO tem coluna de status: a existência da linha É o
--   grant. Por isso não há filtro de "permissão ativa".)
--
-- SEMÂNTICA RESULTANTE (p_ws = a unidade avaliada):
--   1. Super Admin ................................. ALLOW (bypass global,
--      independente de membership — `is_super_admin()` é preservado como está)
--   2. membership ativa em p_ws + role com a Action
--      `admin.app.purge` no escopo `workspace` ..... ALLOW
--   3. Action na unidade, mas membership só em outra unidade ... DENY
--      (a vínculo é `m.workspace_id = p_ws`; a mesma role em outra unidade
--       não concede nada aqui)
--   4. membership ativa em p_ws sem a Action ....... DENY
--   5. `profiles.role = 'admin'` sem Action ......... DENY  ← deixa de bastar
--   6. membership suspensa/removida/pending ......... DENY
--
-- O binding de unidade ficou mais forte que antes: a 031 exigia
-- `user_belongs_to_workspace(p_ws) AND role='admin'` (qualquer status de
-- membership). Aqui a própria cláusula `m.workspace_id = p_ws AND
-- m.status = 'active'` já garante pertencimento E atividade — não é preciso
-- (nem correto) chamar `user_belongs_to_workspace` de novo, e o padrão da 050
-- também não o faz dentro do helper.
--
-- AS 4 POLICIES NÃO SÃO TOCADAS. O contrato permanece:
--     policy → can_manage_workspace_apps(workspace_id) → RBAC 2.0
-- Nenhuma policy é reescrita para contornar a helper.
--
-- FORA DE ESCOPO (deliberadamente):
--   · NÃO altera `profiles` (nem remove `role`/`app_access`/`workspace_ids`);
--   · NÃO altera `memberships`, `roles`, `role_permissions` nem
--     `membership_overrides`; NÃO cria Action; NÃO cria trigger/view/policy;
--   · NÃO altera `_require_workspace_app_manager()`, `RBAC_2_ENABLED`, os
--     fallbacks `role == 'admin'` do `api/app.py`, TV, ReservaLab,
--     `user_can_manage_tv` ou `user_can_cancel_tablet_reservation`;
--   · NÃO faz BACKFILL (ver o risco documentado no relatório da PR).
--
-- IDEMPOTÊNCIA: `CREATE OR REPLACE FUNCTION` — replay apenas substitui o
-- corpo; a ACL existente é preservada (CREATE OR REPLACE não revoga nem
-- concede privilégios). `SET search_path = public` e `SECURITY DEFINER` são
-- mantidos (exigidos pelo teste `tests/031_rls_checks.sql`), evitando recursão
-- de RLS sobre `profiles` e captura de schema.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_manage_workspace_apps(p_ws uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_ws IS NOT NULL
     AND (
       -- Bypass global de Super Admin (inalterado, independe de membership).
       public.is_super_admin()
       -- RBAC 2.0: membership ativa NA UNIDADE + Action `admin.app.purge`
       -- no escopo `workspace` (mesmo formato da 050).
       OR EXISTS (
         SELECT 1
         FROM public.memberships m
         JOIN public.role_permissions rp ON rp.role_id = m.role_id
         WHERE m.profile_id = auth.uid()
           AND m.workspace_id = p_ws
           AND m.status = 'active'
           AND rp.action = 'admin.app.purge'
           AND rp.scope = 'workspace'
       )
     )
$$;

COMMENT ON FUNCTION public.can_manage_workspace_apps(uuid) IS
  'RBAC 2.0 (#296 PR-4A): true se o caller é Super Admin OU tem membership ATIVA '
  'na unidade p_ws cuja role concede a Action `admin.app.purge` no escopo '
  '`workspace` (Action já sembeada na 036 para a role `adm`). A antiga '
  'autoridade `profiles.role = ''admin''` (migration 031) NÃO concede mais nada '
  'aqui. SECURITY DEFINER + search_path fixo (evita recursão de RLS em profiles). '
  'Consumida sem alteração pelas 4 policies de workspace_app_settings (I/U/D) '
  'e app_data_backups (I).';

-- ACL: reidempotente e IDÊNTICA à da 031 (nenhum privilégio novo é concedido).
REVOKE EXECUTE ON FUNCTION public.can_manage_workspace_apps(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_workspace_apps(uuid) FROM PUBLIC;
