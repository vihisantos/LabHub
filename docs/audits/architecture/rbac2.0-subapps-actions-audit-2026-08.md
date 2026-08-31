# LabHub — Auditoria de Autorização por Sub-App / Actions 2.0

> Auditoria **read-only** (2026-08-29). Nenhum código, migration, banco, Action ou permissão foi alterado/criado.
> Objetivo: mapear factualmente como **cada sub-app** funciona hoje (App Access, operações reais, escopo, identidade do usuário, notificações, logs, segurança) para **depois** desenharmos juntos o catálogo definitivo de Actions do RBAC 2.0.

- Legenda: 🟢 protegida corretamente · 🔶 proteção somente frontend · 🟠 proteção parcial · 🔴 sem proteção suficiente · ⚠️ comportamento inconsistente.
- Termos: `EXISTE HOJE` / `NÃO EXISTE HOJE` / `PROBLEMA ATUAL` / `POSSÍVEL FUTURO`.
- Onde não foi possível determinar: `NÃO DETERMINADO`.

---

## 1. Apps encontrados

Lista real do `appRegistry` (`src/appRegistry.ts:31-92`) + rotas em `src/App.tsx`. **Não assume lista fixa — esta é a lista real no código.**

| App | appId | Rotas | App Access atual | Backend | RLS |
| --- | ----- | ----- | ---------------- | ------- | --- |
| Dashboard | `dashboard` | `/dashboard`, `/` | AppGuard `dashboard`; `canAccessApp` | nenhum | n/a |
| PC Care | `pc-care` | `/pc-care/*` (+ legacy `/pcs*`) | AppGuard `pc-care`; `dash/read/full`; `requireWrite('pc-care')` | só wipe e push (cron) | pcare.* workspace via 027 (7 tabelas sincronizadas); `pcare.assets` só legacy `assets_all` |
| Estoque | `stock` | `/stock/*`, `/general-stock/*` (ambos `stock`) | AppGuard `stock`; `dash/read/full`; `requireWrite('stock')` | `/api/push/notify-*`, check-overdue | stock.* workspace via 027 |
| ReservaLab | `reservalab` | `/reservalab*` | AppGuard `reservalab`; `dash/read/full`; `getLevel==='full'` p/ escrever | `/api/reservas` (público), push | `tablet_reservations` workspace via 028/034 |
| TV | `tv` | `/tv` (+ `/pedir-musica` só AuthGuard) | AppGuard `tv`; **`dash/read` também entra**; **sem `requireWrite`** | `/api/tv/*`, `/api/push/check*` | tv_* via 030/033; music requests 019/033 |
| Chamados | `chamados` | `/chamados/*` | AppGuard `chamados`; `dash/read/full`; `requireWrite('chamados')` | `/api/chamados*` (Flask, `@require_auth`) | `chamados_tickets`/`ticket_events` **REVOKE ALL** (service_role only) |
| Chamados Público | *(não tem appId — não está no registry)* | `/chamados-publico/*` (sem guard) | **nenhum guard** | `/api/chamados/...` públicos por token | chamados (via API projection); **lê stock/pcare local unfiltered** 🔴 |
| Admin | `admin` | `/admin/*` | AuthGuard+AdminGuard+AppGuard `admin`; **só `is_super_admin`** | `/api/admin/*` `require_auth`+super admin | profiles/workspaces RLS super admin; backups/audit service_role only |
| *(planejado)* Painel de Chamados | `chamados-dashboard` | `/chamados-dashboard` | não registrado | — | TV kiosk display (device-only) |

Nota de arquitetura: appId é duplicado em muitos lugares (ver §15). `chamados-publico` é o **único app que não tem appId no registry** (rota em `src/App.tsx:125`, sem guard).

---

## 2. Chamados

### 1. Identificação
- **appId:** `chamados` · registro `src/appRegistry.ts:77` · rota `/chamados/*` (`src/App.tsx:118-120`).
- **Páginas:** index→Dashboard, `sla`, `reports`, `ranking`, `tickets`, `tickets/:id`, `qr`, `settings` (`src/apps/chamados/index.tsx`).
- **Services:** `ticketService` (`createSyncService('chamados')`), `roomService`, `problemTemplateService`, `slaConfigService`, `publicTicketService`, hooks `useTickets`/`TicketsContext`.
- **Backend:** `api/app.py` — `POST /api/chamados` (:1806), `GET/PATCH/DELETE /api/chamados/<id>` (:1954/1998/2026), events (:2859/2907), reports (:2347), weekly-email (:3081), push/test (:2556), photos purge (:3139), workspaces (público, :1786), endpoints públicos por token (:2434-2532), `GET /api/tv/chamados/display` (:1482).

### 2. App Access atual
- Guard: `AppGuard appId="chamados"` (`src/App.tsx:120`); `AppGuard.tsx:30` `!canAccessApp` → denied; `:57` `isAppDisabled` → indisponível.
- Níveis: `'dash'|'read'|'full'` (`types.ts:1-4`); default roles: technician → `chamados:'full'` (:50), outros → `'read'` (:64).
- `requireWrite('chamados')` no serviço = só `'full'` escreve (`ticketService.ts:131,156`; `slaConfigService.ts:50`; `roomService`/`problemTemplateService`).
- `manageQr` separado p/ QR (`UnitQR.tsx:12,64`).
- **⚠️ Backend:** gestão usa só `@require_auth` + escopo por workspace (ownership); **não valida nível `'full'`/`require_module`** nos PATCH/DELETE/events (`/api/chamados/<id>`). A autorização app-level é **somente frontend**. (🟠)

### 3. Operações reais
| Operação | Arquivo/função/endpoint | Proteção atual |
|---|---|---|
| Abrir chamado (interno) | `ticketService.create` → `POST /api/chamados` | frontend `canWrite`; backend público com rate-limit + `require_module` |
| Criar chamado público | `ticketService.createWithToken` → `POST /api/chamados` | público (token) |
| Listar | `GET /api/chamados` | `@require_auth` + escopo workspace |
| Ver detalhe | `GET /api/chamados/<id>` | `@require_auth` + escopo workspace |
| Editar/status/atribuição | `ticketService.update` → `PATCH /api/chamados/<id>` | frontend `requireWrite`; backend só `@require_auth`+workspace 🟠 |
| Comentar/foto | `ticketService.addEvent` → `POST .../events` | idem 🟠 |
| Excluir | `ticketService.remove` → `DELETE /api/chamados/<id>` | idem 🟠 |
| Feedback público | `POST /api/chamados/<token>/feedback` | token + rate-limit |
| SLA/templates | `slaConfigService.update` | **local-only** (sem backend) |
| Relatório semanal/email | `POST .../reports/weekly-email` | `@require_auth` + admin |
| Gerar QR | `UnitQR.tsx` | `canManageQr()` |

### 4. Ações especiais
Abrir chamado (público, por token), atribuir, alterar status, encerrar/reabrir, comentar, gerar QR, feedback, relatório semanal. (Só listado; **sem propor Actions**.)

### 5. Dependências
- Atribuir/editar/encerrar → pressupõe ver detalhe (escopo por workspace valida) e nível write (`frontend`).
- Gerar QR → `manageQr` independente do nível do app.
- Comentário/foto → pressupõe chamado existente + workspace.

