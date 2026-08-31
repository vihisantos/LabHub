# LabHub — Auditoria pré-RBAC 2.0

> Auditoria **read-only** (2026-08-29). Nenhum código, migração ou banco foi alterado.
> Objetivo: comparar o estado atual contra o modelo-alvo **RBAC 2.0**
> (`USER → MEMBERSHIP → Workspace / Status / Role / App Access / Actions / Overrides / Liderança`)
> e produzir o Gap Analysis para **decisão** antes de tocar no banco.

- Escopo: auth, workspaces, permissions/roles, membership, aprovação, uml, notificações, logs, localStorage, admin.
- Legenda: 🟢 reuso / 🟡 remodelagem / 🔴 ausente / ⚠️ risco de conflito.
- Fontes: `docs/decisions/ADR-008*`, `docs/architecture/authorization.md`, `docs/architecture/authentication.md`, `supabase/migrations/000–035`, código-fonte.

---

## 1. Estado atual (modelo de dados real)

Tudo que está versionado e em uso hoje.

### `public.profiles` (migrações 001→035) — a tabela de usuários

| Coluna | Tipo | Origem |
|---|---|---|
| `id` | UUID PK | 001 |
| `email` | text | 001 |
| `name` | text | 001 |
| `role` | text (`'admin'/'technician'/'viewer'`) | 001 (legado) |
| `workspace_ids` | `UUID[]` | 004/009 (renomeado de `"workspaceIds"`) |
| `status` | text (`active/pending`) | 012 |
| `app_access` | jsonb | 013 |
| `is_super_admin` | bool | 019 |
| `accent`, `theme_variant` | text | 008 |
| `avatar`, `banner` | text | 012/014 |
| `home_mode` | text | 017 |
| `created_at` / `updated_at` | timestamptz | 001 |

> ⚠️ **`notify_settings` NÃO existe como coluna SQL.** Só existe em TS (`core/auth/types.ts:43`, `adminService.ts:153`) e Python (`api/app.py:1744`, `apps/reservalab/api/app.py:520`). O `updateUserProfile` empurra o campo para `profiles` e provavelmente falha/erra no nível do banco (bug latente).

### `public.workspaces` (migração 009)

`id, name, slug, location, spreadsheet_url, lab_count, color, disabled_apps (028), settings (020), created_at, updated_at`.
RLS: SELECT para todos autenticados; INSERT/UPDATE/DELETE só `is_super_admin()`.

### Roles / cargos — **cliente-side apenas**

- **Não existe tabela `roles` no banco** (0 DDL em migrações 000–035; `stock.roles` é só um probe legacy em `scripts/seed_workspaces.py`).
- Cargos vivem em **localStorage/IndexedDB** via `createSyncService<Role>('roles')` (`core/permissions/service.ts:6`).
- `DEFAULT_ROLES` = `role-technician` / `role-viewer`. **Não existe cargo `admin`** — admin = `is_super_admin` boolean (migração 019). O `permissionService.migrate()` remove qualquer cargo legado `admin` (service.ts:46-48).
- `Role` TS: `{ id, key?, name, description, appAccess: Record<appId, AppAccessLevel>, manageQr?, isDefault?, leaderId? }`.

### Membership — **NÃO existe tabela de membros**

- Zero referências a `memberships` / `user_workspaces` / `workspace_members` em todo o repo.
- A associação usuário↔workspace é apenas o array **`profiles.workspace_ids UUID[]`**. Não há `role`, `status` ou `app_access` **por workspace** — tudo é global no perfil.

### Persistência / sincronização (4 camadas)

| Camada | Uso | Observação |
|---|---|---|
| Supabase (PostgREST) | `profiles`, `workspaces`, `notifications`, assets, etc. | RLS com `is_super_admin()` / `user_belongs_to_workspace()` |
| IndexedDB `labhub`/`collections` | cache local sincronizado | `lib/db.ts` |
| Memória `Map` `CACHE` | cache em tempo de execução | `lib/db.ts` |
| localStorage | metadata/preferências/roles/user_profiles/sync-dirty/tombstones/preferência de workspace | chaves `labhub_*` |

Ponto-chave: **`roles`, `user_profiles` (people) e `logs` são 100% locais** (createSyncService) — **não persistem no banco** e não são compartilhados entre dispositivos.

