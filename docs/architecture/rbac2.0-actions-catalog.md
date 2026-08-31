# LabHub — Catálogo de Actions / Capabilities RBAC 2.0

> Documento produzido por **auditoria read-only** do código real do repositório (2026-08-30).
> Objetivo: responder "o que cada sub-app realmente permite fazer hoje?" e transformar isso
> em uma **proposta de Actions** para o futuro RBAC 2.0, **sem alterar absolutamente nada**.

## 1. Objetivo

Este documento é a **fonte de decisão inicial do catálogo de capabilities/actions** do RBAC 2.0.
Ele foi construído exclusivamente a partir de evidência no código atual de **LabHub**, mapeando
cada operação real encontrada (rotas, páginas, services, hooks, endpoints Flask, chamadas Supabase,
mutações, guards, permissões existentes) para uma candidata a Action.

> **Nenhum código, banco, migration ou autorização existente foi alterado durante esta auditoria.**

O presente arquivo (`docs/architecture/rbac2.0-actions-catalog.md`) é o **único artefato** criado.

---

## 2. Método de auditoria

Áreas verificadas **efetivamente** no repositório (`git` tree atual). Nenhum arquivo foi inventado.

### Chamados (`src/apps/chamados/**` + `src/apps/chamados-publico/**` + `api/app.py`)
- services: `ticketService.ts`, `publicTicketService.ts`, `roomService.ts`, `problemTemplateService.ts`, `slaConfigService.ts`, `ticketAlerts.ts`, `sla.ts`
- hooks: `useTickets.ts`, `useRooms.ts`, `useRoomAssets.ts`, `useProblemTemplates.ts`
- pages: `TicketList`, `TicketDetail`, `Dashboard`, `UnitQR`, `Reports`, `Settings`, `SlaDashboard`, `Ranking`
- público: `TicketForm.tsx`, `RoomTicketForm.tsx`, `TrackPage.tsx`, `FeedbackPage.tsx`, `TicketSuccess.tsx`
- API Flask: `api/app.py` (POST/GET/PATCH/DELETE `/api/chamados`, `/events`, `/reports`, `/weekly-email`, endpoints públicos por token)

### TV (`src/apps/tv/**` + `src/pages/MusicRequest.tsx` + `api/app.py`)
- services: `supabase.ts`, `calendarService.ts`
- hooks: `useMusicRequests.ts`, `useDevices.ts`, `usePlaylists.ts`, `useEvents.ts`, `useGallery.ts`, `useAnnouncements.ts`, `useUrgentAnnouncements.ts`, `useMusicQueues.ts`, `useAllMusicTracks.ts`, `useNowPlaying.ts`
- pages/components: `Admin.tsx`, `TvDisplay.tsx`, `MusicRequestManager.tsx`, `MusicQueuePlayer.tsx`, `DeviceManager.tsx`, `EventManager.tsx`, `PlaylistManager.tsx`, `QueueManager.tsx`, `GalleryManager.tsx`, `AnnouncementManager.tsx`
- API Flask: `api/app.py` (`/api/tv/activation/*`, `/api/tv/devices/*`, `/api/tv/cloudinary/delete`, `/api/tv/source/fetch`, `/api/admin/app-data/purge`)
- RLS: `supabase/migrations/019_tv_music_requests.sql`, `030_tv_device_identity.sql`, `032_tv_app_data_purge.sql`, `033_workspace_isolation_hardening.sql`, `028_authorization_consolidation.sql`

### Estoque (`src/apps/stock/**` + `src/apps/reservalab/api/app.py` para push)
- services: `stockService.ts`, `movementService.ts`, `kitService.ts`, `inventoryService.ts`, `stockMaintenanceService.ts`, `stockPhotoService.ts`, `expiryAlerts.ts`
- utils: `movementEffects.ts`, `export.ts`, `qrScanner.ts`, `activateAsPC.ts`
- pages/hooks: `StockDetail`, `StockSection`, `StockEntryExit`, `KitDetail`, `InventoryList`, `InventoryDetail`, `MovementsPage`, `StockMaintenance`, `useInventory`, `useKits`, `useMovements`, `useStock`, `useStockMaintenance`
- API Flask (cron/push): `src/apps/reservalab/api/app.py` (`/api/push/notify-loan`, `/notify-return`, `/check-overdue`)
- RLS: `supabase/migrations/027_rls_workspace_isolation.sql`, `033_workspace_isolation_hardening.sql`, `000_bootstrap_baseline.sql`

### PC Care (`src/apps/pcare/**` + `src/apps/reservalab/api/app.py` p/ `check-pcare`)
- services: `assetService.ts`, `pcService.ts`, `partService.ts`, `partUsageService.ts`, `maintenanceService.ts`, `checklistService.ts`, `actionLogService.ts`
- pages/hooks: `PCForm`, `PCList`, `PCDetail`, `PartsList`, `Maintenance`, `ChecklistTemplates`, `ChecklistExecute`, `Reports`, `Settings`, `QRGenerator`, `QRScanner`, `StockConsolidado`, `useParts`, `usePCs`, `useAssets`, `useMaintenance`, `useChecklists`
- RLS: `supabase/migrations/027_rls_workspace_isolation.sql`, `029_reconcile_legacy_policies.sql`, `000_bootstrap_baseline.sql`, `supabase/archive/manual-sql/supa.sql`

### ReservaLab (`src/apps/reservalab/**` + `src/apps/reservalab/api/app.py`)
- pages/services: `Tablets.tsx`, `Reservas.tsx`, `Dashboard.tsx`, `services/api.ts`, `services/supabase.ts`, `layouts/ReservaLabLayout.tsx`, `components/Navbar.tsx`, `components/PushNotificationButton.tsx`
- API Flask: `src/apps/reservalab/api/app.py` (`/api/reservas`, `/api/push/subscribe`, `/send`, `/test`, `/action`, `/check`, `/check-overdue`, `/check-pcare`, `/check-all`)
- RLS: `supabase/migrations/028_authorization_consolidation.sql`, `034_drop_legacy_rls_policies.sql`, `033_workspace_isolation_hardening.sql`, `011_add_workspace_id_tablet_reservations.sql`

### Admin (`src/apps/admin/**` + `src/core/**` + `api/app.py`)
- auth/permissions: `adminService.ts`, `permissions/service.ts`, `permissions/types.ts`, `usePermissions.ts`, `auth/AdminGuard.tsx`, `auth/AppGuard.tsx`
- pages: `UsersPage`, `UserDetailPage`, `RequestsPage`, `RolesPage`, `WorkspacesPage`, `NotificationsPage`, `SettingsPage`, `BackupsPage`, `LogsPage`, `ProfilePage`
- workspaces: `workspaces/service.ts`, `workspaces/backupService.ts`, `workspaces/duplicateStructure.ts`, `workspaces/store.ts`
- API Flask (admin): `api/app.py` (`/api/admin/backups/*`, `/api/admin/workspaces/<id>/delete`, `/api/admin/audit-logs`, `/api/admin/wipe`, `/api/admin/app-data/purge`)
- RLS: `supabase/migrations/007_admin_manage_profiles.sql`, `006_fix_rls_policies.sql`, `009_workspace_isolation.sql`

### Transversal
- `src/core/permissions/{types,service,usePermissions}.ts` — modelo de acesso (`dash/read/full` + `manageQr` + overrides)
- `src/core/auth/{AppGuard,AdminGuard,AuthGuard}.tsx` — guardas de rota
- `src/core/workspaces/{apps,WorkspaceContext,store,service}.ts` — `disabled_apps`, `APPS_CONFIGURABLE`, `isModuleAvailable`
- `src/platform/Dashboard/QuickActions.tsx` — derivação atual de Quick Actions
- `src/lib/sync.ts` — coleções `LOCAL_ONLY` (roles, user_profiles, audit_logs…)
- `src/appRegistry.ts` — registro de apps e flags `configurable/clearable/settings`