### 6. Escopo dos dados
- **Escopo atual:** workspace (server-side `workspace_ids`/`is_super_admin` em todo list/get/manage/events/reports). `user_belongs_to_workspace` no RLS fica a cargo da API (tabelas REVOKE ALL).
- **Escopo implícito por usuário (próprio/atribuído):** `NÃO EXISTE HOJE` como distinção formal; há `reportedBy`/`assignedTo` mas não há filtro "meus chamados" imposto por permissão.
- **Público:** token → só o próprio chamado.

### 7. Identidade do usuário
- Campos: `reportedBy`, `reportedByEmail`, `assignedTo`, `assignedToUserId`, `closedBy`, `tracking_token_hash` (035). **`created_by` NÃO EXISTE** (create grava `reportedBy`/`assignedTo`).
- Público: identidade = `tracking_token_hash` (SHA-256), nome auto-relatado (não verificado).

### 8. Notificações
- Novo chamado → push p/ TI (`_notify_new_ticket`, `app.py:1739`) via `_target_subs(module='chamados')`.
- Mudança de status → push p/ professor via assinaturas por chamado `push:chamado:{ticket_id}` (Redis).
- Atribuição → push direto ao técnico por `user_id`.
- Weekly email (Resend). Filtros: módulo/workspace/user + `notify_settings`.

### 9. Auditoria / Logs
- Timeline `ticket_events` (server-side) grava eventos de domínio (`type/content/author/photo_urls`).
- `logService` local (`audit_logs`) `created/updated/status_changed` — **local-only**, autores `'public'/'system'`.
- **Não loga:** acesso, alterações de cargo, wipe.

### 10. Segurança
- 🟢 RLS fechado (REVOKE ALL, 0 policies) — `000:598-601`, `028:294-303`.
- 🟢 Token hash-only, sem query-string, rate-limit (`app.py:78-117`).
- 🟢 Isolamento workspace server-side + hardening `033`.
- 🟠 Endpoints de gestão com `@require_auth` mas **sem `full`/`require_module`**.
- 🟠 Create público (rate-limit in-memory).

---

## 3. TV

### 1. Identificação
- **appId:** `tv` · registro `src/appRegistry.ts:65` · rota `/tv` (`src/App.tsx:111-117`); `/pedir-musica` só AuthGuard (`src/App.tsx:78-81`). `configurable/clearable/settings/SettingsPanel` definidos.
- **Páginas:** `Admin.tsx` (AdminView com Event/Playlist/Queue/MusicRequest/Gallery/Announcement/Device/Calendar managers), `TvDisplay.tsx` (kiosk, via tv-desktop).
- **Services:** `src/apps/tv/services/supabase.ts` (CRUD direto no cliente), `useMusicRequests`, `usePlaylists`, etc.
- **Backend:** `api/app.py` (`/api/tv/source/fetch`, cloudinary/delete, purge/describe, activation/create, activation/redeem, devices/provision, chamados/display) + legacy `src/apps/tv/api/app.py` (youtube fetch/search **sem authz**).

### 2. App Access atual
- Guard `AppGuard 'tv'` (`src/App.tsx:117`); `canAccessApp` → **qualquer nível não-nulo passa** (`AppGuard.tsx:30`). **Sem exigência de `full`**.
- Default roles **NÃO** concedem `tv` (`types.ts:46-51,60-65`) → `/tv` efetivamente só super admin ou acesso manual.
- **TV é o único app SEM `requireWrite('tv')` no serviço** (0 ocorrências em `src/apps/tv/**`) — todos os writes dependem de RLS.
- `disabled_apps` interfere no frontend (`isAppDisabled`) e backend (`require_module_auth('tv')`).

### 3. Operações reais
| Operação | Arquivo/função/endpoint | Proteção atual |
|---|---|---|
| Ver murais/conteúdo (kiosk) | `TvDisplay.tsx` | 🟢 RLS `can_access_tv_workspace` |
| Criar/editar/excluir eventos, playlists, queues, anúncios, galerias | managers → `supabase.ts` CRUD | 🔴 **sem guard frontend**; só RLS `tv_can_manage_workspace` (qualquer membro do ws escreve) |
| Pedir música | `useMusicRequests.request` → `createMusicRequest` (`supabase.ts:443`) | 🟢 RLS insert `auth.uid()=requested_by`; rota só AuthGuard (qualquer autenticado) |
| Aprovar/recusar música | `useMusicRequests.approve/reject` (`:80-127`) | ⚠️ **inconsistente**: UI exposta a qualquer `/tv`, RLS update só `is_super_admin` |
| Gerenciar dispositivos | `useDevices` → `updateDevice/deleteDevice` (`:416-430`) | 🟠 sem guard frontend; RLS `tv_can_manage_workspace`/`tv_device_owned` |
| Playback/controle TV | `MusicQueuePlayer.tsx`/`TvDisplay.tsx` | local UI apenas |
| Purge de dados | `api/app.py:2780` | 🟢 `require_auth`+ws+app-manager + RPC service_role |

### 4. Ações especiais
Pedir música, aprovar música (com side-effect em tracks/queues), gerenciar dispositivo kiosk, controle de playback, purge por app, `GET /api/tv/chamados/display` (device-only).

### 5. Dependências
- Aprovar música → pressupõe pedido existente + resolve metadados YouTube; aborta sem `youtube_video_id` (`:56-61,82-85`).
- Aprovar → cria/atualiza queue e tracks (`:86-117`).
- Gerenciar dispositivos → pressupõe provisão backend (identidade GoTrue kiosk).
- Conteúdo → vínculo ao workspace do dispositivo.

### 6. Escopo dos dados
- **Todo conteúdo é `workspace_id`-scoped** (030/033; `workspace_id NOT NULL`). Child tables (tracks/photos) escopadas por JOIN ao pai.
- `NÃO EXISTE HOJE`: escopo "todos os workspaces" (não diferenciado); só `is_super_admin` cruza workspaces.
- Pedir música: próprio → ws (no insert o `workspace_id` não é amarrado por RLS à membership — só o SELECT é ws-scoped; gap de integridade no insert).

### 7. Identidade do usuário
- `tv_music_requests`: `requested_by`, `requested_by_name`, `reviewed_by`, `reviewed_at` (019).
- Conteúdo TV: **sem `created_by`/`autor` (NÃO EXISTE HOJE)**.
- `tv_devices`: `user_id` (dono kiosk), `last_seen`.

### 8. Notificações
- **NÃO EXISTE hoje notificação de TV.** Nenhum `push_notify` para módulo `tv`. Só Realtime in-app + toasts locais. Sem email/push para pedido/aprovação/dispositivo.

### 9. Auditoria / Logs
- **Loga:** purge (`workspace_audit_logs`, 032), settings (`updated_by` em `workspace_app_settings`), erros backend.
- **NÃO loga:** CRUD de conteúdo, pedir/aprovar música (só campos no row), rename/delete dispositivo, anúncio urgente, provisão kiosk (só `status='used'`).

