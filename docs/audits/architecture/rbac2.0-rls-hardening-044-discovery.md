# ETAPA 044-A — Discovery: RLS Hardening de `profiles` e `workspaces`

> Planejamento da futura **Migration 044** (hardening RLS). Documento **read-only** de discovery:
> nenhuma alteracao foi feita em Supabase, migrations, dados, codigo, Vercel ou envs.
> Origem do debito: Issue #158 `security: harden permissive profiles/workspaces RLS policies` (criada na
> auditoria pos-producao do RBAC 2.0).

Data: 2026-09-07
Escopo: PROD `ypkulvbllxgkjzhpzemf` + codigo-fonte (`main@b8da015`)
Tipo: Discovery / planejamento. Sem aplicacao.

---

## 1. Executive Summary

As tabelas `public.profiles` e `public.workspaces` em PROD possuem policies SELECT com `USING (true)`,
permitindo a **QUALQUER usuario autenticado** ler todos os perfis (inclusive `email`, `is_super_admin`,
`workspace_ids`, `app_access`) e todos os workspaces. Isso ja era um debito ENABLED em producao (auditoria
pos-producao RBAC 2.0, veredito HEALTHY WITH OBSERVATIONS; registrado em #158).

Este discovery responde ao criterio de sucesso:

> "Se removermos `USING (true)` de profiles e workspaces, exatamente quais fluxos do LabHub podem quebrar
> e qual deve ser a regra correta de leitura para cada um?"

**Conclusoes principais:**
1. **Nenhum fluxo backend quebra**: todas as 19+ chamadas REST a `profiles`/`workspaces` no Flask usam
   `service_role` (bypass total de RLS).
2. **Frontend quebra em 3 classes de fluxo** que leem a lista **completa** (cross-workspace) com o token
   do usuario autenticado:
   - **Admin de usuarios/roles/regras de notificacao** (espera `select('*')` sem filtro);
   - **Sincronizacao global de workspaces** (`WorkspaceContext`/switcher) que alimenta a lista de campi;
   - **Setup da TV desktop** (`SetupFlow`), que lista todos os campi para escolha.
3. **Regra correta de leitura (proposta)**: `USING (true)` deve virar `OWN id = auth.uid() OR is_super_admin()
   OR profile_compartilha_workspace_comigo(id)` via uma **helper SECURITY DEFINER** dedicada —
   **nao** reutilizar `user_belongs_to_workspace` (que verifica UM workspace e depende de `workspace_ids`
   do proprio perfil, nao de memberships).
4. **Achado inesperado (divergencia PROD vs repo)**: a PROD nunca registrou as migrations 000–034 tirando
   `035..043` em `public.schema_migrations`. Nao ha version de `028` individualmente; as policies de
   workspaces na PROD sao da era `009` (`role = 'admin'`), nao as da `028` (`is_super_admin()`). A proposta
   044 deve **recriar essas policies de forma idempotente** e servira como ponto de consolidacao.
5. **Grants**: na PROD, `is_super_admin()`, `user_belongs_to_workspace(text/uuid)` e `can_access_tv_workspace`
   tem EXECUTE concedido a `authenticated` — portanto policies que chamem helpers continuarao funcionando.
6. **Realtime**: `ThemeContext` assina o canal `profiles` (postgres_changes). A restricao de SELECT preserva
   o contrato realtime; apenas filtra o que o subscriber enxerga.

---

## 2. Current Problem (as-is em PROD — verificado via Management API)

Query `pg_policies` (PROD real):

| Tabela | Policy | Cmd | Qual / With check (real) |
|--------|--------|-----|---------------------------|
| profiles | `profiles_select` | SELECT | `USING (true)` |
| profiles | `profiles_insert` | INSERT | `WITH CHECK (auth.uid() = id)` |
| profiles | `profiles_update` | UPDATE | `USING (auth.uid() = id) WITH CHECK (auth.uid() = id)` |
| profiles | `profiles_delete` | DELETE | `USING (auth.uid() = id)` |
| profiles | `admin_abs_edit_profiles` | UPDATE | `USING (is_super_admin()) WITH CHECK (is_super_admin())` |
| profiles | `admin_abs_delete_profiles` | DELETE | `USING (is_super_admin())` |
| workspaces | `workspaces_select` | SELECT | `USING (true)` |
| workspaces | `workspaces_insert` | INSERT | `WITH CHECK (EXISTS profiles WHERE id=auth.uid() AND role='admin')` |
| workspaces | `workspaces_update` | UPDATE | `USING (EXISTS ... role='admin')` |
| workspaces | `workspaces_delete` | DELETE | `USING (EXISTS ... role='admin')` |

**Sintoma principal**: `profiles_select`/`workspaces_select` expoe dados de todos os usuarios e todos os
campi para qualquer usuario logado. Campos sensiveis expostos: `email`, `is_super_admin`, `role`,
`workspace_ids`, `app_access`, `status`, `avatar`, `name`, `id`.

---

## 3. Profiles Usage Map

### 3.1 Frontend (Supabase client com token do usuario — **RLS aplica**)

11 consultas diretas `from('profiles')` em `src/`:

| # | Arquivo:linha | Operacao | Leitura | Motivo | Regra correta |
|---|---------------|----------|---------|--------|---------------|
| 1 | `src/core/auth/service.ts:204` | `update(...)` eq id | UPDATE proprio | edicao do proprio perfil | `auth.uid() = id` (ja ok) |
| 2 | `src/core/auth/service.ts:219` | `select('*')` eq id | SELECT proprio | `fetchUserProfile` apos login | `auth.uid() = id` |
| 3 | `src/core/auth/service.ts:251` | `insert(...)` | INSERT | `createProfile` fallback (registro inicial) | `auth.uid() = id` (with check ja ok) |
| 4 | `src/core/auth/adminService.ts:48-49` | `select('*')` **sem filtro** | SELECT TODOS | `listAllProfiles` → admin Users/Roles/Notifications | super admin OU mesmo workspace |
| 5 | `src/core/auth/adminService.ts:64-65` | `select('*')` `eq('status','pending')` | SELECT pendentes | lista de aprovacao (super admin) | super admin (ou ws) |
| 6 | `src/core/auth/adminService.ts:84-87` | `update` + `select('id')` | UPDATE aprovar | aprovar usuario (super admin) | `is_super_admin()` |
| 7 | `src/core/auth/adminService.ts:106-109` | `delete` + `select('id')` | DELETE rejeitar | rejeitar pendente | `is_super_admin()` |
| 8 | `src/core/auth/adminService.ts:125-126` | `update` avatar | UPDATE proprio? | `setAvatar` | `auth.uid() = id` |
| 9 | `src/core/auth/adminService.ts:141-142` | `update` role | UPDATE role | `setRole` (super admin) | `is_super_admin()` |
| 10 | `src/core/auth/adminService.ts:158-161` | `update` dados admin | UPDATE | `updateUser` (super admin) | `is_super_admin()` |
| 11 | `src/platform/Login/LoginPage.tsx:50` | `select('id','status')` eq id | SELECT proprio | poll de status pending (5s) | `auth.uid() = id` |

Complementos (nao sao `from('profiles')` mas dependem do leiaute):
- `src/lib/ThemeContext.tsx:44` — **realtime** `postgres_changes` canal `profiles` (assinado por qualquer
  usuario logado; com RLS restritivo o subscriber so recebe linhas legiveis a ele).
- `src/core/auth/types.ts` `toDbUser/fromDbUser` — campos sensiveis trafegados: `id, email, name, role,
  is_super_admin, workspace_ids, app_access, status, avatar`.
- Paginas admin que consomem `listAllProfiles()` e **filtram por workspace no client**:
  `src/apps/admin/pages/UsersPage.tsx:44,91-99` (`scopedActiveUsers`), `RolesPage.tsx:69-97`,
  `UserDetailPage.tsx:46`, `src/apps/admin/components/NotificationSendTab.tsx:54`,
  `NotificationRulesTab.tsx:39-52,217` (`userHasAppAccess` + `inWorkspaceScope`).
- `user_profiles` (colecao local IndexedDB, `src/core/users/service.ts`) e usado pelo seletor de
  responsavel do Chamados (`TicketDetail.tsx:111` `userService.getAll()`). **NAO** e a tabela Supabase —
  nao e afetado por RLS.

### 3.2 Backend (Flask — **service_role, bypass de RLS**, imune a 044)

6 pontos de consulta REST a `profiles` (todas com `_SUPABASE_SERVICE_KEY`):

| Arquivo:linha | Rota | Uso |
|---------------|------|-----|
| `src/apps/reservalab/api/auth.py:162` | (require_auth, ~26 rotas) | `_get_user_profile` (id,email,name,role,is_super_admin,workspace_ids,status) |
| `src/apps/reservalab/api/app.py:526` | `POST /api/push/subscribe` | carga autoritativa do perfil (SEC-03) — SELECT por user_id |
| `src/apps/reservalab/api/app.py:722` | `POST /api/push/action` (approve) | PATCH profiles (super admin) |
| `src/apps/reservalab/api/app.py:734` | `POST /api/push/action` (reject) | DELETE profiles (super admin) |
| `src/apps/reservalab/api/app.py:1202` | `GET /api/push/check-pcare` | cron de pendentes (CRON_SECRET) |
| `api/app.py:1249` | `POST /api/tv/activation/create` | SELECT perfil proprio (link TV) |
| `api/app.py:1438` | `POST /api/tv/devices/provision` | SELECT perfil proprio (provision TV) |

Backend **nao muda** com a 044: service_role ignora RLS.

---

## 4. Workspaces Usage Map

### 4.1 Frontend (Supabase client — **RLS aplica**)

| Arquivo:linha | Operacao | Leitura | Regra correta |
|---------------|----------|---------|---------------|
| `src/core/workspaces/service.ts:34` | `select('*').order('name')` | SELECT TODOS (sync global) | super admin OU membro do wp |
| `src/core/workspaces/service.ts:51` | `upsert(workspace)` | INSERT/UPDATE | `is_super_admin()` |
| `src/core/workspaces/service.ts:61` | `delete().eq('id')` | DELETE | `is_super_admin()` |
| `src/tv-desktop/SetupFlow.tsx:41` | `select('*')` | SELECT TODOS (escolha do campo p/ TV) | membro do wp (ou super admin) |

Consumidores da lista global de workspaces (com token do usuario):
- `src/core/workspaces/WorkspaceContext.tsx` — `workspaces` (todos) + `assignedWorkspaces`
  (filtro client: `is_super_admin` OR `workspace_ids.includes(id)`); `STORAGE_KEY='labhub_active_workspace'`.
- `src/platform/WorkspaceSwitcher/WorkspaceSwitcherSheet.tsx` — exibe campi.
- `src/platform/WorkspaceGate/WorkspaceGate.tsx` + modais (Create/Duplicate/Settings/Apps/Reset/Delete).
- TV desktop `src/tv-desktop/SetupFlow.tsx:41`.

### 4.2 Backend (Flask — service_role, imune a 044)

12+ rotas consultam `workspaces` via REST (SELECT/PATCH/DELETE), todas com service key:
`api/app.py:1270` (tv activation), `:1366` (tv redeem), `:1458` (tv provision),
`:1954` (chamados/workspaces public — select id,name,slug,location), `:2021` (chamados create — disabled_apps),
`:3469` (relatorio semanal), `:3693` (admin backups restore), `:3800/:3835` (admin delete workspace),
`src/apps/reservalab/api/app.py:186/:244` (seed de salas por workspace),
`src/apps/reservalab/api/auth.py:188/:214` (`_get_workspace`).

---

## 5. Current RLS Policies (inventario completo — PROD factual)

Verificado em PROD via `pg_policies` (nao apenas pelo repo):

**Tabelas com RLS ativa (6):** `profiles`, `workspaces`, `memberships`, `role_permissions`,
`membership_overrides`, `rbac_audit_logs` (essas 4 do RBAC2 ja restritas a `is_super_admin() OR
user_belongs_to_workspace()`).

- **profiles**: 6 policies (3 arquivos). `profiles_select USING(true)` (006/007); insert/update/delete
  proprias (007); `admin_abs_edit_profiles`/`admin_abs_delete_profiles` com `is_super_admin()` (022).
- **workspaces**: 4 policies (009; **nao atualizadas pela 028 na PROD**). Select `USING(true)`;
  insert/update/delete com `role='admin'` (legacy).
- **memberships / role_permissions / membership_overrides / rbac_audit_logs**: criadas na 036, policies
  `is_super_admin() OR user_belongs_to_workspace(workspace_id)` (nao sao escopo da 044).
- **stock/pcare/assets/chamados**: policies `is_super_admin() OR user_belongs_to_workspace(workspace_id)`
  (027/028/033) — nao sao escopo da 044.

**Helpers em PROD (grants verificados):**
- `is_super_admin()` — SQL, STABLE, SECURITY DEFINER, lê `profiles.is_super_admin` de `auth.uid()`.
  EXECUTE p/ `authenticated` OK na PROD (o REVOKE da 028 **nao** esta refletido — seed via baseline).
- `user_belongs_to_workspace(text)` e `(uuid)` — SQL, SECURITY DEFINER, verifica **`profiles.workspace_ids`**
  (NAO memberships). EXECUTE p/ `authenticated` OK.
- `can_access_tv_workspace(uuid)` — SQL, SECURITY DEFINER. EXECUTE p/ `authenticated` OK.

**Historico de versions (PROD `public.schema_migrations`):** apenas `035,036,038,039,040,041,042,043`
(8 versions). As migrations 000–034 existem no repo e foram seedadas como baseline; **nao ha registro
individual da 028**, o que explica as policies de workspaces na era `role='admin'`.

---

## 6. RBAC 2.0 Relationship

- O RBAC 2.0 roda no **backend Flask** (`src/apps/reservalab/api/rbac.py`): ordem `super_admin → ALLOW`,
  sem membership → DENY, role_permissions, override deny/allow, default DENY. Toda rota protegida passa
  por `rbac_can`; o perfil do usuario vem de `auth.py:_get_user_profile` (service key).
- RLS e a **camada de dados** (sombreamento da autorizacao): isola linhas por workspace. Na pratica, hoje
  `profiles`/`workspaces` ficam abertos via `USING(true)`; a seguranca efetiva dos CAMPOS e feita no
  backend (RBAC) + filtros no client.
- **Point of note**: `profiles.workspace_ids` e redundante com `memberships` (036). A helper atual
  `user_belongs_to_workspace` usa `workspace_ids`, entao a 044 **nao** precisa migrar para memberships —
  mas o design deve decidir a fonte (ver Open Questions).
- O RBAC2 nao escreve em `profiles` alem do sync da 041 (trigger memberships↔profiles: `tec/vis/adm/coordinator`,
  `status<>active`→sem membership, `is_super_admin`→sem membership). Nada na 044 conflita.

---

## 7. Required Read Model (resposta ao criterio de sucesso)

### 7.1 profiles — regra de leitura por fluxo

| Fluxo | Precisa ler | Regra correta (proposta) |
|-------|-------------|--------------------------|
| Login/refresh (`service.ts:219`), poll pending (`LoginPage.tsx:50`) | perfis PROPRIOS | `id = auth.uid()` |
| Perfil proprio (update/avatar; `service.ts:204`, `adminService.ts:125`) | UPDATE proprio | `id = auth.uid()` |
| Admin Users/Roles/UserDetail/Notifications (`listAllProfiles` etc.) | usuarios do MESMO workspace + super admins | `is_super_admin()` OR membro compartilha workspace |
| Aprovacao/rejeicao de pendentes (`adminService.ts:64,84,106`) | usuarios pendentes (cross-workspace) | `is_super_admin()` |
| Edicao de role/dados de outrem (`adminService.ts:141,158`) | UPDATE em perfil de outrem | `is_super_admin()` |
| Realtime (`ThemeContext.tsx:44`) | eventos do canal `profiles` | legiveis conforme RLS (nao requer mudanca) |
| Backend (26+ rotas, push, TV, cron) | tudo, via service key | nao afetado |

**Helper necessaria (proposta — SECURITY DEFINER):**
```sql
-- profile_visible_to_me(target_user uuid) RETURNS boolean
-- true se target == auth.uid() OR is_super_admin() OR
--      existe workspace w onde EU tenho membership ativa E o target tambem.
```
Base: `public.memberships` (036) com `status='active'`, munida da decissao em Open Questions
(memberships vs workspace_ids).

### 7.2 workspaces — regra de leitura por fluxo

| Fluxo | Precisa ler | Regra correta (proposta) |
|-------|-------------|--------------------------|
| `WorkspaceContext`/switcher/gate (`service.ts:34`) | workspaces de que sou membro (para super admin: todos) | `is_super_admin()` OR `user_belongs_to_workspace(workspaces.id)` |
| TV Setup (`SetupFlow.tsx:41`) | workspaces de que sou membro (escolha do campo) | `user_belongs_to_workspace(id)` OR `is_super_admin()` |
| Create/Update/Delete workspace (`service.ts:51,61`) | INSERT/UPDATE/DELETE | `is_super_admin()` |
| Backend (12+ rotas) | tudo, service key | nao afetado |

**Cadencia**: `fetchFromSupabase` com `fetchInFlight` dedup; com RLS restritivo, usuarios nao-membros
recebem lista vazia — o `WorkspaceContext` ja responde com "sem workspaces" (gate/onboarding). Super admins
continuam vendo todos.

### 7.3 Complementos que NAO quebram
- `user_profiles` (responsavel do Chamados) e local-only.
- `/api/chamados/workspaces` e publico via service key.
- `can_access_tv_workspace` ja usa RLS nas tabelas de TV.

---

## 8. Sensitive Fields Analysis

Campos expostos por `profiles_select USING(true)` hoje (qualquer usuario logado):
`email` (PII), `is_super_admin` (privilegio amplo), `workspace_ids` (membros de quais campi),
`role` (legado), `app_access` (qual aplicativo o usuario acessa), `name`, `avatar`, `status`, `id`.

Sem a 044: um usuario `vis` (visualizador) de um workspace consegue listar emails/super admins/workspaces
de TODOS os outros campi. A 044 reduz o blast radius ao proprio workspace.

---

## 9. Cross-Workspace Threat Model

Cenarios contemplados (pre-044 vs pos-044):

| Cenario | Pre-044 | Pos-044 (proposta) |
|---------|---------|--------------------|
| Usuario `vis` de WS-A enumera emails de todos os usuarios de WS-B | Possivel (`USING true`) | Bloqueado (apenas membros do mesmo ws + proprios) |
| Usuario le `is_super_admin` de todos | Possivel | Apenas super admins e co-membros do mesmo ws |
| Usuario de WS-A lista campi de WS-B no switcher | Possivel | So os campi onde e membro |
| Super admin approva pendentes cross-workspace | OK | OK (bypass `is_super_admin()`) |
| Backend/Flask (service role) | OK | OK (imune) |
| Chamados publico | OK (endpoint publico) | OK (intocado) |
| TV desktop setup lista campi | OK | Restrito a membros (regra de produto — ver Open Q) |

Nota: RLS nunca protegeu `profiles.workspace_ids`/`memberships` de leitura cross-ws via service role;
a defesa de autorizacao de negocio permanece no RBAC backend (camada de autorizacao, nao de dados).

---

## 10. Proposed 044 Design

Migration **append-only** `044_rls_hardening_profiles_workspaces.sql` (idempotente, estilo do repo —
cf. 042/043). **NAO implementar nesta etapa** — o relatorio apenas define o design.

```sql
-- =====================================================================
-- 044: RLS hardening profiles + workspaces (Issue #158)
-- Estrategia: helper SECURITY DEFINER `profile_visible_to_me` +
--            replace das policies SELECT USING(true) e consolidacao
--            das policies de workspaces (era 009 role='admin' -> is_super_admin()).
-- =====================================================================

-- 1. Helper de leitura de profiles (ver Open Questions: fonte memberships vs workspace_ids)
CREATE OR REPLACE FUNCTION public.profile_visible_to_me(target_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT target_user IS NOT NULL AND (
    target_user = auth.uid()
    OR COALESCE((SELECT p.is_super_admin FROM public.profiles p WHERE p.id = auth.uid()), false)
    OR EXISTS (
      SELECT 1
      FROM public.memberships m_mine
      JOIN public.memberships m_other ON m_other.workspace_id = m_mine.workspace_id
      WHERE m_mine.profile_id = auth.uid()
        AND m_mine.status = 'active'
        AND m_other.profile_id = target_user
        AND m_other.status = 'active'
    )
  );
$function$;

-- idempotente; preserva grants; EXECUTE para authenticated (nao revogar de PUBLIC/anon sem GRANT p/ authenticated)
REVOKE EXECUTE ON FUNCTION public.profile_visible_to_me(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.profile_visible_to_me(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.profile_visible_to_me(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.profile_visible_to_me(uuid) TO service_role;

-- 2. profiles_select: remover USING(true)
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.is_super_admin()
    OR public.profile_visible_to_me(id)
  );

-- 3. workspaces_select: remover USING(true)
DROP POLICY IF EXISTS "workspaces_select" ON public.workspaces;
CREATE POLICY "workspaces_select"
  ON public.workspaces FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_belongs_to_workspace(id)
  );

-- 4. Consolidacao das policies de workspaces (009 era role='admin'; 028 nao
--    aplicada em PROD). Reafirmar is_super_admin().
DROP POLICY IF EXISTS "workspaces_insert" ON public.workspaces;
CREATE POLICY "workspaces_insert"
  ON public.workspaces FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "workspaces_update" ON public.workspaces;
CREATE POLICY "workspaces_update"
  ON public.workspaces FOR UPDATE
  TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "workspaces_delete" ON public.workspaces;
CREATE POLICY "workspaces_delete"
  ON public.workspaces FOR DELETE
  TO authenticated
  USING (public.is_super_admin());
```

Notas de design:
- **Nao** alterar `profiles_insert/update/delete` proprias nem `admin_abs_*` (ja corretas).
- **Nao** mexer em memberships/role_permissions/membership_overrides/rbac_audit_logs.
- **Cuidado crítico com grants**: se a 044 fizer REVOKE de PUBLIC em helpers, precisa GRANT a
  `authenticated` (lição da 028 — na PROD o grant sobreviveu porque a seed deu EXECUTE; em ambientes
  "limpos" a 028 teria quebrado policies).
- Alternativa de implementacao para a helper (Open Questions Q1): fonte `profiles.workspace_ids` via
  `ARRAY` overlap, caso memberships ainda nao seja 100% populado; como cross-check, executar antes da
  migration um SELECT de contagem para garantir que memberships ativas == usuarios com `workspace_ids`.

---

## 11. Required Tests

Testes estaticos (estilo `api/tests/test_*_migration.py` — regex nas migrations):
1. `test_044_rls_hardening_migration.py`:
   - migration existe, `BEGIN`+`COMMIT`, padrao de estilo do repo;
   - contem `DROP POLICY profiles_select`, recria com `profile_visible_to_me`;
   - contem `DROP POLICY workspaces_select`, recria com `user_belongs_to_workspace`;
   - policies de workspaces inser/update/delete com `is_super_admin()`;
   - grants: `GRANT EXECUTE ... TO authenticated` presente.
2. `test_044_helper_sql_review.py`: helper `profile_visible_to_me` SECURITY DEFINER, STABLE, sem `raise`,
   `search_path = public`; verificar a logica de membership overlap.

Testes de integracao/regressao frontend (pytest/playwright ja existentes devem permanecer verdes):
- `api/tests/test_workspace_isolation.py`, `test_auth_layer.py`, `test_rbac*.py` (nada de RLS direto).
- Suites de componentes: `WorkspaceContext.test.tsx`, `UsersPage/RolesPage/UserDetailPage`,
  `NotificationSendTab`, `LoginPage`, `TicketDetail` (responsavel usa `user_profiles` local).

Validacao pos-aplicacao em STAGING/DEV (antes de PROD):
- Padrao `service_role`: app completo funciona (ROTA de regressao com um user `vis` e um super admin).
- `select('*') from profiles` via client autenticado do `vis` retorna apenas: ele mesmo +
  co-membros do MESMO workspace ativo (nao cross-ws).
- `select('*') from workspaces` via `vis` retorna apenas seus workspaces.
- Super admin ve todos (profiles + workspaces) e aprova/rejeita pendentes cross-ws.
- TV SetupFlow com usuario membro so considera seus campi.
- Realtime `profiles` nao gera erro 42501.

---

## 12. Frontend Regression Risks

| Risco | Impacto | Mitigacao |
|-------|---------|-----------|
| Admin Users/Roles/Notifications com lista vazia para super admins | ALTO | Super admin tem `is_super_admin()` na policy → continua vendo tudo |
| Admin nao-super (adm/coordinator) via `listAllProfiles` | MEDIO | Policy por membership overlap mantem co-membros do ws; usuarios "sem ws" e super admins visiveis via regra extra (Open Q) |
| `WorkspaceContext` lista vazia para users sem membership ativa | MEDIO | Comportamento desejado no onboarding/gate; validar UX do switcher 
| LocalSync `syncFromSupabase` (workspaces) p/ user com membro em 1 ws | BAIXO | Consulta `select('*')` retorna so seus ws; `syncFromSupabase` ja apaga os nao-remotos |
| TV SetupFlow com opcoes reduzidas | MEDIO | Regra de produto (Open Q3); TV operators tem membership `opv` |
| Realtime profiles com autorizacao filtrada | BAIXO | Canal so emite linhas legiveis; sem erro |
| `createProfile` fallback (INSERT) | BAIXO | `WITH CHECK (auth.uid() = id)` inalterada |
| Login poll de pending | BAIXO | `id = auth.uid()` cobre |

---

## 13. Rollout Plan

1. **Antes da escrita da migration**: validar em STAGING que `memberships.status='active'` cobre todos os
   casos de negocio (ou decidir fonte `workspace_ids`). Executar query de cross-check (dev).
2. **Etapa 044-B (implementacao)**: criar `supabase/migrations/044_*.sql` seguindo o design da secao 10,
   com testes estaticos (secao 11).
3. **DEV primeiro / STAGING**: aplicar migration via pipeline (workflow `Migrations`), rodar pytest,
   validar regressao com usuario `vis` (secao 12).
4. **PROD**: aplicar via PR/Deploy (mesmo runner que entregou a 043 — run esperado). Monitorar
   deployment events; sem erro, acompanhar por 48h.
5. **Pos-aplicacao**: fechar #158 apos confirmacao em PROD. Nenhuma dependencia de Vercel/env vars.
6. **Rollback**: migration append-only idempotente; para reverter, migration 045 inversa (restaurar
   `USING(true)` + policies 009). Manter RLS ativa o tempo todo (nao ha desligamento).

---

## 14. Open Questions (duvidas de produto/arquitetura)

- **Q1 – Fonte da pertença**: membro do mesmo workspace deve ser determinado por `memberships` (036,
  autoritativa RBAC2) ou por `profiles.workspace_ids` (legado, usado por `user_belongs_to_workspace`)?
  A proposta usa `memberships`; `user_belongs_to_workspace` usa `workspace_ids`. Recomendacao: memberships
  (fonte unica RBAC2) + cross-check de contagem antes.
- **Q2 – Usuarios sem workspace (workspace_ids vazio/pendentes)**: visiveis a quem? Hoje aparecem para
  todas as paginas admin (para serem atribuidos). Proposta: visiveis apenas a super admins; admin de
  workspace com role que atribui (coordinator/est/opv/adm) talvez precise ve-los — decicao de produto.
- **Q3 – TV SetupFlow**: operadores TV (`opv`) devem ver apenas os campi onde sao membros? A sugestao e
  sim (seguranca); confirmar fluxo de provisionamento quando o operador precisa escolher outro campo.
- **Q4 – Realtime `profiles`**: o canal hoje e assinado por qualquer autenticado. Apos a 044, so deveria
  ser assinado por quem pode ler (super admins). Alterar `ThemeContext.tsx:44` para assinar somente se
  `is_super_admin`? (mudanca frontend opcional, mesmo sem 044).
- **Q5 – Polices `workspaces_insert/update/delete`**: consolidar para `is_super_admin()` (proposta) —
  remove a divergencia PROD vs 028. OK?

---

## 15. Recommendation

Implementar a 044 (ignorando o achado de divergencia de historico — a PROD sera consolidada pela propria
migration). Escopo minimo:
(1) helper `profile_visible_to_me` (SECURITY DEFINER, grants corretos p/ authenticated);
(2) `profiles_select` restritivo;
(3) `workspaces_select` restritivo;
(4) consolidar policies de workspaces p/ `is_super_admin()`.

Prioridade: ALTA (debito #158). Risco de regressao controlado: backend imune (service role), super admins
bypass por `is_super_admin()`, e os unicos fluxos restritos sao os leiaute cross-ws que **ja deveriam**
ser isolados. Resolver Q1–Q5 antes da implementacao.

---

## Apendice A — Arquivos analisados

**Frontend (RLS aplica):**
- `src/core/auth/service.ts` (204, 219, 251)
- `src/core/auth/adminService.ts` (25, 48-49, 64-65, 84-87, 106-109, 125-126, 141-142, 158-161)
- `src/core/auth/types.ts` (`toDbUser`/`fromDbUser`)
- `src/platform/Login/LoginPage.tsx` (50)
- `src/lib/ThemeContext.tsx` (44)
- `src/lib/sync.ts` (120-129 LOCAL_ONLY; 133+ REMOTE_DB)
- `src/core/workspaces/service.ts` (34, 51, 61; fetchInFlight)
- `src/core/workspaces/WorkspaceContext.tsx` (workspaces/assignedWorkspaces; STORAGE_KEY)
- `src/platform/WorkspaceGate/WorkspaceGate.tsx` + modais
- `src/platform/WorkspaceSwitcher/WorkspaceSwitcherSheet.tsx`
- `src/tv-desktop/SetupFlow.tsx` (41)
- `src/apps/admin/pages/UsersPage.tsx`, `RolesPage.tsx`, `UserDetailPage.tsx`
- `src/apps/admin/components/NotificationSendTab.tsx`, `NotificationRulesTab.tsx`
- `src/core/users/service.ts` / `src/apps/chamados/pages/TicketDetail.tsx:111` (user_profiles LOCAL)

**Backend (service role, imune):**
- `src/apps/reservalab/api/auth.py` (162, 188, 214)
- `src/apps/reservalab/api/rbac.py` (motor RBAC2; 270-305)
- `src/apps/reservalab/api/app.py` (186, 244, 526, 722, 734, 1202)
- `api/app.py` (1249, 1270, 1366, 1438, 1458, 1954, 2021, 3469, 3693, 3800, 3835)

**Migrations (origem das policies):**
- `006_fix_rls_policies.sql`, `007_admin_manage_profiles.sql`, `009_workspace_isolation.sql`,
  `022_fix_admin_profiles.sql`, `027_rls_workspace_isolation.sql`, `028_authorization_consolidation.sql`,
  `033_workspace_isolation_hardening.sql`, `036_rbac2_schema.sql`, `041_rbac2_sync_memberships.sql`,
  `025_security_revoke_pg_sql.sql`, `043_fix_describe_tv_app_data_alias.sql`

**Referencias de produto:** `docs/architecture/authorization.md`, Issue #158, Issue #159.

## Apendice B — Contagem de usos

- **profiles (frontend, `from('profiles')` via Supabase client): 11 usos** (mapa 3.1).
- **profiles (backend, REST service key): 6 pontos de consulta** (mapa 3.2).
- **workspaces (frontend, via Supabase client): 4 usos** (mapa 4.1).
- **workspaces (backend, REST service key): 12+ rotas** (mapa 4.2).
- **Policies atuais (PROD): profiles 6 / workspaces 4** (secao 5).

## Apendice C — Policies encontradas (PROD, via pg_policies)

| Tabela | Policy | Cmd | Qual |
|--------|--------|-----|------|
| profiles | profiles_select | SELECT | `true` |
| profiles | profiles_insert | INSERT | `WITH CHECK (auth.uid()=id)` |
| profiles | profiles_update | UPDATE | `USING (auth.uid()=id)` |
| profiles | profiles_delete | DELETE | `USING (auth.uid()=id)` |
| profiles | admin_abs_edit_profiles | UPDATE | `is_super_admin()` |
| profiles | admin_abs_delete_profiles | DELETE | `is_super_admin()` |
| workspaces | workspaces_select | SELECT | `true` |
| workspaces | workspaces_insert | INSERT | `EXISTS(...role='admin')` |
| workspaces | workspaces_update | UPDATE | `EXISTS(...role='admin')` |
| workspaces | workspaces_delete | DELETE | `EXISTS(...role='admin')` |

## Apendice D — Principais riscos

1. Quebrar visibilidade admin de usuarios do mesmo workspace (mitigado por helper de overlap).
2. Divergir entre `memberships` e `workspace_ids` (Q1).
3. Realtime profiles expor filtro inadequado (Q4).
4. Grants: revogar EXECUTE de PUBLlC em helpers sem GRANT a `authenticated` quebraria policies
   (licao da 028/PROD).
5. TV SetupFlow perder opcoes de campo (Q3).

## Apendice E — Confirmacao de nao-alteracao (ETAPA 044-A)

**Nenhuma alteracao foi feita.** Esta etapa foi **100% read-only**:
- Nenhuma migration criada ou alterada (`supabase/migrations/` intocado; `044_*` NAO existe).
- Nenhum SQL aplicado em DEV/STAGING/PROD.
- Nenhuma alteracao de RLS, dados, roles ou memberships.
- Nenhuma alteracao em Vercel, secrets ou envs.
- Nenhum commit / push / PR feito.
- Issue #158 **nao** foi fechada; Issue #159 continua em aberto.
- Workaround temporario **nao** criado.

Git status final (somente docs desta etapa + untracked pre-existentes):
- `?? docs/audits/architecture/rbac2.0-rls-hardening-044-discovery.md` (este arquivo)
- out-of-scope pre-existentes nao alterados por esta etapa.