---

## 3. Modelo de autorização existente (contexto obrigatório)

Antes do catálogo, o baseline factual de quem pode fazer o quê hoje:

- **Cargo global único** por usuário (`profiles.role` → `roleId`), vivido em `roles` **local-only**
  (`createSyncService<Role>('roles')`, `permissions/service.ts:6`; `LOCAL_ONLY_COLLECTIONS` em `lib/sync.ts:120-129`).
- **Nível por app** `dash | read | full` (`permissions/types.ts:1`), resolvido por
  `resolveAppAccess` (`service.ts:82-93`): super admin → `full`; override individual vence cargo;
  `none` nega. Escrita = nível `full` (`canWriteApp` `service.ts:106-112`; `requireWrite` `service.ts:125-129`).
- **`manageQr`** = capability booleana independente do nível (`canManageQr`, `service.ts:115-122`).
- **`is_super_admin`** = bypass global de plataforma (`usePermissions.ts:62-66`); único gate do Admin.
- **Guarda de rota** `AppGuard` (`AppGuard.tsx`): `!canAccessApp` → bloqueia (`:30`); `isAppDisabled` (workspace `disabled_apps`) → bloqueia (`:57`). `AdminGuard` (`:19`): só `is_super_admin`.
- **Backend** `require_module` (`api/app.py:1087-1104`): verifica `disabled_apps` do workspace (fail-open se sem workspace).
- **Sem camada de Actions hoje**: além de `dash/read/full` + `manageQr`, **não existe capability granular por app**.
  Placeholder explícito no UI: `RolesPage.tsx:378` `{/* Futuro: Ações permitidas (ausente até existirem dados reais) */}`.

---

## 4. Catálogo por aplicativo

Classificação: `ACTION` (capacidade controlável) · `RULE` (regra de negócio) · `INTERNAL` (não expor) ·
`ADMIN` (administrativa) · `PUBLIC` (funciona publicamente, fora do RBAC) · `DEPRECATED` (planejada para remoção).

### 4.1 Chamados

#### Capability / Action

| Action | Descrição | Evidência | Entidade | Scope | Side Effect | Classificação |
|---|---|---|---|---|---|---|
| `ticket.create` (interno) | Abrir chamado por usuário autenticado | `ticketService.create` `services/ticketService.ts:96-112` → `POST /api/chamados`; `useTickets.create` `hooks/useTickets.ts:121-126` | ticket | workspace | cria chamado no servidor + cache local; log `created` | `ACTION` |
| `ticket.createPublic` | Abrir chamado pelo formulário público (token) | `ticketService.createWithToken` `services/ticketService.ts:118-128`; `TicketForm.tsx:27`; `RoomTicketForm.tsx:6` | ticket | público | cria chamado + devolve `tracking_token` | `PUBLIC` |
| `ticket.view` / `ticket.list` | Listar e ver chamados | `ticketService.getAll/pullRemote/getByIdRemote` `services/ticketService.ts:81,216,165`; `GET /api/chamados` | ticket | workspace (leitura implícita pelo App Access) | nenhum | `ACTION` (leitura) |
| `ticket.edit` | Editar campos do chamado | `ticketService.update` `services/ticketService.ts:130-153` (`requireWrite('chamados')` `:131` → `PATCH /api/chamados/<id>`) | ticket | workspace | alteração + log `updated` | `ACTION` |
| `ticket.status` | Mudar status (aberto→a_caminho→em_atendimento→resolvido→fechado) | `useTickets.updateStatus` `hooks/useTickets.ts:136-148` → `ticketService.update`; `TicketDetail.handleAdvanceStatus` `pages/TicketDetail.tsx:145-160` | ticket | workspace | mudança de status + push professor | `ACTION` |
| `ticket.assign` | Atribuir chamado a técnico | `TicketDetail.tsx:116` (`handleAssign(user.id,…)`) → `ticketService.update` | ticket | workspace | atribuição + push direto ao técnico | `ACTION` |
| `ticket.close` / `ticket.reopen` | Encerrar / reabrir | `TicketDetail.handleAdvanceStatus` `:150-156`; `handleReopen` `:162-170`; `handleReopenNew` `:174-197` | ticket | workspace | fecha (archived/closedAt) ou reabre/cria novo | `ACTION` |
| `ticket.comment` | Comentar / anexar fotos no chamado | `ticketService.addEvent` `services/ticketService.ts:187-193` → `POST /api/chamados/<id>/events`; `TicketDetail.handleAddComment` `:220-238` | ticket_event | workspace | cria evento na timeline (timeline auditable) | `ACTION` |
| `ticket.delete` | Excluir chamado | `ticketService.remove` `services/ticketService.ts:155-162` (`requireWrite` `:156` → `DELETE /api/chamados/<id>`) | ticket | workspace | exclusão (também cache local) | `ACTION` |
| `ticket.feedback` | Avaliar (1-5) chamado resolvido/fechado | `publicTicketService.submitFeedback` `services/publicTicketService.ts:76-88`; `TicketSuccess.tsx:209-227` | ticket | token (próprio chamado) | grava feedback | `ACTION` (identidade token) |
| `ticket.track` | Acompanhar status pelo token | `TrackPage.tsx`; `publicTicketService` (lê via token) | ticket | token (próprio chamado) | leitura | `PUBLIC` |
| `ticket.qr` | Gerar QR da unidade | `UnitQR.tsx`; `canManageQr()` (`permissions/usePermissions.ts:76-78`) | unit_qr | workspace | gera poster/link | `ACTION` (proxy atual `manageQr`) |
| `ticket.report` | Relatório agregado | `ticketService.getReports` `services/ticketService.ts:222-230`; `GET /api/chamados/reports` | unidade/dashboard | workspace | leitura | `ACTION` (leitura/reporting) |
| `ticket.weeklyEmail` | Relatório semanal por e-mail | `Reports.tsx:225` (emailTo) → `POST /api/chamados/reports/weekly-email` | e-mail | workspace | envia Resend | `ADMIN` |

**Notas Chamados**
- **Regra pública garantida**: o formulário público **sempre** pode criar chamado (`TicketForm.tsx`/`RoomTicketForm.tsx` em rota sem AppGuard — `src/App.tsx:125`). **Não colocar `ticket.create` atrás de App Access de modo a quebrar o formulário público.** (Decisão já tomada.)
- **Usuário logado identificado**: `RoomTicketForm.tsx:94-97` pré-preenche `reportedBy` com `user.name`; formulário público coleta `reportedByEmail` (`TicketForm.tsx:66`). Isso suporta a regra "usuário logado pode abrir chamado identificado por usuário/e-mail sem acesso ao app completo".
- **Backend** cria chamado com rate-limit + `require_module('chamados')`; gestão (PATCH/DELETE/events) usa `@require_auth` + escopo workspace, **mas não valida nível `full` no servidor** (autorização app-level é frontend) — ver §13.

### 4.2 TV

#### Capability / Action