### 10. Segurança
- 🟢 kiosk/device authz + `chamados/display` + source/fetch + cloudinary/delete + purge.
- 🔴 **CRUD de conteúdo sem `requireWrite`** — só RLS (membro do ws escreve).
- ⚠️ aprovação música (UI vs RLS super-admin).
- 🟠 rota `/tv` aceita `read` como acesso admin; default roles não dão `tv`.
- 🔴 **legacy `src/apps/tv/api/app.py` (youtube fetch/search) sem authz nenhuma** (:62,:157).

---

## 4. Estoque

### 1. Identificação
- **appId:** `stock` · registro `src/appRegistry.ts:49` · rotas `/stock/*` e `/general-stock/*` (ambas `AppGuard 'stock'`, `src/App.tsx:90-103`; prefixo normalizado em `stockPath.ts`).
- **Páginas:** Dashboard, Section, Item detail, Movements, Entry/Exit, Kits, Inventory, Maintenance, Pipeline, QR generate/scan, Layout (`src/apps/stock/index.tsx:19-34`).
- **Services:** `stockService`, `movementService`, `kitService`, `inventoryService`, `stockMaintenanceService` — todos com `requireWrite('stock')`.
- **Backend:** `src/apps/reservalab/api/app.py` → `/api/push/notify-loan` (:903), `notify-return` (:938), `check-overdue` (:1018), push (cron).

### 2. App Access atual
- Guard `AppGuard 'stock'`; nível `'full'` p/ escrever (`requireWrite('stock')`); `isFullAccess('stock')` nas páginas; `disabled_apps` interfere.
- Sync remoto: RLS `user_belongs_to_workspace` é o enforcement remoto (`sync.ts:206,226`).
- **⚠️ `getAllUnfiltered`** (`stockService.ts:17`, `core/assets/service.ts:71,88`) alimenta a rota pública `chamados-publico/*` (ver §8) — leitura anônima de todos os itens 🔴.

### 3. Operações reais
| Operação | Arquivo/função/endpoint | Proteção atual |
|---|---|---|
| Ver itens/movimentações/kits | `getAll` filtrado por `workspaceStore.filter` | 🟢 frente + RLS |
| Criar/editar item | `stockService` `requireWrite` | 🟢 (frontend `full` + RLS) |
| Movimentar (8 tipos) | `movementService` + `movementEffects.ts` | 🟢 requireWrite |
| Conferir kit | `kitService` | 🟢 requireWrite |
| Ciclo/contagem inventário | `inventoryService` | 🟢 requireWrite |
| Manutenção/agendar/completar | `stockMaintenanceService` | 🟢 requireWrite |
| Escanear/gerar QR | `QRScanner`/`QRGenerator` | 🟢 tela `isFullAccess` |
| Exportar CSV | `utils/export.ts` | 🟢 tela gate |
| Alerta de validade | `expiryAlerts.ts:43` | in-app ws-scoped |

### 4. Ações especiais
Escaneamento QR, conferência de kit, movimentação/entrada/saída/empréstimo/devolução, ciclo de inventário, alertas de validade, "ativar como PC".

### 5. Dependências
- Movimentar → pressupõe item existente + `requireWrite`.
- Conferir kit → pressupõe itens do kit visíveis.
- `movementEffects.ts:8-22` envia `notify-loan/return` **sem header Authorization e sem workspace_id** → 401 engolido → **push nunca dispara** (⚠️ morto); mesmo se autenticado, sem ws_id faria `_target_subs(module='stock', workspace_id=None)` => todos os workspaces.

### 6. Escopo dos dados
- **Escopo atual:** workspace (RLS 027 em todas as 6+ tabelas stock; `workspace_id NOT NULL` pós-033). `is_super_admin` cruza.
- **Escopo por usuário (próprio/atribuído):** `NÃO EXISTE HOJE`.
- **⚠️ `getAllUnfiltered` ignora `workspaceStore.filter`** (`storage.ts:5-9`) → expõe todos os itens numa rota pública.

### 7. Identidade do usuário
- **NÃO EXISTE hoje:** nenhum campo autenticado; `performedBy`/`borrowedBy`/`borrowerContact` são **texto livre digitado** pelo operador (`MovementForm.tsx:21-24`); `StockItem` sem `createdBy`.

### 8. Notificações
- Alertas de validade: in-app ws-scoped (`expiryAlerts.ts:43-59`).
- Push `notify-loan/return`: **morto** (sem Authorization). Cron `check-overdue` lê todos os empréstimos sem escopo por ws (padrão de escopo ⚠️).

### 9. Auditoria / Logs
- **`audit_logs` é LOCAL_ONLY** (`sync.ts:126`) → estoque **não tem log persistido**.
- Não há log de servidor para itens/movimentações/conferência.

### 10. Segurança
- 🟢 requireWrite + RLS nas operações de escrita.
- 🔴 **gotch de getAllUnfiltered na rota pública** (leak anônimo).
- ⚠️ push morto (notify-loan/return) — sem leak (não dispara) mas inoperante.
- 🔴 `check-overdue` (cron) processa todos os workspaces sem escopo por usuário.

---

## 5. PC Care

### 1. Identificação
- **appId:** `pc-care` (módulo/coleção/key é `pcare`) · registro `src/appRegistry.ts:41-47` · rota `/pc-care/*` (`src/App.tsx:83-89`).
- **Páginas:** Dashboard, PCList/PCForm/PCDetail, PartsList, StockConsolidado, QRGenerator, QRScanner, ChecklistTemplates, ChecklistExecute, Reports, Maintenance, Settings (`src/apps/pcare/index.tsx:31-60`).
- **Services:** `assetService`, `pcService`, `partService`, `partUsageService`, `maintenanceService`, `checklistService` — todos `requireWrite('pc-care')`.

### 2. App Access atual
- Guard `AppGuard 'pc-care'`; `requireWrite('pc-care')` nas escritas; `isFullAccess` nas páginas; `manageQr` separado; `disabled_apps` interfere.
- `actionLogService.log/remove` **sem `requireWrite`** (🟠).
- **Upload Cloudinary com API_KEY hardcoded no cliente** (`PCPhotoUpload.tsx:9-11`, unsigned) ⚠️.

### 3. Operações reais
| Operação | Arquivo/função/endpoint | Proteção atual |
|---|---|---|
| Criar/editar ativo | `assetService` (create/update) | 🟢 requireWrite |
| CRUD peças | `partService` | 🟢 requireWrite |
| Usar/reembolsar peça | `partUsageService` | 🟢 requireWrite |
| CRUD manutenção | `maintenanceService` | 🟢 requireWrite |
| CRUD templates checklist | `checklistService` | 🟢 requireWrite |
| Executar checklist | `ChecklistExecute.tsx` | ⚠️ **não persiste nada** (só navega) |
| Gerar QR | `QRGenerator.tsx` (redireciona p/ `/stock/qr`) | 🟢 tela |
| Reports/export | `Reports.tsx`, `utils/export.ts` | 🟢 `isFullAccess` |
| Limpar todos os dados | `Settings.tsx:301` | ⚠️ só local; sync pode reidratar |

### 4. Ações especiais
Gerar/mover QR (QR pertence ao Stock), ajustar estoque de peças, checklist (não persistido), mantenção/agendar.