---

## 2. Modelo atual de Membership

```
profiles (User)
 ├─ workspace_ids: UUID[]        ← "membros" (só ids, sem role/status por workspace)
 ├─ role: (cargo ÚNICO global, text legado → roleId)
 ├─ status: active|pending       ← global, não por workspace
 ├─ app_access: jsonb            ← overrides GLOBAIS (não por workspace)
 └─ is_super_admin: bool         ← bypass absoluto
```

- **Uma pessoa = um cargo global** aplicado a todos os workspaces de que é membro. Não existe "admin deste workspace" no frontend moderno — só `is_super_admin` global (o antigo `role='admin'` foi eliminado pela migração 019/028 e pelo `migrate()` de permissions).
- **Uma pessoa = um status global** (`active`/`pending`), independente do workspace. A aprovação é global, não "aprovado no lab A, pendente no lab B".
- **Overrides globais**: `app_access` não leva workspace em conta; e ainda é coluna no perfil (não sombreado por cargo).

---

## 3. Fluxo de aprovação (estado atual)

1. **Sign up** → `LoginPage.handleSubmit` (`platform/Login/LoginPage.tsx:95-109`) → trigger `handle_new_user()` (migração 015/026). O trigger insere um perfil `status='pending'` **e** uma notificação `stock.notifications` com `actionUrl '/admin/users?pending=<id>'`, `audience='role'`, `targetSuperAdmin=true` (migração 026:48-64).
2. Usuário pendente vê `SignupStatusScreen` (`LoginPage.tsx:128-138`), **polling** de `profiles.status` a cada 5s (:43-68); ao `approved` espera 60s e entra (:70-85). Se o perfil for deletado → `rejected` (:55-59).
3. Admin → `AdminGuard.tsx:19` exige `is_super_admin` senão volta a `/`.
4. `UsersPage.tsx:73-82`: `?pending=<id>` abre `ApproveUserModal` automaticamente; lista pendentes/ativos (:84-85); `handleApprove` (:117-141) → `adminService.approveUser(userId, { roleId, app_access, workspace_ids })` (:76-97) grava `status='active'` e mapeia `roleId→role` legado via `ROLE_ID_TO_DB` (:10-14).
5. `rejectUser` (:99-118) **só deleta a linha do perfil** — o usuário auth do Supabase permanece e precisa ser removido manualmente no painel.

**Limitações atuais** (relevant pro RBAC 2.0):
- Aprovação é **global**, não por workspace.
- Cargo é escolhido **uma vez** no momento da aprovação (fixo para todos os workspaces).
- Rejeição não remove o auth user (trabalho manual).

---

## 4. Fluxo de Workspace (seleção)

- `WorkspaceContext.tsx`: `STORAGE_KEY='labhub_active_workspace'` (:20) e preferência por usuário `labhub_workspace_preference_<userId>` (:22-24).
- `assignedWorkspaces` (:53-61): `is_super_admin→todos`; `workspace_ids.length===0→todos`; senão filtra por membership.
- `load()` (:77-138): reutiliza preferência → auto-seleciona único → força o gate se múltiplos / super admin.
- `WorkspaceGate.tsx`: persist toggle (:44); contagens por workspace (:55-65); `handleDelete` via `POST /api/admin/workspaces/<id>/delete` (:67-107); modais Create/Settings/Apps/Duplicate/MoveData/ConfirmDelete (:196-263).
- `CreateWorkspaceModal` → `useWorkspaces().create({name, slug, location, spreadsheet_url, lab_count})` (:20-43). Super admin cria workspaces.

---

## 5. Roles & App Access (estado atual)

### Resolução efetiva de acesso (`useAppAccess` + `permissionService.resolveAppAccess`, service.ts:82-93)

```
1. disabled_apps do workspace  → NÃO aqui (só no AppGuard depois da permissão)
2. principal: if is_super_admin → 'full'
3. override individual: user.app_access[appId]
     'none'  → null (deny explícito)
     outro   → override (vence cargo)
4. cargo:    role.appAccess[appId]
     ausente → null
```