| Action | Descrição | Evidência | Entidade | Scope | Side Effect | Classificação |
|---|---|---|---|---|---|---|
| `music.request` | Pedir música (rota `/pedir-musica`, só AuthGuard) | `useMusicRequests.request` `hooks/useMusicRequests.ts:50-77` → `createMusicRequest` `services/supabase.ts:443-459`; rota `src/App.tsx:78-82` (sem AppGuard) | tv_music_requests | próprio / ws (insert RLS `auth.uid()=requested_by`, `019:34-38`) | cria pedido status `pending`; sem notificação | `ACTION` (independente do app) |
| `music.moderate` (aprove/reject) | Aprovar / recusar música | `useMusicRequests.approve/reject` `hooks/useMusicRequests.ts:80-127`; RLS update **is_super_admin only** `019:41-50` | tv_music_requests, tv_music_queues, tv_music_tracks | workspace | aprovação cria fila/track; rejeição só status | `ACTION` (**restrita**) |
| `tv.content.manage` | CRUD de conteúdo (eventos, playlists, anúncios, galerias, filas) | managers → `services/supabase.ts` (ex.: `:37-43` events, `:90-96` playlists, `:198-204` announcements, `:251-257` galleries, queues); RLS `tv_can_manage_workspace` `030:64-69` | tv_events, tv_playlists, tv_announcements, tv_galleries, tv_gallery_photos, tv_music_queues | workspace | inserções/atualizações/exclusões; foto exclui via Cloudinary (`:342-367`) | `ACTION` |
| `tv.urgentAnnouncement` | Criar / dispensar anúncio urgente | `useUrgentAnnouncements.ts:75-122`; RLS `030:207-215` | tv_urgent_announcements | workspace | insert / `is_active=false` | `ACTION` (alto impacto) |
| `tv.device.manage` | Gerir dispositivos kiosk (rename/move/remove/provision) | `useDevices.ts:25-53`; `services/supabase.ts:416-430`; provisão `api/app.py:1107-1204,1207-1296,1299-1373` | tv_devices, tv_activation_codes | workspace | provisão cria kiosk GoTrue; RLS `tv_can_manage_workspace`/`tv_device_owned` `030:220-228` | `ADMIN`/`ACTION` (provisão) |
| `tv.playback.control` | Controle de playback (broadcast Realtime) | `MusicPlayerContext.tsx:98-107`; `MusicRequestManager.handlePlayNext` `:39-51`; `MusicQueuePlayer.tsx:92-96` | (sem rows) | dispositivo | muda estado do player + broadcast | `RULE`/`ACTION` (sem DB; canal autenticado) |
| `tv.purge` | Apagar dados de conteúdo do app | `api/app.py:2780-2856` (`POST /api/admin/app-data/purge`); RPC service_role `032` | tv_* | workspace | backup+delete+audit transacional (`032:152` advisory lock) | `ADMIN` |
| `tv.settings.manage` | Configurar TV por workspace | `appRegistry` `configurable:true/clearable:true` (`appRegistry.ts:71-74`); `TvSettingsPanel` | workspace_app_settings | workspace | grava settings (`updated_by`) | `ADMIN` |

**Notas TV**
- **`music.request` pode ser concedido sem liberar o app TV inteiro** (rota `/pedir-musica` é só AuthGuard — qualquer autenticado pode pedir música hoje, `src/App.tsx:78-82`).
- **`music.moderate` será extremamente restrito.** A moderação futura terá **proteção de concorrência** (duas pessoas não moderam a mesma música; sem aprovação+recusa concorrentes) — isso é **regra de domínio/concurrency, NÃO Action**. Hoje **não existe** lock (o único advisory lock do domínio TV é no purge, `032:152`); aprovação é sequência não-atômica cliente (fetch→createQueue→createTracks→update) e pode gerar **efeito parcial** quando o usuário é membro do ws mas não super admin (track inserida, request segue pending — `useMusicRequests.approve` `:80-117`).
- **TV é o único app sem `requireWrite('tv')`** (0 ocorrências em `src/apps/tv`). Todo write depende de RLS.
- `tv.playback.control` não grava no banco — é **RULE/INTERNAL** (não vira permission).

### 4.3 Estoque

#### Capability / Action

| Action | Descrição | Evidência | Entidade | Scope | Side Effect | Classificação |
|---|---|---|---|---|---|---|
| `stock.item.create` | Criar item | `stockService.create` `services/stockService.ts:21-24` (`requireWrite('stock')` `:22`) | stock_item | workspace | cria item | `ACTION` |
| `stock.item.edit` | Editar item | `stockService.update` `:26-29` (`requireWrite` `:27`) | stock_item | workspace | alteração | `ACTION` |
| `stock.item.delete` | Excluir item | `stockService.remove` `:31-34` (`requireWrite` `:32`) | stock_item | workspace | hard delete | `ACTION` |
| `stock.movement.create` | Registrar movimentação (8 tipos) | `movementService.create` `services/movementService.ts:23-26` (`requireWrite` `:24`); tipos em `types/movement.ts:1`; efeitos `utils/movementEffects.ts:28-61` | stock_movement / stock_item | workspace | altera quantidade/status/sala; empréstimo/devolução tenta push (`movementEffects.ts:42-46,50`) | `ACTION` |
| `stock.movement.manage` | Editar/excluir movimentação | `movementService.update/remove` `:28-34/:36-42` | stock_movement | workspace | alteração / soft-delete (`deletedAt`) | `ACTION` |
| `stock.kit.audit` | Conferir kit (checklist de conferência) | `kitService` `services/kitService.ts:17-30`; `KitDetail.handleSaveChecklist` `pages/KitDetail.tsx:48` | stock_kit / stock_kit_items | workspace | atualiza conferência/estado do kit | `ACTION` |
| `stock.inventory.run` | Ciclo de inventário / contagem | `inventoryService.createCycle/saveCount/completeCycle` `services/inventoryService.ts:29-60` (`requireWrite` `:30,35,53`) | stock_inventory | workspace | cria/atualiza contagem e conclui ciclo | `ACTION` |
| `stock.maintenance.manage` | Agendar/completar/excluir manutenção | `stockMaintenanceService` `services/stockMaintenanceService.ts:35-48` | stock_maintenance | workspace | cria/atualiza manutenção | `ACTION` |
| `stock.qr.scanGen` | Escanear / gerar QR | `QRScanner.tsx`, `QRGenerator.tsx`; tela `isFullAccess('stock')` | stock_item | workspace | leitura/navegação | `RULE` (proxy `full`/`manageQr`) |
| `stock.export` | Exportar CSV | `MovementsPage.tsx:64`; `utils/export.ts` | relatório | workspace | download | `ACTION` (leitura/reporting) |
| `stock.qr.activateAsPC` | Ativar item como PC | `StockDetail.tsx:55`; `utils/activateAsPC.ts` | stock_item | workspace | cria vínculo a PC | `ACTION` (cross PC Care) |

**Notas Estoque**
- **Leitura** (`getAll`, `services/stockService.ts:13`) é implícita ao App Access — **não** propõe `stock.view` granular exceto quando há escopo por usuário (que hoje **não existe**). Ver §6.
- **Push de empréstimo/devolução (`notify-loan`/`notify-return`) está quebrado**: `movementEffects.ts:8-22` envia `POST` **sem header `Authorization`** (e sem `workspace_id`/`module`) para endpoints que exigem `@require_auth`+`@require_module_auth('stock')` (`src/apps/reservalab/api/app.py:903-905,938-940`). Resultado: 401 engolido por `.catch` — **vivo no código, morto em produção.** Notificar não é Action; é side-effect (§14).

### 4.4 PC Care

#### Capability / Action