### 5. Dependências
- Usar peça → pressupõe peça existente.
- Executive checklist depende de template (`checklistService`), mas não grava execução.

### 6. Escopo dos dados
- **Frontend:** `workspace_id` gravado no create (`storage.ts:17-24`), filtro via `workspaceStore.filter`.
- **Remoto:** pcare.* ws-scoped via 027 (7 tabelas). `pcare.assets` tem só policy legacy `assets_all` (USING true) mas **sem grant p/ authenticated** (000 omitido) + local-only → **mitigado por grant, não por RLS** (débito 029/README).
- `public.assets` (registro global): ws-scoped (024/033).
- **Por ativo (marca/modelo/status):** `NÃO EXISTE HOJE`. Granularidade máx = app-level + workspace.

### 7. Identidade do usuário
- **NÃO EXISTE hoje:** nenhum `created_by` nos types pcare (grep vazio). `ActionLog` sem `user_id` (DDL `action_logs` 000:307 sem coluna de usuário). `GlobalAsset` carimba `workspace_id`+`created_by`.

### 8. Notificações
- **In-app pcare: NÃO EXISTE HOJE** (nenhum `notificationService.create` em fluxo pcare).
- **Push:** cron `/api/push/check-pcare` (`reservalab/api/app.py:1104-1188`) coleta peças/manutenção de **TODOS os workspaces** e envia para `_target_subs(module='pc-care')` **sem workspace_id** → 🔴 **vazamento cruzado de workspaces**.

### 9. Auditoria / Logs
- `action_logs` existe, mas **ninguém escreve** na prática (só leitura em Dashboard/Settings; código morto). Sem usuário, sem guard.

### 10. Segurança
- 🟢 requireWrite + RLS nas escritas de dados.
- 🔴 push cross-workspace (`check-pcare`).
- 🟠 `actionLogService` sem guard + sem usuário.
- 🟠 `pcare.assets` legacy `assets_all`.
- ⚠️ Cloudinary API_KEY unsigned no cliente; checklist não persistido; wipe local reidrata.

---

## 6. ReservaLab

### 1. Identificação
- **appId:** `reservalab` · registro `src/appRegistry.ts:57` · rotas `/reservalab`, `/reservalab/dashboard`, `/reservalab/tablets` (`index.tsx:7-17`).
- **Páginas:** `Reservas.tsx`, `Dashboard.tsx`, `Tablets.tsx`, layout + components.
- **Services:** `services/api.ts` (Flask), `services/supabase.ts` (tablet_reservations CRUD).
- **Backend:** `src/apps/reservalab/api/app.py` — `/api/reservas` (:406), `/api/push/*` (:498-1326), `check`/`check-overdue`/`check-pcare`/`check-all` (cron).
- `configurable` **NÃO está definido** → reservalab não usa `workspace_app_settings`.

### 2. App Access atual
- Guard `AppGuard 'reservalab'`; níveis `dash/read/full`; `getLevel==='full'` p/ escrever (`Tablets.tsx:51`).
- `'dash'` → redirect p/ dashboard (`ReservaLabLayout.tsx:18-23`), vê só tab Dashboard (`Navbar.tsx:28-30`).
- **Backend NÃO consulta nível do app.** `/api/reservas` **sem auth decorator** (público, confia em `?workspace=` slug) — `app.py:406-407`. CRUD de tablets via cliente anon + RLS.
- RLS `tablet_reservations`: SELECT/INSERT/UPDATE = `is_super_admin() OR user_belongs_to_workspace(workspace_id)`; **DELETE = `is_super_admin()` only** (028:249-251, 034:94-98).

### 3. Operações reais
| Operação | Arquivo/função/endpoint | Proteção atual |
|---|---|---|
| Ver reservas de lab (planilha) | `Reservas.tsx`, `api.ts`, `GET /api/reservas` | 🔴 **público**, por slug, sem auth |
| Ver dashboard | `Dashboard.tsx` | 🟢 AppGuard |
| Ver reservas de tablets | `supabase.ts:16-38` | 🟢 RLS |
| Criar reserva de tablet | `Tablets.tsx:110`, `supabase.ts:40` | 🔶 `'full'` só frontend + RLS insert (qualquer membro) |
| Cancelar reserva de tablet | `Tablets.tsx:150`, `supabase.ts:52` | ⚠️ UI "full" mas RLS DELETE só super admin; hard delete |
| "Inventário" | `Dashboard.tsx:242` (redirect /stock) | n/a |
| Config planilha | `WorkspaceSettingsModal` | 🟢 RLS super admin |

### 4. Ações especiais
Reservar/cancelar tablet (só write real), **reservar lab não existe como write** (planilha é a fonte, read-only no app), criar evento na TV (redirect), push test/send/action (admin).

### 5. Dependências
- Criar tablet → ver lista + `'full'` + workspace ativo + validação form.
- Cancelar → existe + `canCancel` + (de fato) super admin.
- Views lab → `workspaces.spreadsheet_url` configurado.
- Push → assinatura em Redis + `_target_subs(module='reservalab')`.

### 6. Escopo dos dados
- **Lab:** por slug do `?workspace=` (request-chosen, não autenticado) → qualquer caller lê qualquer campus 🔴. `NÃO EXISTE HOJE` escopo próprio vs todos.
- **Tablets:** workspace (RLS); sem escopo por usuário (`NÃO EXISTE HOJE`).
- Delete tablet: prático = somente super admin (não ws-scoped).

### 7. Identidade do usuário
- `tablet_reservations`: `professor`, `reservado_por` (texto livre, auto = `user.name`), **sem user_id FK, sem timestamps** (028:194-198).
- Lab: `professor_resp`/`reserva_feita_por` da planilha.

### 8. Notificações
- **Events (reservalab feed):** cron `check` → push para `_target_subs(module='reservalab')` quando reserva começa em ≤15min (2h dedup; janela hardcoded). Tablets filtram por `workspace_id` da row.
- **Destinatário:** broadcast p/ assinantes com acesso ao app no escopo — **não** por `reservado_por`.
- Email: nenhum.

### 9. Auditoria / Logs
- Backend loga envio de push (JSON logger). **Reservas** loga sem identidade (endpoint público).
- **NÃO loga:** criar/cancelar tablet (sem audit, sem soft-delete). Sem `workspace_audit_logs` p/ tablets.

### 10. Segurança
- 🔴 `/api/reservas` público (qualquer campus).
- 🟢 RLS tablets (select/insert/update).
- 🔶 `'full'` só frontend → consome anon direto (RLS permite membro).
- ⚠️ cancelar: UI "full" vs RLS super admin (inconsistência) + hard delete sem log.
- 🟠 push subscribe sem auth decorator (confia em `user.id` do body).

---

## 7. Admin

### 1. Identificação
- **appId:** `admin` · registro `src/appRegistry.ts:85` · rota `/admin/*` (`src/App.tsx:126-134`, `AuthGuard→AdminGuard→AppGuard`).
- **Páginas:** index/users/users/:id/requests/roles/workspaces/notifications/logs/settings/backups/profile (`src/apps/admin/index.tsx:18-30`).
- **Services:** `adminService` (`src/core/auth/adminService.ts`), `workspaceService`, `permissionService`, `backupService`, `authService`.
- **Backend:** `/api/admin/*` em `api/app.py` (`require_auth` + `_require_super_admin`), workspace delete com backup (:3415), restore (:3289), audit-logs (:3391), wipe (:2625).