- **Override individual vence cargo** (documentado em service.ts:78-81 e authorization.md). `none` nega explicitamente.
- **Escrita** = nível `'full'` (`canWriteApp`, service.ts:106-112; `requireWrite` :125-129).
- **QR** = permissão independente `canManageQr` (service.ts:115-122).
- **Liderança**: `Role.leaderId` existe no tipo e é editável na `RolesPage` (assign de um líder ao cargo: RolesPage.tsx:121/311) mas **não é usado por nenhuma lógica de autorização** — é só metadado de display.

> ⚠️ **Discrepância de ordem vs. documentação (ADR-008).** ADR-008/`authorization.md` dizem "**Workspace disabled ALWAYS wins** → checado primeiro", mas `AppGuard.tsx` checa **`canAccessApp` (permissão) na linha 30 ANTES de `isAppDisabled` (workspace) na linha 57**. Na prática muda qual mensagem o usuário vê (e, conceitualmente, a ordem do contrato) — relevante ao redesenhar.

---

## 6. AppGuard / AdminGuard / AuthGuard

- **AuthGuard** (`App.tsx:37-50`): não autenticado → `/login`; trata pendência com polling de 15s.
- **AppGuard** (`core/auth/AppGuard.tsx`): carrega → `!user`→login → `!canAccessApp`→"Acesso restrito" (:30-55) → `isAppDisabled`→"Indisponível no workspace" (:57-84) → children.
- **AdminGuard** (`core/auth/AdminGuard.tsx:19`): exige `is_super_admin`, senão `/`.
- Rotas: `/admin/*` é `AuthGuard → AdminGuard → AppGuard(appId="admin")` (`App.tsx:52-137`).

---

## 7. LocalStorage (inventário de chaves)

| Chave | Uso |
|---|---|
| `labhub_active_workspace` | workspace ativo selecionado |
| `labhub_workspace_preference_<userId>` | preferência por usuário |
| `labhub_*` (sync-dirty / tombstones / metadata) | fila de sincronização offline-first |
| coleções IndexedDB (`collections`) | `roles`, `user_profiles`, dados locais dos apps |

> `roles` e `user_profiles` (people) não têm representação em banco — **só local**.

---

## 8. Notificações

- Tabela real versionada: **`stock.notifications`** (migração 016) com `workspace_id TEXT, module, audience, targetRole, targetSuperAdmin, targetUserId`.
- `public.notifications` **não tem DDL versionada** no repo (migração 034 só mexe em policies — sugere que existe só no banco vivo, de scripts não versionados).
- Visibilidade: `notificationAppliesTo` (`core/notifications/visibility.ts:24-61`) — sem usuário → tudo; `muted` → nada; app-module exige acesso (`hasAppAccess`) e canal in-app; filtro por `workspace_id` via `workspaceStore.matches`; audience `role`/`workspace`/`user`; sem audience → só `is_super_admin`.
- Admin: `NotificationsPage` (Inbox/Rules/Send); `NotificationRulesTab` grava `notify_settings` (mas sem coluna no banco — ver ⚠️ §1).

---

## 9. Admin

- Rotas (`apps/admin/index.tsx:17-31`, dentro de `AdminLayout`): `index, users, users/:id, requests, roles, workspaces, notifications, logs, settings, backups, profile`.
- Deps: `AdminDashboard` (useAuth/useWorkspace/useLogs/useNotifications/useUsers/adminService), `UsersPage` (adminService/useAuth/workspaceService/useWorkspace/useRoles/ApproveUserModal), `UserDetailPage` (+logService), `RequestsPage` (listPendingProfiles), `RolesPage` (useRoles+adminService+appRegistry), `WorkspacesPage` (useWorkspaces/DuplicateStructure), `SettingsPage` (wipeAllData), `NotificationsPage` (useFastSync 10s), `BackupsPage` (workspaceBackupService), `LogsPage` (useLogs, `platform/Admin/LogsPage.tsx:70-71`).
- **Admin = somente `is_super_admin`** (AdminGuard). Não há "admin por workspace".

---

## 10. Gap Analysis — atual vs. RBAC 2.0

Modelo-alvo: `USER → MEMBERSHIP → { Workspace, Status, Role, App Access, Actions, Overrides, Liderança }`.