| Action | Descrição | Evidência | Entidade | Scope | Side Effect | Classificação |
|---|---|---|---|---|---|---|
| `pcare.asset.create` | Criar ativo/PC | `assetService.create` `services/assetService.ts:41-44` (`requireWrite('pc-care')` `:42`) | pcare_assets | workspace | cria ativo | `ACTION` |
| `pcare.asset.edit` | Editar ativo/PC | `assetService.update` `:46-47` (`requireWrite` `:46`); `PCForm.tsx:23` | pcare_assets | workspace | alteração | `ACTION` |
| `pcare.asset.manage` | Gerenciar ciclo de vida do PC (mover estoque, status) | `pcService` `:7-27`; `activateAsPC`; `RedirectToStock.tsx` | pcare_pcs / pcare_assets | workspace | update | `ACTION` |
| `pcare.part.create` | Criar peça | `partService.create` `services/partService.ts:21-25` (`requireWrite` `:22`) | pcare_parts | workspace | cria peça | `ACTION` |
| `pcare.part.edit` | Editar peça / ajustar estoque stepper | `partService.update` `:27-34` (`requireWrite` `:28`); `PartsList.tsx:68-73` | pcare_parts | workspace | altera quantidade | `ACTION` |
| `pcare.part.delete` | Excluir peça | `partService.remove` `:36-39` (`requireWrite` `:37`) | pcare_parts | workspace | remove | `ACTION` |
| `pcare.part.usage` | Usar / reembolsar peça | `partUsageService.log` `services/partUsageService.ts:16-25` (`requireWrite` `:17`); `remove` `:27-30` | pcare_part_usage | workspace | **morto hoje** (nenhum UI chama `log`) | `ACTION` (futuro; hoje `DEPRECATED`/morto) |
| `pcare.maintenance.manage` | Agendar/editar/completar/excluir manutenção | `maintenanceService` `services/maintenanceService.ts:30-47` | pcare_maintenance | workspace | cria/atualiza; alimenta push `check-pcare` | `ACTION` |
| `pcare.checklist.*` | Template / execução de checklist | `checklistService` `services/checklistService.ts:16-53`; `ChecklistExecute.tsx:195-206` (**não persiste**) | pcare_checklist_templates / pcare_pc_checklists | workspace | templates CRUD; execução em memória | `DEPRECATED` (Checklist será removido) |
| `pcare.export` | Exportar relatórios (CSV/XLSX/PDF/JSON) | `Reports.tsx:91-107`; `utils/export.ts` | relatório | workspace | download | `ACTION` (leitura) |
| `pcare.qr.gen` | Gerar QR do PC | `QRGenerator.tsx:14` → `navigate('/stock/qr')` | pcare_pcs | workspace | redireciona p/ Estoque | `RULE` (proxy `manageQr`) |
| `pcare.data.clear` | Limpar dados locais | `Settings.tsx:301-307` (`handleClearAll`), gated `isFullAccess` `:190-191,411` | localStorage local | dispositivo | apaga chaves `labhub_*` (não toca remoto) | `INTERNAL`/destrutivo |
| `pcare.import` | Importar PCs/peças em lote | `Settings.tsx:224-288`; `Reports.tsx:123-160` → `pcService.create`/`partService.create` | pcare_pcs/pcare_parts | workspace | criação em massa | `ACTION` |

**Notas PC Care**
- **Não existe operação de delete de PC/ativo** no PC Care (`assetService` e `pcService` não expõem `remove`). Exclusão de ativo é conceitualmente do Estoque (`RedirectToStock.tsx`). Portanto **não propor `pcare.asset.delete`.**
- **Checklist será removido** (decisão já tomada). Não propor `pcare.checklist.*` como capabilities desejadas; registrado apenas como fato atual e marcado `DEPRECATED`.
- `partUsageService.log` e `actionLogService.log` estão **mortos** (só testes os chamam; `AddPartToPcModal`/`useActionLog` não são importados em produção). `actionLogService.log` **não tem `requireWrite`** (`actionLogService.ts:12-19`) — de qualquer forma sem chamador real.
- `pcare.assets` é gap RLS: a migração 027 **não cria policy** para `pcare.assets`; sobrevive a policy legada `assets_all` (`USING true`, `supabase/archive/manual-sql/supa.sql:228`), documentada em `029_reconcile_legacy_policies.sql`. (Achado de segurança, ver §13.)

### 4.5 ReservaLab

#### Capability / Action

| Action | Descrição | Evidência | Entidade | Scope | Side Effect | Classificação |
|---|---|---|---|---|---|---|
| `reservelab.lab.view` | Ver reservas de laboratório (planilha) | `Reservas.tsx:239-261`; `services/api.ts:12-15`; `GET /api/reservas` (`src/apps/reservalab/api/app.py:406-458`, **sem auth decorator**) | workspaces.spreadsheet_url | público (slug) | lê planilha externa | `PUBLIC` (leitura pública por design) |
| `reservelab.tablet.view` | Ver reservas de tablets | `services/supabase.ts:16-38`; RLS `028:214-221` | tablet_reservations | workspace | leitura | leitura (implícita pelo App Access) |
| `reservelab.tablet.reserve` | Reservar tablet | `Tablets.tsx:126-135`; `services/supabase.ts:40-45`; UI gate `getLevel==='full'` `Tablets.tsx:51`; RLS insert membro `028:223-230` | tablet_reservations | workspace | cria reserva | `ACTION` |
| `reservelab.tablet.cancel` | Cancelar reserva de tablet | `Tablets.tsx:150-157`; `services/supabase.ts:52-55` (hard delete); RLS delete **super admin only** `028:245-251` | tablet_reservations | workspace | hard delete (sem soft) | `ACTION` |
| `reservelab.push.manage` | Enviar push broadcast / subscribe | `NotificationSendTab.tsx:97-112` → `POST /api/push/send` (`app.py:616-647`); subscribe `app.py:498-567` (público) | push subs (Redis) | workspace/global | envia web push | `ADMIN` (send); `INTERNAL` (subscribe) |
| `reservelab.dashboard.view` | Ver dashboard | `Dashboard.tsx:30-53`; `AppGuard 'reservalab'` `src/App.tsx:104-110`; `'dash'` → só dashboard (`ReservaLabLayout.tsx:17-23`) | dashboard | workspace | leitura | leitura (constraint de nível `dash`) |

**Notas ReservaLab**
- **Deve continuar protegido por Membership/App Access** (decisão já tomada) — AppGuard `reservalab`, níveis `dash/read/full`. A leitura de **lab (planilha) é pública por design** (`/api/reservas` sem auth, por slug); **não** vira Action privada. Os tablets (escrita) são o alvo das capabilities.
- `reservelab.tablet.cancel` hoje tem **inconsistência**: UI mostra "Cancelar" para qualquer nível `full` (`Tablets.tsx:51`), mas RLS `delete` só super admin — usuário `full` não-super-admin falha no banco (`028:245-251`). Isso será resolvido quando `reservelab.tablet.cancel` virar Action controlável.
- ReservaLab não é `configurable` no registry (não tem `settings`/`clearable`), mas **está** em `APPS_CONFIGURABLE` (`apps.ts:6-8`, exclui só `admin`/`dashboard`) → pode ser ativado/desativado por workspace.

### 4.6 Admin

#### Capability / Action (mapeadas separadamente — ver §10)