### 2. App Access atual
- **Único caminho: `is_super_admin` global** (`AdminGuard.tsx:19`). `AppGuard('admin')` é redundante (super admin → full).
- Cargos: `createSyncService('roles')` **local-only** (`sync.ts:127`) → não sincroniza/audita no Supabase.
- RLS: `profiles_select` `USING(true)` (007) — **qualquer autenticado lê todos os perfis** 🔶; `profiles_update/delete` = `auth.uid()=id OR is_super_admin` (028).

### 3. Operações reais
| Operação | Arquivo/função/endpoint | Proteção atual |
|---|---|---|
| Listar perfis | `listAllProfiles` (RLS USING true) | 🟢 (porém PII exposta 🔶) |
| Aprovar usuário | `approveUser` + `notifyUser` | 🟢 super admin; grava `stock.notifications` |
| Recusar usuário | `rejectUser` → DELETE profile | 🟠 **não remove auth.users** (rejeitado pode relogar e recriar `active`) |
| Editar perfil/cargo/ws/overrides | `updateUserProfile` | 🟢 super admin; `notify_settings` sem coluna ⚠️ |
| CRUD roles | `RolesPage` (local) | 🟢 UI super admin; **local-only** |
| CRUD workspaces | `WorkspacesPage` | 🟢 RLS super admin; **delete sem backup/audit** (PostgREST direto) 🟠 |
| Notificações Inbox/Rules/Send | `NotificationsPage` | `notify_settings` **sem coluna** (inoperante); `POST /api/push/send` sem token 🟠 |
| Backups | `BackupsPage` | 🟢 super admin; restore/audit service_role |
| Wipe global | `SettingsPage`→`POST /api/admin/wipe` | 🟢 backend auth+token; fetch **sem Bearer** (reset.ts:21) 🔶 |
| Ver auditoria | `LogsPage` (local) | local-only |

### 4. Ações especiais
Wipe global (irreversível, `WIPE_TABLES` 27 tabelas, sem auditoria), purge por app (TV), restore, delete workspace com backup (só via WorkspaceGate), rejeição sem remover auth user.

### 5. Dependências
- Aprovar → workspace existente + cargo existente + `notifyUser` (stock).
- Users/Roles/Requests → `workspaceService.syncFromSupabase`.
- BackupsPage → `pruneExpired()` antes de listar.
- Delete workspace: front (PostgREST) ≠ backend (com backup) — duas rotas divergentes.

### 6. Escopo dos dados
- **Admin é global** (super admin). `NÃO EXISTE HOJE` admin por workspace (conceito só no backend de purge/backup via `can_manage_workspace_apps`).
- Cargos não persistidos; `notify_settings` sem coluna.

### 7. Identidade do usuário
- Sessão Supabase JWT; backend decodifica → `_get_user_profile` (service_role). `is_super_admin` é o único discriminador. `profiles.role` é cargo legado.

### 8. Notificações
- Aprovação/rejeição → `notifyUser` (stock, audience user).
- `notificationService.create`: sem ws_id → local (markDirty global); com ws_id → sync stock.
- Filtragem `notificationAppliesTo` (muted/channel/workspace/audience role/user). `muted` nunca persiste (sem coluna).

### 9. Auditoria / Logs
- **Local:** `logService` (`audit_logs`, LOCAL_ONLY) — created/updated/deleted/status_changed/viewed/exported.
- **Backend (paralelo, não visível no admin UI):** `workspace_audit_logs` (service_role) gravado no workspace delete (:3475) e restore (:3337); lido por `GET /api/admin/audit-logs`.
- **NÃO auditado:** aprovar/recusar usuário, wipe, alterar cargo (RolesPage local), Skills.

### 10. Segurança
- 🟢 guarda front + backend `/api/admin/*` (super admin).
- 🟢 ws_backups/audit/chamados isolados (service_role).
- 🔶 `profiles_select` USING(true) expõe PII (e-mail/workspaces) a todo autenticado.
- 🟠 rejectUser não remove auth user.
- 🟠 delete workspace sem backup/audit (rota PostgREST).
- 🟠 `notify_settings` sem coluna (PROBLEMA ATUAL).
- 🔶 wipe sem Bearer (depende de proxy).
- 🟠 cargos local-only (autorização diverge entre dispositivos, não auditável).

---

## 8. Outros apps / superfícies encontradas

### 8.1 chamados-publico (`/chamados-publico/*`) — sem guard
- Rotas: `room/:roomId`, `new`, `new-asset`, `success/:ticketId`, `track`, `feedback/:ticketId`.
- **Público (sem AuthGuard/AppGuard)** (`src/App.tsx:125`).
- Chamada por token (X-Tracking-Token) p/ criar/ver/feedback; projeção pública remove identidade/inputs internos.

- 🔴 **Vazamento de dados de inventário:** `RoomAssets.tsx:53` → `roomService.getAllUnfiltered()`; `TicketForm.tsx:27` → `roomService.getAllUnfiltered()`; `useRoomAssets.ts:35` → `assetService.getByRoomUnfiltered(roomName)`; `core/assets/service.ts:58,71,88` consome `pcService`/`stockService.getAllUnfiltered()`; `storage.ts:5-9` **`getAll(true)` ignora `workspaceStore.filter`**. Resultado: **visitante anônimo lê todos os itens de estoque/PC (nomes, seriais, salas, etiquetas) de todos os workspaces** 🔴.
- ⚠️ Resíduo de sessão: `RoomTicketForm.tsx:103` preenche campus de `workspaceStore.activeWorkspaceId` (localStorage) e `:128-133,492-504` renderiza nº de chamados em aberto do cache da sessão anterior.

### 8.2 Dashboard (`/`, `/dashboard`) — appId `dashboard`
- `AppGuard 'dashboard'` (`src/App.tsx:63`); excluído de `APPS_CONFIGURABLE` (`apps.ts:7`).
- Lê métricas/módulos via `ModuleStats`/`QuickActions`/`CommandPalette` (mapas hardcoded de módulo→appId: `ModuleStats.tsx:21-27`, `CommandPalette.tsx:17-23`, `QuickActions.tsx:7-36`).

### 8.3 `/pedir-musica` — só AuthGuard
- Rota sob **AuthGuard apenas** (não AppGuard `tv`) (`src/App.tsx:78-81`) → **qualquer usuário autenticado de qualquer app** pode pedir música, mesmo sem acesso ao app TV. `MusicRequest.tsx` → `useMusicRequests.request` → RLS insert `auth.uid()=requested_by` (019).
- 🟠 gap: pedido de música não exige acesso ao módulo TV nem checa `disabled_apps`.

### 8.4 Launcher
- **Código morto:** `src/pages/Launcher.tsx` (grade de apps não gated; 0 referências) — o launcher real é outro (ver `src/pages/...`). Flavoured: `appRegistry` é iterado pelo launcher real; tiles não filtrados por acesso/disabled ficariam expostos.