| # | Área | Estado atual | Alvo RBAC 2.0 | Gap | Classificação |
|---|---|---|---|---|---|
| 1 | Membership explícita | Array `profiles.workspace_ids`; sem tabela própria | Entidade `memberships` (workspace + role + status + app_access + actions + overrides + liderança) por associação | **Não existe entidade de membership** — tudo global no perfil | 🔴 Ausente (núcleo) |
| 2 | Role por workspace | Cargo **único global** (`profiles.role`) | Role **por membership** (cada associação tem seu cargo) | Um usuário não pode ter cargos diferentes em workspaces distintos | 🟡 Remodelar |
| 3 | Status por workspace | `status` global (`active/pending`) | Status por associação (aprovado no A, pendente no B) | Aprovação hoje é global, uma vez | 🟡 Remodelar |
| 4 | App Access global vs. por membership | `app_access` jsonb no perfil (global) + `role.appAccess` | App Access por membership | Overrides não são escopados por workspace | 🟡 Remodelar |
| 5 | Actions (permissões granulares) | Só `canWrite` (full) + `canManageQr` | Permissões de ação por membro | Não há catálogo de ações além de full/read/none | 🔴 Ausente |
| 6 | Overrides por membership | Override individual global vence cargo (service.ts:88-92) | Override por associação | Overrides não distinguem workspace | 🟡 Remodelar |
| 7 | Liderança | `Role.leaderId` = metadado de display só | Liderança como relação na membership (líder do workspace/módulo) | Não há efeito real em autorização | 🔴 Ausente |
| 8 | Tabela `roles` no banco | Cargos **só locais** (IndexedDB) | Cargos versionados/compartilháveis | Cargos não sincronizam entre dispositivos/usuários | 🔴 Ausente |
| 9 | `notify_settings` | Coluna inexistente no SQL | (garantir persistência) | Bug latente — UI escreve em coluna inexistente | ⚠️ Risco |
| 10 | `public.notifications` | Sem DDL versionada | (padronizar) | Tabela existe só no banco vivo | ⚠️ Risco |
| 11 | Ordem AppGuard | permissão antes de workspace (AppGuard.tsx:30/57) | workspace-disabled sempre vence (ADR-008) | Discrepância código × documentação | ⚠️ Risco |
| 12 | Super admin | `is_super_admin` boolean global, bypass total | `is_super_admin` como role/flag de sistema | Não é "membro"; ok, mas sem vínculo a workspace | 🟡 Remodelar |
| 13 | `user_profiles` (people) local | `createSyncService<Role>`/`<UserProfile>` locais | (reavaliar se pertence ao novo modelo) | Duas "famílias" de user profile | 🟡 Remodelar |
| 14 | Aprovação | Global, cargo fixado na aprovação, reject não remove auth user | Aprovação por associação (workspace) | Fluxo precisa ser por-membership | 🟡 Remodelar |
| 15 | Admin por workspace | Só `is_super_admin` | Admin/gestor por workspace via membership | Sem "dono/gestor de workspace" | 🔴 Ausente |
| 16 | Audit de acesso | `logs` locais apenas; `workspace_audit_logs` (021) existe no banco | Trilha de autorização rastreável | Pouca cobertura da matriz de permissões | 🟡 Remodelar |

---

## 11. Riscos

1. **🔴 Núcleo: não existe membership.** Sem tabela de associação, é impossível ter role/status/app-access/overrides/liderança por workspace — é o maior gap e o que justifica a migração.
2. **🟡 Cargos não são persistidos em banco.** Migrar para RBAC 2.0 exige criar `roles` (e provavelmente `memberships`) no SQL e definir a estratégia de migração de cargos locais → banco (sem perder `DEFAULT_ROLES` nem os personalizados).
3. **⚠️ Bug latente `notify_settings`.** Coluna inexistente no SQL — o `NotificationRulesTab` grava e o `updateUserProfile` manda para o banco. Deve ser resolvido junto ou antes da migração.
4. **⚠️ `public.notifications` sem DDL versionada** — risco de divergência entre ambientes (dev/staging/prod).
5. **⚠️ Discrepância de ordem AppGuard vs. ADR-008** — se o novo modelo mantiver "disabled wins", o guard precisa ser reescrito na ordem correta (documentada) para não haver divergência de contrato.
6. **Data-migration risk:** `profiles.workspace_ids` → tabela `memberships` é transformadora (array → linhas). Requer script de migração + validação de duplicatas/consistência com `app_access`, `role` e `is_super_admin`.