| Action | Descrição | Evidência | Entidade | Scope | Side Effect | Classificação |
|---|---|---|---|---|---|---|
| `admin.user.approve` | Aprovar usuário | `adminService.approveUser` `adminService.ts:76-97`; `UsersPage.tsx:124`, `UserDetailPage.tsx:87` | profiles + stock.notifications | global | ativa perfil + notifica | `ADMIN` |
| `admin.user.reject` | Recusar usuário | `adminService.rejectUser` `adminService.ts:99-118` (deleta só a linha do perfil; **não remove** `auth.users`) | profiles + notifications | global | apaga linha; auth user permanece | `ADMIN` |
| `admin.user.edit` | Editar perfil/cargo/workspaces/overrides (incl. `is_super_admin`) | `adminService.updateUserProfile` `adminService.ts:153-168`; `updateUserRole` `:136-151` | profiles | global | atualiza perfil; pode conceder super admin | `ADMIN` |
| `admin.role.create` | Criar cargo | `permissionService.create` `permissions/service.ts:30-32`; `RolesPage.tsx:133-149` | roles (local-only) | global/device | cria cargo local | `ADMIN` (local-only) |
| `admin.role.edit` | Editar cargo (appAccess, `manageQr`, `leaderId`) | `permissionService.update` `service.ts:34`; `RolesPage.tsx:106-131` | roles (local) | global/device | atualiza cargo local | `ADMIN` (local-only) |
| `admin.role.delete` | Excluir cargo | `permissionService.remove` `service.ts:36`; `RolesPage.tsx:151-165` | roles (local) | global/device | remove cargo local | `ADMIN` (local-only) |
| `admin.workspace.create` | Criar workspace | `workspaces/service.ts:77-82`; `WorkspacesPage.tsx:28` | workspaces | global | upsert no banco | `ADMIN` |
| `admin.workspace.edit` | Editar workspace | `workspaces/service.ts:84-94`; `WorkspacesPage.tsx:26` | workspaces | global | upsert | `ADMIN` |
| `admin.workspace.delete` | Excluir workspace | rota PostgREST `workspaces/service.ts:96-100` (sem backup); rota com backup `api/app.py:3415-3500` | workspaces, workspace_backups, workspace_audit_logs | global | **duas rotas divergentes**: uma sem backup/audit, outra com | `ADMIN` |
| `admin.workspace.duplicate` | Duplicar estrutura | `duplicateStructure.ts:33-70`; `DuplicateStructureModal.tsx:41` | rooms/problem_templates/checklist_templates (local) | workspace | duplica coleções locais | `ADMIN` (local) |
| `admin.notification.send` | Enviar notificação / push | `NotificationSendTab.tsx:64-122` → `POST /api/push/send` | notifications stock + push | workspace/global | cria in-app + web push | `ADMIN` |
| `admin.notification.rules` | Configurar regras de notificação | `NotificationRulesTab.tsx:57-64` → `updateUserProfile({notify_settings})` | profiles | workspaces | **escreve coluna inexistente** (`notify_settings` não tem DDL) | `ADMIN` (bug latente) |
| `admin.backup.create` | Criar backup de workspace | criado implicitamente no delete com backup `api/app.py:3450-3462`; `backupService.backupWorkspace` é noop (`backupService.ts:59`) | workspace_backups | global | cria row de backup | `ADMIN` |
| `admin.backup.restore` | Restaurar backup | `api/app.py:3289-3363`; `BackupsPage.tsx:49` | workspaces, workspace_audit_logs, workspace_backups | global | upsert workspace + audit | `ADMIN` |
| `admin.backup.delete` / `prune` | Excluir/podar backups | `api/app.py:3265-3286,3366-3388` | workspace_backups | global | remove/expira | `ADMIN` |
| `admin.audit.view` | Ver trilha de auditoria | `api/app.py:3391-3412` (`GET /api/admin/audit-logs`); `BackupsPage.tsx:116-149` | workspace_audit_logs | global | leitura | `ADMIN` |
| `admin.logs.view/clear` | Ver/limpar logs locais | `useLogs.ts:31-34`; `LogsPage.tsx:71,99` | audit_logs (local-only) | dispositivo | limpa local | `ADMIN` (local-only) |
| `admin.app.purge` | Purga de dados de app (ex.: TV) | `api/app.py:2780-2856`; `_require_workspace_app_manager` `:2795` | tv_* / app_data_backups / audit | workspace | backup+delete+audit | `ADMIN` (workspace manager) |
| `admin.system.wipe` | Wipe global (destrutivo) | `POST /api/admin/wipe` `api/app.py:2625-2666`; `SettingsPage.tsx:17-34`; `reset.ts:17-30` | tabelas operacionais + local | global | apaga tabelas stock/pcare/TV + local | `ADMIN` (alta criticidade) |

**Notas Admin**
- **Admin = somente `is_super_admin`** (`AdminGuard.tsx:19`). Não há "admin por workspace" hoje, exceto a purga de app via `_require_workspace_app_manager` (super admin **ou** `profile.role='admin'` — conceito legado resgatado no backend, `api/app.py:2692-2705`).
- **Nenhuma Action admin existe hoje como permission** — o gate é binário `is_super_admin`.

---

## 5. Evidência obrigatória (seleção das Actions críticas)

### Action: `ticket.create` (usuário logado)
- **Evidência:** `src/apps/chamados/services/ticketService.ts:96-112` (`create` → `POST /api/chamados`); `src/apps/chamados/hooks/useTickets.ts:121-126`.
- **Operação encontrada:** abrir chamado a partir do dashboard/launcher (rota `/chamados-publico/new` usada inclusive na Quick Action `QuickActions.tsx:11`).
- **Por que deve ser Action:** o RBAC 2.0 precisa permitir `ticket.create` sem App Access completo ("acesso rápido: Abrir chamado" sem mostrar o app completo) e `ticket.create` já existe separado de edit/status/assign.

### Action: `music.request` (independente do app)
- **Evidência:** `src/apps/tv/hooks/useMusicRequests.ts:50-77`; `src/apps/tv/services/supabase.ts:443-459`; rota `/pedir-musica` em `src/App.tsx:78-82` (só `AuthGuard`).
- **Por que deve ser Action:** já é possível hoje pedir música sem acesso ao app TV (por design — decisão já tomada). Vira capability independente do App Access.

### Action: `music.moderate`
- **Evidência:** `src/apps/tv/hooks/useMusicRequests.ts:80-127`; RLS `supabase/migrations/019_tv_music_requests.sql:41-50` (update `is_super_admin` only).
- **Por que deve ser Action:** aprovar/recusar é a operação restrita. A **concorrência** de moderação é **regra de domínio**, não uma Action (ver §13 e §16).

### Action: `stock.movement.create`
- **Evidência:** `src/apps/stock/services/movementService.ts:23-26`; efeitos em `src/apps/stock/utils/movementEffects.ts:28-61`.
- **Por que deve ser Action:** movimentação é o primitivo que altera o estoque de verdade e tem side-effects, e pode precisar ser separada de `stock.item.create/edit`.

### Action: `reservelab.tablet.reserve`
- **Evidência:** `src/apps/reservalab/services/supabase.ts:40-45`; `src/apps/reservalab/pages/Tablets.tsx:126-135`; RLS `supabase/migrations/028_authorization_consolidation.sql:223-230`.
- **Por que deve ser Action:** é a única escrita real do app (reserva/cancelamento); candidata a **Quick Action** ("reserva de tablet" sem abrir o app inteiro).

### EVIDÊNCIA INSUFICIENTE / a definir (não inventadas)
- `ticket.feedback` como permission separada vs. efeito de `ticket.createPublic`/status → **A DEFINIR** (hoje `submitFeedback` é token-scoped, `publicTicketService.ts:76-88`).
- `stock.movement.manage` vs. `stock.movement.create` — hoje ambos passam `requireWrite('stock')`; separação é **decisão de modelagem**, sem distinção no código atual.