---

## 9. Matriz consolidada de operações

> Proteção: 🟢 proper · 🔶 frontend-only · 🟠 partial/web · the most severe flag is shown.

| App | Operação real | Proteção atual | Escopo atual | Backend | RLS | Log |
| --- | ------------- | -------------- | ------------ | ------- | --- | --- |
| Chamados | Abrir chamado interno | 🟠 (server público+rate-limit; frontend full) | ws | ✅ | fechado | events |
| Chamados | Abrir chamado público | 🟠 token | ws/chamado | ✅ | ✗ (API) | events |
| Chamados | Listar | 🟢 @require_auth | ws | ✅ | ✗ (API) | – |
| Chamados | Ver detalhe | 🟢 | ws | ✅ | ✗ (API) | – |
| Chamados | Editar/status/atribuir | 🟠 (frontend full; backend só auth+ws) | ws | ✅ | ✗ (API) | events |
| Chamados | Comentar/foto | 🟠 | ws | ✅ | ✗ (API) | events |
| Chamados | Excluir | 🟠 | ws | ✅ | ✗ (API) | – |
| Chamados | Feedback público | 🟢 token | chamado | ✅ | ✗ | – |
| Chamados | Gerar QR | 🟢 manageQr | ws | – | – | – |
| TV | Ver murais (kiosk) | 🟢 RLS | ws | – | ✅ | – |
| TV | CRUD conteúdo | 🔴 só RLS | ws | – | ✅ | ✗ |
| TV | Pedir música | 🟢 RLS req=uid | próprio/ws | – | ✅ | ✗ |
| TV | Aprovar/recusar música | ⚠️ UI vs RLS super-admin | ws | – | ✅ | ✗ |
| TV | Gerenciar dispositivo | 🟠 só RLS | ws | provisão | ✅ | ✗ |
| TV | Purge dados | 🟢 ws-admin | ws | ✅ | service_role | ✅ audit |
| Estoque | Ver itens | 🟢 RLS+filter | ws | – | ✅ | – |
| Estoque | Criar/editar item | 🟢 requireWrite | ws | – | ✅ | ✗ |
| Estoque | Movimentar | 🟢 requireWrite | ws | push(morto) | ✅ | ✗ |
| Estoque | Conferir kit | 🟢 requireWrite | ws | – | ✅ | ✗ |
| Estoque | Inventário ciclo/contagem | 🟢 requireWrite | ws | – | ✅ | ✗ |
| Estoque | Manutenção | 🟢 requireWrite | ws | – | ✅ | ✗ |
| Estoque | QR scan/gen | 🟢 tela full | ws | – | – | – |
| Estoque | Export | 🟢 tela full | ws | – | – | – |
| PC Care | CRUD ativo/peça/manut/template | 🟢 requireWrite | ws | – | ✅(7) | ✗ |
| PC Care | Usar/reembolsar peça | 🟢 requireWrite | ws | – | ✅ | ✗ |
| PC Care | Checklist exec | ⚠️ não persiste | ws | – | – | ✗ |
| PC Care | Reports/export | 🟢 tela full | ws | – | – | – |
| PC Care | Limpar dados | ⚠️ só local reidrata | ws | wipe | – | – |
| ReservaLab | Ver reservas lab | 🔴 público por slug | ws(slug) | ✅ | ✗ | ✗ |
| ReservaLab | Ver dashboard | 🟢 AppGuard | ws | ✅/RLS | ✅ | – |
| ReservaLab | Ver tablets | 🟢 RLS | ws | – | ✅ | – |
| ReservaLab | Criar tablet | 🔶 frontend full + RLS insert | ws | – | ✅ | ✗ |
| ReservaLab | Cancelar tablet | ⚠️ UI full vs RLS super-admin | ws | – | ✅ | ✗ |
| Admin | Listar perfis | 🟢 super admin (PII 🔶) | global | ✅ | ✅ | – |
| Admin | Aprovar usuário | 🟢 super admin | global | ✅(notify) | ✅ | ✗ |
| Admin | Recusar usuário | 🟠 (não remove auth user) | global | ✅ | ✅ | ✗ |
| Admin | Editar perfil/role/ws/overrides | 🟢 super admin | global | ✅/local | ✅ | ✗ |
| Admin | CRUD roles | 🟢 UI super admin (local) | global | ✗ | ✗ | ✗ |
| Admin | CRUD workspaces | 🟢 super admin | global | ✅ | ✅ | ✗(front) |
| Admin | Notificações Send/Rules | 🟠 (notify_settings sem coluna) | global | ✅ | ✅ | – |
| Admin | Backups/restore | 🟢 super admin | global | ✅ | service_role | ✅ |
| Admin | Wipe global | 🟢 auth+token (sem Bearer 🔶) | global | ✅ | service_role | ✗ |
| Admin | Auditoria (logs) | 🔶 local-only | disp | ✗ | ✗ | local |

---

## 10. Eventos de notificação

| App | Evento | Destinatário atual | Workspace scoped? | Canal |
| --- | ------ | ------------------ | ----------------- | ----- |
| Chamados | Novo chamado | Assinantes `module=chamados` | sim (via user) | push |
| Chamados | Mudança de status | Professor (assinatura por chamado) | sim | push |
| Chamados | Atribuição | Técnico atribuído (`user_id`) | sim | push |
| Chamados | Relatório semanal | admin (Resend) | sim | email |
| Estoque | Alerta de validade | In-app ws-scoped | sim | in-app |
| Estoque | Empréstimo/devolução (`notify-*`) | **⚠️ morto** (sem Authorization) | n/a | push(∅) |
| PC Care | Alerta de peça/manutenção | `_target_subs(module=pc-care)` **sem ws_id** | 🔴 NÃO (cross-ws) | push |
| ReservaLab | Reserva lab/tablet ≤15min | `_target_subs(module=reservalab)` | sim (tablets) | push |
| TV | Pedido/aprovação música | **NÃO EXISTE HOJE** | – | – |
| TV | Dispositivo | **NÃO EXISTE HOJE** | – | – |
| Admin | Aprovação/rejeição de usuário | `targetUserId` (stock) | sim | in-app |

Regras hardcoded: janela 15min + dedup 2h (reservalab `app.py:766,808,871`); assinaturas por chamado `push:chamado:{id}` cap 10. `notify_settings` controla muted/canal push por app, mas **a coluna não existe no SQL** → mute inoperante (PROBLEMA ATUAL).

---

## 11. Eventos de auditoria

| App | Evento | Log atual? | Dados registrados |
| --- | ------ | ---------- | ----------------- |
| Chamados | Timeline do chamado | ✅ `ticket_events` (server) | type/content/author/fotos |
| Chamados | Ação/status | 🔶 `audit_logs` **local** | created/updated/status_changed (autor 'public'/'system') |
| TV | Purge | ✅ `workspace_audit_logs` | action/ws/actor/contagens/backup_id |
| TV | Settings | ✅ `workspace_app_settings.updated_by` | quem alterou |
| TV | CRUD conteúdo | ✗ | – |
| TV | Música pedir/aprovar | ✗ (só campos row) | – |
| Estoque | Item/movimento/conferência | ✗ (`audit_logs` local-only) | – |
| PC Care | action_logs | 🔶 existe mas **ninguém escreve**; sem usuário | – |
| ReservaLab | Criar/cancelar tablet | ✗ (hard delete, sem audit) | – |
| Admin | Workspace delete/restore | ✅ `workspace_audit_logs` (server) | – |
| Admin | Aprovar/recusar usuário, wipe, role local | ✗ | – |
| Admin | Visão local | 🔶 `audit_logs` local-only | – |