---

## 12. Arquivos envolvidos (para a decisão)

- **Tipos/alvo:** `src/core/auth/types.ts` (`User`), `src/core/workspaces/types.ts` (`Workspace`), `src/core/permissions/types.ts` (`Role`, `AppAccessLevel`, `AppAccessOverride`, `DEFAULT_ROLES`, `resolveRoleId`).
- **Autorização:** `src/core/auth/AppGuard.tsx`, `AdminGuard.tsx`, `AuthGuard.tsx`; `src/core/permissions/usePermissions.ts` (`useAppAccess`), `service.ts` (`resolveAppAccess`, `canWriteApp`, `canManageQr`, `migrate`, `getRoleForUser`).
- **Admin/uml:** `src/core/auth/adminService.ts` (profiles/aprovação/`ROLE_ID_TO_DB`); `src/apps/admin/pages/{UsersPage,RequestsPage,UserDetailPage,RolesPage,WorkspacesPage,NotificationsPage}.tsx`; `src/apps/admin/components/ApproveUserModal.tsx`; `src/apps/admin/layouts/AdminLayout.tsx`.
- **Workspaces:** `src/core/workspaces/{WorkspaceContext,service,store,useWorkspaces,backupService}.ts`; `src/platform/WorkspaceGate/WorkspaceGate.tsx`.
- **Persistência:** `src/lib/supabase.ts`, `src/lib/sync.ts`, `src/lib/db.ts`, `src/lib/storage.ts`.
- **Notificações/logs/people:** `src/core/notifications/{visibility,service}.ts`; `src/core/logs/useLogs.ts`; `src/core/users/{service,useUsers}.ts`.
- **SQL:** `supabase/migrations/000–035` (chaves: 001, 009, 012, 013, 015, 019, 024, 027, 028, 031, 034); `supabase/archive/manual-sql/*`.
- **Docs de referência:** `docs/architecture/authorization.md`, `docs/decisions/ADR-008-three-layer-access-control.md`, `docs/architecture/authentication.md`, `docs/decisions/ADR-004-workspace-isolation.md`.

---

## 13. Recomendação de arquitetura

Em direção ao modelo `USER → MEMBERSHIP → Workspace/Status/Role/App Access/Actions/Overrides/Liderança`, sem comprometer decisão final:

1. **Criar a entidade núcleo `memberships`** (SQL): `(workspace_id FK, user_id FK, role_id FK, status, app_access jsonb, actions jsonb, overrides jsonb, leader_id FK?, created_at, updated_at)` — uma linha por associação. É o coração do RBAC 2.0 e a única forma de separar role/status/access por workspace.
2. **Versionar `roles` no banco** (evoluindo os cargos locais): `roles(id, key, name, description, app_access, manage_qr, is_default)` — para não perder os `DEFAULT_ROLES` nem os personalizados; a migração deve puxar os cargos locais como seed inicial.
3. **Mover a aprovação para por-associação**: em vez de aprovar o usuário globalmente, aprovar/atribuir a um workspace (o que naturalmente vira um registro em `memberships`).
4. **Liderança como relação na membership** (`leader_id` apontando para outro membro do mesmo workspace), não como atributo de cargo sem efeito de autorização.
5. **Manter `is_super_admin` como flag de sistema** (produtor/global), **fora** de membership, para continuar o bypass de plataforma sem acoplar a um workspace.
6. **Alinhar a ordem** do guard com a documentação (workspace-disabled antes de permissão) para evitar o conflito ⚠️ nº 11 e tornar o contrato previsível.
7. **Resolver os bugs latentes junto à migração**: coluna `notify_settings` (criar ou remover), e DDL versionada para `public.notifications`/logs se forem mantidos.
8. **Plano de migração de dados**: script transformando `profiles.workspace_ids` + `profiles.role` + `profiles.app_access` em linhas de `memberships`, com dry-run e validação de consistência antes do cutover.

> **Próximo passo (fora do escopo desta auditoria):** após a decisão do modelo final, elaborar a migração SQL (`memberships`, `roles`), o plano de seed/backfill e as mudanças de `AppGuard`/`adminService`/`WorkspaceContext`. **Nenhuma alteração foi feita nesta auditoria.**