---

## 6. Separação de ações de leitura

Regra: **não transformar cada GET em Action.** A leitura ficará implícita pelo App Access (nível `read`/`full`); a camada `view` só deve existir quando houver necessidade de **escopo por usuário** (próprio/atribuído/departamento).

| Action de leitura | Necessária? | Escopo proposto |
|---|---|---|
| `ticket.view` | Sim, se houver escopo (ex.: técnico só vê *assigned*) | `own` / `assigned` / `workspace` |
| `stock.view` | **Não** — leitura implícita pelo App Access | workspace |
| `pcare.view` | **Não** — implícita | workspace |
| `reservelab.lab.view` | **Não como Action privada** — é pública (planilha) | público |
| `reservelab.tablet.view` | Não — implícita | workspace |
| `music.request.view` (ver próprio pedido) | Não formalmente hoje | próprio |

**Formato correto:** `ticket.view` com `Scope: own | assigned | workspace` — **não** `ticket.view.own` / `ticket.view.assigned` / `ticket.view.workspace`.

> **Atual:** escopo por usuário em Chamados **não existe formalmente** no código (há `reportedBy`/`assignedTo`/`assignedToUserId` mas sem filtro imposto por permissão).
> **Proposta RBAC 2.0:** `ticket.view` com escopos `own/assigned/workspace`.

---

## 7. Quick Actions

Quick Action **não significa acesso ao sub-app inteiro**. Derivação atual: `src/platform/Dashboard/QuickActions.tsx:7-36` (mapa estático com `appId`).

| Action | quickAction | Motivo |
|---|---|---|
| `ticket.create` | **Sim** | é o atalho "Novo Chamado" (`QuickActions.tsx:9-14`), rota pública; hoje já acessível sem App Guard. |
| `music.request` | **Sim** | pedir música já funciona fora do app (`/pedir-musica`, só AuthGuard); encaixa como atalho. |
| `reservelab.tablet.reserve` | **Sim** | reservar tablet é escrita de baixa fricção; candidata a atalho. |
| `ticket.assist`/`status`/`assign` | **Não** | requerem App Access `full` (operação sobre chamado existente). |
| `stock.movement.create` | **Não** | operação operacional que pressupõe app. |

---

## 8. Dependência de App Access

Para cada Action, nível mínimo de App Access necessário. Onde o código atual **não permite determinar**, `A DEFINIR`.

| Action | App Access necessário | Evidência / critério |
|---|---|---|
| `ticket.create` | **independente** (ou `none`) | formulário público sem guard (`src/App.tsx:125`); Quick Action |
| `ticket.createPublic` | **independente** (público) | rota sem AuthGuard |
| `ticket.view/edit/status/assign/comment/close/delete` | `full` | `requireWrite('chamados')` = `full` (`permissions/service.ts:106-112`,`:125-129`; `ticketService.ts:131,156`) |
| `ticket.feedback` | **independente** (token) | token-scoped |
| `ticket.report` | `read`/`full` (dashboard) | `getReports` read com headers auth |
| `music.request` | **independente** | `/pedir-musica` só AuthGuard |
| `music.moderate` | **independente** (hoje só super admin por RLS) | RLS `019:41-50`; futuro `music.moderate` sem exigir app TV |
| `tv.content.manage` | `read`/`full` (TV) | RLS `tv_can_manage_workspace` + AppGuard tv |
| `stock.*` (criar/editar/excluir/movimentar/kit/inventory/maintenance) | `full` | `requireWrite('stock')` |
| `pcare.*` (criar/editar/partes/manutenção/import) | `full` | `requireWrite('pc-care')` |
| `reservelab.tablet.reserve` | `full` (UI) — **A DEFINIR** (RLS permite membro) | `Tablets.tsx:51` vs RLS `028:223-230` |
| `reservelab.tablet.cancel` | **A DEFINIR** | UI `full` vs RLS super admin — inconsistência atual |
| `admin.*` | **independente** (`is_super_admin`) | `AdminGuard.tsx:19` |

> **Não inventar níveis**: o código atual só modela `dash/read/full` + `manageQr` + `is_super_admin`. Qualquer nível abaixo de "existe hoje" é proposta futura explícita.

---

## 9. Escopo

Escopo **por Action** (candidatos: `own`, `assigned`, `department`, `workspace`, `global`).
Separar claramente **evidência atual** vs **proposta futura**.

| Action | Atual (evidência) | Proposta RBAC 2.0 |
|---|---|---|
| `ticket.view` | **não existe formalmente** (só workspace server-side) | `own` / `assigned` / `workspace` |
| `ticket.create` | workspace (server-side `workspace_ids`) | workspace (público = sem membership) |
| `ticket.edit/status/assign/comment/close/delete` | workspace | `assigned` / `workspace` |
| `ticket.feedback` | token (próprio chamado) | próprio chamado (token) |
| `music.request` | próprio (insert `auth.uid()=requested_by`) | `own` |
| `music.moderate` | workspace (update `eq workspace_id`) | `workspace` |
| `tv.content.manage` | workspace | `workspace` |
| `tv.purge` | workspace | `workspace` |
| `stock.*` | workspace | `workspace` |
| `pcare.*` | workspace | `workspace` |
| `reservelab.lab.view` | público (slug) | público |
| `reservelab.tablet.reserve/cancel` | workspace | `workspace` |
| `admin.*` | global | `global` (super admin) / `workspace` (purga de app) |

> **Não criar Actions diferentes somente porque o escopo é diferente** — `ticket.view` cobre `own/assigned/workspace` como valores de escopo, não como Actions separadas.

---

## 10. Admin / Liderança

Três camadas distintas (não criar " líder" como cargo global mágico):

### Platform / Admin absoluto (global, `is_super_admin`)
- `admin.system.wipe`, `admin.backup.*`, `admin.audit.view`, `admin.user.approve/reject/edit`, `admin.role.*`, `admin.workspace.*`
- Hoje: gate único `is_super_admin` (`AdminGuard.tsx:19`; backend `_require_super_admin` `api/app.py`).

### Workspace Admin (administrativo dentro do workspace)
- `tv.purge`, `tv.settings.manage`, `admin.app.purge` — já existe o conceito `_require_workspace_app_manager` (`api/app.py:2692-2705`): super admin **ou** `profile.role='admin'` (legado).
- **Proposta:** no RBAC 2.0, "admin deste workspace" via membership (permissão `admin.workspace.manage` por membership).

### Líder (delegação a subordinados — futuro)
- Relação `leaderId` já existe no tipo `Role` (`permissions/types.ts:18`) e é editável na `RolesPage.tsx:121-125,295-320`, mas **não tem efeito de autorização** hoje (é display).
- **Proposta:** liderança como relação na membership (não atributo global), permitindo delegar certas Actions.
- Regra já decidida: **ninguém pode conceder o que não possui.**

---

## 11. Delegação

| Action | Delegável | Limite |
|---|---|---|
| `ticket.assign` / `ticket.status` | **A definir** | líder pode delegar a subordinado SC mesmo workspace; nunca escalar acima do próprio nível |
| `music.moderate` | **A definir** | deve ser extremamente restrito; regra de concorrência domina |
| `tv.content.manage` | **Sim** (membro do ws) | RLS já permite membro |
| `stock.movement.create` | **Sim** (membro full) | `requireWrite('stock')` |
| `reservelab.tablet.reserve` | **Sim** (membro full) | requer membership |
| `admin.user.approve` | **Não** (hoje) | super admin global |
| `admin.workspace.delete` | **Não** (hoje) | super admin global; futuro talvez adm de ws (com backup/audit obrigatório) |