**Problema transversal:** `audit_logs` é **local-only** (`sync.ts:126`) — nada de auditoria é centralizado no banco para a maioria dos apps; `workspace_audit_logs` só é gravado pelo Flask em delete/restore/purge.

---

## 12. Problemas de segurança encontrados (somente reais)

1. 🔴 **Vazamento anônimo de inventário** — `chamados-publico/*` lê `getAllUnfiltered` de stock/pcare para todos os workspaces (`RoomAssets.tsx:53`, `TicketForm.tsx:27`, `core/assets/service.ts:71,88`, `storage.ts:5-9`).
2. 🔴 **Push cross-workspace no PC Care** — `check-pcare` envia dados de todos os ws para assinantes `module=pc-care` sem ws_id (`reservalab/api/app.py:1104-1188`).
3. 🔴 **Gestão de chamados sem nível no backend** — `GET/PATCH/DELETE /api/chamados` só `@require_auth`+workspace, sem `full`/`require_module`; a autorização `full` é só frontend.
4. 🔴 **CRUD de conteúdo TV sem `requireWrite`** — só RLS (membro do ws escreve), `tv` é o único app sem guard de serviço.
5. 🔴 **`/api/reservas` público** — qualquer caller lê qualquer campus por slug (`app.py:406`).
6. ⚠️ **Legacy TV API** (`src/apps/tv/api/app.py`) — youtube fetch/search sem authz nenhuma (:62,:157).
7. ⚠️ **`notify_settings` sem coluna SQL** — mute/canal push nunca persistem (PROBLEMA ATUAL; `adminService.updateUserProfile` empurra campo inexistente).
8. ⚠️ **`rejectUser` não remove auth.users** — rejeitado pode relogar e recriar perfil `status:'active'` (`auth/service.ts:237`).
9. ⚠️ **Cancelar tablet reservalab** — UI "full" vs RLS DELETE só super admin (+ hard delete sem log).
10. ⚠️ **`profiles_select` USING(true)** — todo autenticado lê todos os perfis (PII).
11. ⚠️ **Delete workspace via PostgREST sem backup/audit** (`workspaceService.remove`, `service.ts:61`) — diverge do endpoint que gera backup.
12. ⚠️ **Upload Cloudinary unsigned com API_KEY no cliente** (PC Care `PCPhotoUpload.tsx:9-11`).
13. ⚠️ **Resíduo de sessão em kiosk/público** — `chamados-publico` expõe redige campi/chamados do cache de sessão anterior (`RoomTicketForm.tsx:103,128-133,492-504`).
14. 🔶 **`getAllUnfiltered` usado na rota pública** (item 1) e **push `notify-loan/return` morto** (sem Authorization, `movementEffects.ts:8-22`).
15. ⚠️ **`/pedir-musica` sem gate do módulo TV** — qualquer autenticado pede música (AuthGuard apenas).

---

## 13. Padrões de operações (cross-cutting)

| Padrão | Onde aparece | Permissão compartilhada hoje? |
| ------ | ------------ | ----------------------------- |
| CRUD de entidade | pc-care, stock, chamados, tv(p/RLS), admin | ✅ `requireWrite(appId)`=full em pc-care/stock/chamados; ❌ tv/admin |
| Mudar status/lifecycle | chamados, stock (ciclo/kit), pc-care (manut), tv (playlist/música) | ✅ full (exceto tv) |
| Aprovar/recusar | admin (user), tv (música) | ❌ só padrão; gates diferentes |
| Atribuir | chamados (ticket), admin (líder/role) | ❌ |
| Exportar/relatório/print | pc-care, stock, chamados | ❌ cada app tem `utils/export.ts` |
| Requisitar/solicitar (público) | chamados-publico, tv música | ❌ (intencionalmente público) |
| Escanear (QR/câmera) | stock, pc-care | ❌ implementações separadas |
| Gerar QR | stock, pc-care (redirect), chamados | **`manageQr` (única capability boolean)** |
| Gerenciar/config (workspace) | tv, generic WorkspaceAppSheet | ✅ `AppModule.configurable/clearable/settings/SettingsPanel` (genérico) |
| Comentar/anotar | chamados | ❌ |
| Auditoria/log | chamados, admin (local) | 🔶 `core/logs` compartilhado, local-only |

**Conclusão:** o único primitivo transversal de permissão é o nível `dash/read/full` (`resolveAppAccess`/`requireWrite`) + o boolean `manageQr`. **Não existe camada de capability/actions por app** — patterns finos (aprovar, atribuir, exportar, escanear, comentar) são implementados e gateados de forma independente.

---

## 14. Operações específicas de um único app

- **Chamados:** abrir chamado público por token, feedback, tracking público, geração de QR (`manageQr`), relatório/email semanal, timeline `ticket_events`.
- **TV:** pedir música, moderar música (com side-effect em queues), gerenciar dispositivos/kiosk, provisão por código de ativação, purge por app, playback/controle.
- **Estoque:** movimentação (8 tipos, `movementEffects`), conferência de kit, ciclo de inventário/contagem, alertas de validade, "ativar como PC".
- **PC Care:** checklist (não persistido), uso/reembolso de peça, consolidação de estoque, limpeza de dados reidratável.
- **ReservaLab:** reserva/cancelamento de tablet, reserva de lab (planilha read-only), push test/send, `?workspace=` slug.
- **Admin:** aprovar/recusar usuário, wipe global, restore backup, purge, auditoria, editar cargos.

---

## 15. Extensibilidade

`src/appRegistry.ts` + `src/App.tsx` + dependências.