Limite transversal: **`Override > Role`** e **"não pode conceder o que não possui"** já decididos.

---

## 12. Side Effects (auditabilidade futura)

Operations com efeito importante → futura auditoria adequada (who/whom/ws/entity/action/timestamp):

| Efeito | Action(s) | Log atual |
|---|---|---|
| criação | `ticket.create`, `stock.item.create`, `pcare.asset.create`, `reservelab.tablet.reserve` | ticket: `ticket_events`/`audit_logs`; stock/pcare: **nenhum** persistido |
| alteração | `ticket.edit`, `stock.item.edit`, `pcare.*.edit` | ticket local; stock/pcare **nenhum** |
| exclusão | `ticket.delete`, `stock.item.delete`, `pcare.part.delete`, `reservelab.tablet.cancel` | ticket local; reservelab **hard delete sem audit** |
| atribuição | `ticket.assign` | `ticket_events` + push |
| mudança de status | `ticket.status`, `stock.inventory.*`, `pcare.maintenance.complete` | ticket events |
| envio de notificação | side-effect de `ticket.*`, `music.*`, `reservelab.*` | push no backend (parcial) |
| movimentação de estoque | `stock.movement.create` | **nenhum persistido** (audit_logs local-only) |
| reserva/aprovação/rejeição | `music.moderate`, `reservelab.tablet.*`, `admin.user.*` | `ticket_events` (chamado); TV/tablets **nenhum** |

**Problema transversal:** `audit_logs` é `LOCAL_ONLY` (`src/lib/sync.ts:126`); `workspace_audit_logs` só é gravado em delete/restore/purge (`api/app.py`). A maioria das mutações não tem trilha centralizada em banco.

---

## 13. Concorrência / Race Conditions

Procurar operações onde duas pessoas agem sobre a mesma entidade.

- **TV → music moderation (principal):**
  - Onde pode ocorrer: aprovação/rejeição concorrentes sobre o mesmo `tv_music_requests`, e aprovações concorrentes sobre a mesma faixa.
  - Proteção hoje: **nenhuma.** Não há advisory lock no fluxo de moderação (o único `pg_advisory_xact_lock` do domínio TV é no purge, `032_tv_app_data_purge.sql:152`). Aprovação é sequência não-atômica do cliente (`useMusicRequests.approve` `:80-117`: fetch queue → create → insert track → update status) → pode haver **efeito parcial** (track órfã se a update final falhar) e **duplicação de track** (dedup por `youtube_video_id` só client-side; sem UNIQUE em `youtube_video_id`).
  - Proteção futura a considerar (**não implementar nesta etapa, e não virar Action**): lock/advisory ou constraint de unicidade + transação única no backend; "lock de moderador" é **regra de domínio/concurrency**, não permissão.

- **Estoque:** movimento + conferência simultânea podem competir pela mesma quantidade; hoje sem lock (RLS/work-relation). Documentar apenas.

- **ReservaLab tablet:** duas reservas para o mesmo tablet/horário → sem `UNIQUE`, sem lock. Registrar como ponto de concorrência futura.

> Regra do escopo: **não transformar lock/concurrency em permission.**

---

## 14. Notificações (não vira Action automaticamente)

| Evento | Destinatário atual | Regra atual | Uso futuro sugerido |
|---|---|---|---|
| Novo chamado | push TI (`module='chamados'`); `_notify_new_ticket` `api/app.py:1739` | assinaturas módulo | `requester`, `assigned user`, `leader`, `workspace admin` |
| Mudança de status de chamado | push professor por assinatura `push:chamado:{id}` | cap 10 | `requester` |
| Atribuição de chamado | push direto ao técnico (user_id) | — | `assigned user` |
| Relatório semanal | e-mail admin (Resend) | — | `workspace admin` |
| Pedido/aprovação de música | **NÃO EXISTE hoje** | — | futuramente `requester`/`moderator` |
| Empréstimo/devolução estoque | push **MORTO** (`movementEffects.ts:8-22` sem auth) | — | `workspace admin` |
| Alerta de validade estoque | in-app ws-scoped (`expiryAlerts.ts:43-60`) | — | `workspace` |
| PC Care peças/manutenção | push **cross-workspace** (`check-pcare`, `src/apps/reservalab/api/app.py:1104-1187`, sem ws_id) | cron | `workspace` (corrigir vazamento) |
| Reserva lab/tablet ≤15min | push `module='reservalab'` (`app.py:756-880`) | janela 15min + dedup 2h | `workspace` |

---

## 15. Catálogo consolidado

| App | Action | Tipo | Quick Action | App Access | Scope | Delegável |
|---|---|---|---|---|---|---|
| Chamados | `ticket.create` | ACTION | Sim | independente | workspace | Sim |
| Chamados | `ticket.createPublic` | PUBLIC | Sim* | independente/público | público | — |
| Chamados | `ticket.view` | ACTION | Não | read/full | own/assigned/workspace (proposta) | Sim |
| Chamados | `ticket.edit` | ACTION | Não | full | workspace | Sim |
| Chamados | `ticket.status` | ACTION | Não | full | workspace | A definir |
| Chamados | `ticket.assign` | ACTION | Não | full | workspace | A definir |
| Chamados | `ticket.close` / `reopen` | ACTION | Não | full | workspace | A definir |
| Chamados | `ticket.comment` | ACTION | Não | full | workspace | Sim |
| Chamados | `ticket.delete` | ACTION | Não | full | workspace | A definir |
| Chamados | `ticket.feedback` | ACTION | Não | independente (token) | próprio | — |
| Chamados | `ticket.track` | PUBLIC | Não | público | próprio | — |
| Chamados | `ticket.qr` | ACTION | Não | independente (`manageQr`) | workspace | Sim |
| Chamados | `ticket.report` | ACTION | Não | read | workspace | Não |
| Chamados | `ticket.weeklyEmail` | ADMIN | Não | full/admin | workspace | Não |
| TV | `music.request` | ACTION | Sim | independente | own | — |
| TV | `music.moderate` | ACTION | Não | independente (restrito) | workspace | A definir |
| TV | `tv.content.manage` | ACTION | Não | read/full (TV) | workspace | Sim |
| TV | `tv.urgentAnnouncement` | ACTION | Não | read/full (TV) | workspace | Sim |
| TV | `tv.device.manage` | ADMIN/ACTION | Não | read/full (TV) | workspace | Não |
| TV | `tv.purge` | ADMIN | Não | workspace-admin | workspace | Não |
| TV | `tv.settings.manage` | ADMIN | Não | workspace-admin | workspace | Não |
| TV | `tv.playback.control` | RULE/INTERNAL | Não | — | dispositivo | — |
| Estoque | `stock.item.create` | ACTION | Não | full | workspace | Sim |
| Estoque | `stock.item.edit` | ACTION | Não | full | workspace | Sim |
| Estoque | `stock.item.delete` | ACTION | Não | full | workspace | A definir |
| Estoque | `stock.movement.create` | ACTION | Não | full | workspace | Sim |
| Estoque | `stock.movement.manage` | ACTION | Não | full | workspace | A definir |
| Estoque | `stock.kit.audit` | ACTION | Não | full | workspace | Sim |
| Estoque | `stock.inventory.run` | ACTION | Não | full | workspace | A definir |
| Estoque | `stock.maintenance.manage` | ACTION | Não | full | workspace | Sim |
| Estoque | `stock.export` | ACTION/leitura | Não | read | workspace | Sim |
| Estoque | `stock.qr.activateAsPC` | ACTION | Não | full | workspace | A definir |
| PC Care | `pcare.asset.create` | ACTION | Não | full | workspace | Sim |
| PC Care | `pcare.asset.edit` | ACTION | Não | full | workspace | Sim |
| PC Care | `pcare.asset.manage` | ACTION | Não | full | workspace | Sim |
| PC Care | `pcare.part.create` | ACTION | Não | full | workspace | Sim |
| PC Care | `pcare.part.edit` | ACTION | Não | full | workspace | Sim |
| PC Care | `pcare.part.delete` | ACTION | Não | full | workspace | Sim |
| PC Care | `pcare.part.usage` | ACTION (morto hoje) | Não | full | workspace | Sim |
| PC Care | `pcare.maintenance.manage` | ACTION | Não | full | workspace | Sim |
| PC Care | `pcare.checklist.*` | DEPRECATED | Não | full | workspace | — |
| PC Care | `pcare.export` | ACTION/leitura | Não | read | workspace | Sim |
| PC Care | `pcare.import` | ACTION | Não | full | workspace | Sim |
| PC Care | `pcare.data.clear` | INTERNAL | Não | full (device) | dispositivo | Não |
| ReservaLab | `reservelab.lab.view` | PUBLIC | Não | — | público | — |
| ReservaLab | `reservelab.tablet.view` | leitura | Não | read | workspace | — |
| ReservaLab | `reservelab.tablet.reserve` | ACTION | Sim | full (A DEFINIR) | workspace | Sim |
| ReservaLab | `reservelab.tablet.cancel` | ACTION | Não | A DEFINIR | workspace | A definir |
| ReservaLab | `reservelab.push.manage` | ADMIN | Não | admin | workspace/global | Não |
| Admin | `admin.user.approve` | ADMIN | Não | super admin | global | Não |
| Admin | `admin.user.reject` | ADMIN | Não | super admin | global | Não |
| Admin | `admin.user.edit` | ADMIN | Não | super admin | global | Não |
| Admin | `admin.role.create/edit/delete` | ADMIN (local) | Não | super admin | global/device | Não |
| Admin | `admin.workspace.create/edit` | ADMIN | Não | super admin | global | Não |
| Admin | `admin.workspace.delete` | ADMIN | Não | super admin | global | Não |
| Admin | `admin.workspace.duplicate` | ADMIN | Não | super admin | workspace | Não |
| Admin | `admin.notification.send/rules` | ADMIN | Não | super admin | workspace/global | Não |
| Admin | `admin.backup.create/restore/delete` | ADMIN | Não | super admin | global | Não |
| Admin | `admin.audit.view` | ADMIN | Não | super admin | global | Não |
| Admin | `admin.app.purge` | ADMIN | Não | workspace-admin | workspace | Não |
| Admin | `admin.system.wipe` | ADMIN | Não | super admin | global | Não |

\* `ticket.createPublic` como "o formulário público sempre pode criar" — não é uma Quick Action de UI logada, mas o mesmo atalho de criação.

> **Fonte de decisão para a próxima etapa do RBAC 2.0** — o `Tipo`, `App Access` e `Escopo` devem ser validados/ajustados antes da implementação.

---

## 16. Não transformar em Action

| Candidato falso | Justificativa |
|---|---|
| `music.lock` | Lock/concorrência de moderação é **regra de domínio**, não permissão (§13). |
| `ticket.closed_edit_rule` | "não pode editar chamado fechado" é **regra de negócio** do chamado (validação de domínio), não capability: nenhum guard hoje impede; é comportamento do status `fechado`/`archived` (`ticketService.isArchived` `:89`). |
| `notification.received` / `notification.seen` | Receber/ser destinatário é **efeito/derivado**, não permissão. Notificações não viram Action (§14). |
| `stock.view` / `pcare.view` (genérico) | Leitura implícita pelo App Access (§6). |
| `tv.playback.control` | Controle de playback é RULE/estado de player sem escrita em banco (§4.2). |
| `pcare.action_log.log` | Log interno; hoje morto e sem guard; auditoria é infraestrutura, não permissão. |
| `reservelab.lab.view` (como privada) | É **public by design** (planilha externa); não deve virar capability protegida. |
| `admin.backup.prune` (separado) | Podem ser derivados de `admin.backup.*` ou efeito automático (TTL); não multiplicar. |

---

## 17. Decisões ainda necessárias

1. `ticket.feedback` deve ser permission separada ou efeito derivado de `ticket.createPublic`/encerramento de status?
2. `ticket.edit` e `ticket.status` devem ser separadas (editar campos ≠ mudar status)?
3. `stock.movement.manage` precisa existir separadamente de `stock.movement.create`?
4. `music.moderate` deve exigir ter acesso ao app TV ou basta a capability isolada? E quem pode concedê-la (só super admin? admin de workspace?)?
5. As rotas legadas `profile.role='admin'` (usadas em `_require_workspace_app_manager`) devem virar explicitamente "admin de workspace" no RBAC 2.0, ou serem eliminadas?
6. `reservelab.tablet.cancel` — como resolver a inconsistência atual (UI full vs RLS super admin)? Vira Action com escopo workspace?
7. Escopo por Action é propriedade da Action ou da Membership/override?
8. Quais Actions admin (aprovar/rejeitar usuário, wipe, backup) devem ser delegáveis a "admin de workspace" no futuro — e em quais limites?
9. `stock.qr.activateAsPC` — é uma Action própria ou efeito de `stock.item.edit` + `pcare.asset.create`?

---

## 18. Impacto futuro no RBAC 2.0

Este catálogo de Actions alimentará as seguintes partes (somente mapeamento conceitual — **nada foi implementado**):

```
AppModule
    ↓
Capabilities / Actions     ← este catálogo define o conjunto de capabilities por módulo
    ↓
Role                        (cada cargo passa a referenciar um conjunto de capabilities/actions)
    ↓
Membership                  (role/status/app_access/actions/overrides por associação workspace)
    ↓
Override                    (override individual personaliza capabilities/actions da membership)
    ↓
Scope                       (own / assigned / department / workspace / global por Action)
    ↓
Authorization              (resolução efetiva: super admin → override → role → membership)
```

Pontos de apoio no código atual para esta evolução (evidência de extensibilidade):
- `AppModule` (`src/appRegistry.ts:8-29`) — contrato de app; hoje já carrega `configurable/clearable/settings/SettingsPanel`. Um campo `capabilities/actions` espelharia esse padrão (documentado em `RolesPage.tsx:378` como placeholder pendente).
- `permissionService.resolveAppAccess` (`service.ts:82-93`) — padrão de resolução efetiva `super admin → override → role`.
- `manageQr` (`service.ts:115-122`) — exemplo do único primitive boolean de capability fora do nível.
- `APPS_CONFIGURABLE` / `isModuleAvailable` (`workspaces/apps.ts:6-31`) — como o workspace interage com acesso.
- `QuickActions` (`platform/Dashboard/QuickActions.tsx`) — derivado atual das Actions; derivável das capabilities no futuro.

> **Importante:** nenhuma migration, alteração de RLS/auth/guards/services/endpoints, refactor, lock ou criação de Action no código foi realizada. **Somente** este documento foi criado.

---

## Validação final (auditoria)

- [x] `git diff --stat` — verificado antes da criação
- [x] `git status` — verificado antes da criação
- [x] **Somente** `docs/architecture/rbac2.0-actions-catalog.md` criado nesta tarefa
- [x] Nenhum arquivo de código modificado
- [x] Nenhuma migration executada
- [x] Nenhum commit / push