1. **Onde registrar um novo app:** 3 pontos coordenados — (a) objeto em `appRegistry` (`appRegistry.ts:31`), (b) lazy import + `<Route>` com `AppGuard` (`App.tsx:18-24,83-134`), (c) pasta `src/apps/<id>/`. Há receita documentada em `plannedApps` (`appRegistry.ts:94-117`).
2. **Como declara appId:** campo `id` do `AppModule` (única fonte), **porém duplicado como string literal** em ~todos os lugares (permissions/types.ts DEFAULT_ROLES; workspaces/apps.ts APPS_CONFIGURABLE; requireWrite('x'); sync collections+REMOTE_DB; notification module; dashboard/commandpalette maps; backend `require_module`/`_target_subs`; RLS `disabled_apps`; kiosk `VALID_SCREEN_APPS`). `pc-care`/`pcare` e `admin`/`role='admin'` são mapeamentos não-trivais.
3. **Como recebe App Access hoje:** `role.appAccess` + override `user.app_access` via `resolveAppAccess`; `AppGuard` checa `canAccessApp` + `isAppDisabled`. `requireWrite`=full.
4. **Como define permissões hoje:** **nenhuma declaração per-app existe.** Só `appAccess` (nível) + `manageQr`. Há placeholder no `RolesPage.tsx:378` "Futuro: Ações permitidas (ausente até existirem dados reais)".
5. **Mecanismo existente extensível p/ actions:** o contrato `AppModule.settings/SettingsPanel/configurable/clearable` (consumido genericamente por `WorkspaceAppSheet` + `appSettingsService`) é o **único ponto de extensão automático**. Um campo `capabilities/actions` em `AppModule`, keyed por appId em role (como `appAccess` hoje), espelharia esse padrão. `AppAccessLevel`/`manageQr` são os proxies atuais.
6. **Código hardcoded assumindo lista fixa:** `ModuleStats`/`CommandPalette`/`QuickActions` (mapas módulo→appId fechados); kiosk `VALID_SCREEN_APPS` (`tv-desktop/config.ts:12`); union `AssetSource='pcare'|'stock'` (`core/assets/types.ts:1`); backend `require_module`/`_target_subs(module=…)`; `LOCAL_ONLY_COLLECTIONS`/`REMOTE_DB` (`sync.ts:120-153`); `APPS_CONFIGURABLE` exclui admin/dashboard. Um novo appId quebraria/skippiaria: mapas do dashboard, VALID_SCREEN_APPS (se display), union de assets (se reusar), e sincronização remota (se tiver tabela).
7. **Onde quebraria RBAC 2.0:** `AppGuard` (acesso binário por app, sem granularidade interna); `adminService.ROLE_ID_TO_DB` e `permissions.migrate()` (modelo role-global legado; migração remove `admin` e hardcoda `chamados:'full'` p/ QR); `DEFAULT_ROLES` (fixa technician/viewer); **RLS não modela app_access/capability** — só workspace + `is_super_admin` (+ legacy `role='admin'` em `031:48`); `createSyncService('roles')` local-only (cargos não chegam ao banco); `disabled_apps` (string extra, ok mas `APPS_CONFIGURABLE` limita).

**Conclusão:** adicionar app é mecanicamente fácil, mas cada app só recebe o mesmo `dash/read/full` grosseiro; **não há como declarar as actions que o app executa**.

---

## 16. Perguntas que ainda precisamos decidir (NÃO respondidas aqui)

1. **Chamados:** quais ações realmente queremos? (criar, ver, atribuir, comentar, status, fechar/reabrir, excluir, feedback, QR, relatório, email semanal)
2. **TV:** pedir música é uma Action independente do acesso ao app? (o design já prevê que sim — mas qual hierarquia?)
3. **TV:** aprovar música → precisa de Action própria + direito de editar queue/tracks?
4. **Estoque:** criar movimentação e editar estoque devem ser Actions diferentes? E conferir kit, ciclo de inventário, ajuste de validade?
5. **PC Care:** quais operações precisam de autorização específica (usar peça, manter, checklist que não persiste hoje, export)?
6. **ReservaLab:** reservar/cancelar tablet como Actions; "ver reservas de lab" é leitura pública ou protegida?
7. **Admin:** aprovar usuário, editar cargo, wipe, manage — Actions ou sub-roles?
8. **Hierarquia:** Actions devem ter hierarquia (ex.: `*.create`, `*.edit`)? Deve haver pacotes/"agrupamentos" por app?
9. **App Access × Action:** algumas Actions devem exigir App Access (`none` + `ticket.create`) e outras exigem nível mínimo (`read`)? Como o sistema valida essa combinação?
10. **Quick Actions:** quais Actions podem funcionar sem App Access (ex.: abrir chamado a partir do dashboard/launcher)?
11. **Escopo por Action:** qual escopo cada Action terá — `own` / `assigned` / `department` / `workspace` / `all`? Isso é uma propriedade da Action ou da Membership?
12. **Delegação:** quais Actions podem ser delegadas por um líder? (o design define "líder não pode conceder o que não possui" — mas a delegação é por Action?)
13. **Exclusivas de Admin:** quais Actions são exclusivas de Admin absoluto / Admin de workspace / Líder?
14. **Derivadas de comportamento:** "Solicitante" = comportamento derivado de `ticket.create` — quais outros comportamentos derivados existem?
15. **Notificações/QR:** notificação e QR são Actions ou efeitos colaterais de Actions existentes?
16. **Auditoria:** qual a trilha mínima obrigatória por Action (who/whom/ws/entity/action/timestamp/before-after) e onde centralizar (substituir o `audit_logs` local-only)?
17. **Extensibilidade:** o campo de capabilities/actions deve viver em `AppModule` (tipo) + tabela SQL de Actions + matriz por Membership? Qual o formato de declaração?

---

## Resultado esperado (mapa factual)

```
LABHUB (7 apps + chamados-publico)
│
├── Chamados        → operações (criar público/interno, listar, ver, editar/status/atribuir, comentar, excluir, feedback, QR, relatório)
│                    escopo: workspace (+token p/ público); sem "meus chamados" formal
│                    notificações: push novo/status/atribuição + email semanal
│                    logs: ticket_events (server) + audit_logs (local)
│
├── TV              → operações (ver murais, CRUD conteúdo, pedir/aprovar música, gerenciar dispositivo, playback, purge)
│                    escopo: workspace; tudo sem guard de serviço (só RLS)
│                    notificações: NÃO EXISTE
│                    logs: purge/settings só; resto sem log
│
├── Estoque         → operações (ver, CRUD item, movimentar(8), conferir kit, inventário, manutenção, QR, export)
│                    escopo: workspace; sem identidade de usuário nos objetos
│                    notificações: validade in-app; push empréstimo MORT0
│                    logs: sem log persistido (audit_logs local)
│
├── PC Care         → operações (CRUD ativo/peça/manut/template, usar peça, checklist, QR, report, wipe)
│                    escopo: workspace; sem created_by
│                    notificações: in-app NÃO EXISTE; push CROSS-WS 🔴
│                    logs: action_logs morto
│
├── ReservaLab      → operações (ver lab(planilha), ver dashboard, ver/criar/cancelar tablet, inventário→stock, config planilha)
│                    escopo: lab=slug público; tablet=workspace
│                    notificações: push 15min reservas (broadcast feed)
│                    logs: sem log de tablet; push no backend
│
├── Admin           → operações (listar, aprovar/recusar user, editar perfil/role/ws/overrides, CRUD roles, CRUD ws, notif, backups, wipe, auditoria)
│                    escopo: GLOBAL (só is_super_admin); sem admin por ws
│                    notificações: aprovação (stock in-app); notify_settings inoperante
│                    logs: workspace_audit_logs (delete/restore) + audit_logs local
│
└── chamados-publico→ operações (ver sala, abri chamado público, track, feedback)
                     escopo: token/chamado; 🔴 lê inventário unfiltered; ⚠️ resíduo de sessão
                     notificações: push status por assinatura
                     logs: ticket_events (server)
```

**Nenhum código foi alterado. Próximo passo:** decidir as perguntas da §16 e, em conjunto, desenhar o catálogo definitivo de Actions + hierarquias antes da migration.
