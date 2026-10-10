# Auditoria técnica — Inventário de Patrimônio de TI (issue #289)

> Auditoria somente-leitura do repositório LabHub (`main`), preparatória à implementação do
> módulo de patrimônio. Todas as afirmações abaixo são sustentadas por caminhos de arquivo,
> nomes de funções e migrations reais. Presença de migration **não** prova aplicação em
> DEV/PROD (ver §3.7). Nenhum arquivo, banco, configuração ou ambiente foi alterado para
> produzir este relatório — exceto a criação deste próprio arquivo, explicitamente autorizada.

---

## 1. Resumo executivo

1. **Existe uma base de ativos patrimoniais já criada e não utilizada**: a migration
   `024_global_asset_registry.sql` cria `public.assets` (tag, série, tipo, fabricante,
   modelo, `location_id`, status, metadata, workspace) com RLS por unidade. O frontend já
   tem repositório e sync ligados (`src/core/assets/global-repository.ts`,
   `global_assets` → tabela `assets` em `src/lib/sync.ts:167`), **mas nenhuma tela consome
   o repositório**. É o ponto de partida natural — não criar entidade paralela.
2. **O Stock atual já é serializado, não quantitativo**: `StockItem` tem `serialNumber`,
   `room`, `status`, `condition` e não tem campo `quantity`. Contudo, é um modelo de
   **controle de items/peças de T.I.** (com seções como `cabos`, `material_escritorio`),
   sem patrimônio institucional, sem prédio/andar, sem responsável, sem histórico de
   alterações críticas. **Recomendação: Stock permanece separado do patrimônio**; o
   patrimônio reutiliza `public.assets` + padrões (movimentação, RLS, RBAC), não as
   coleções de estoque.
3. **O PC Care possui o modelo de ativo mais completo do projeto** (`pcare.Asset` com
   `assetTag` ("Patrimônio"), `serialNumber`, `location`, `technical`, `network`,
   hierarquia `parentAssetId`) — mas **é local-only** (`assets` está em
   `LOCAL_ONLY_COLLECTIONS`, sem tabela remota) e não tem dono/responsável.
4. **Não existe qualquer conceito de localização estruturada** (prédio/andar/sala) em todo
   o banco: tudo é texto livre (`stock_items.room`, `pcare.assets.location`,
   `chamados_tickets.roomName`, `tablet_reservations.sala`). `public.assets.location_id`
   é uma coluna ** dangling** (sem FK, sem tabela-alvo, única ocorrência em 87 migrations).
5. **Não existe mecanismo de empréstimo/custódia** além de movimentações do Stock
   (`emprestimo`/`devolucao` com `borrowedBy`, `expectedReturnAt`) e cron de atraso
   (`/api/push/check-overdue`).
6. **Importação: 100% client-side.** Não há nenhum endpoint de upload de arquivo no
   backend (sem `request.files`/`multipart`/módulo `csv`). Todo o fluxo é SheetJS no
   navegador (`src/apps/stock/utils/import.ts`, `NotebookBatchImport.tsx` com template de
   26 colunas). O backend só analisa XLSX de **URLs configuradas** (TV, ReservaLab) com
   proteção SSRF — padrão útil, mas não é upload.
7. **RBAC 2.0 é maduro e reutilizável**: `roles`/`role_permissions`/`memberships`/
   `membership_overrides`, engine de precedência em `src/apps/reservalab/api/rbac.py`,
   helpers SQL (`user_has_action` em 082, `user_belongs_to_workspace` em 049,
   `is_super_admin`) e catálogo sem wildcards (exato: `stock.item.create`). Um módulo
   `patrimonio.*` segue o mesmo padrão com TRAVAS (082/086).
8. **Auditoria**: `public.app_audit_logs` (054) é genérica, append-only, com SELECT por
   unidade — pronta para receber eventos do patrimônio; não há fábrica de triggers
   genérica (cada módulo cria a sua função trigger, padrão 054/065/083).
9. **Complemento (simplificação/desempenho/swipe)**: Pipeline, Kits e QR são removíveis
   da UI **sem tocar em dados ou banco**. O custo de rede do Stock não vem das telas
   (todas leem cache local) e sim do **`syncAll()` completo disparado por
   `useOnlineSync`** — montado em 5+ lugares, com intervalo de 30s por instância e
   `select('*')` sem paginação em 16 coleções remotas. Evidências e correções em §13.

---

## 2. Mapa do código

### 2.1 Stock (`src/apps/stock/`)

| Camada | Arquivos | Papel |
|---|---|---|
| Rotas | `index.tsx` | `qr-scan` fora do layout; dentro de `StockLayout`: index (Dashboard), `items`, `items/:id`, `movements`, `kits`, `kits/:id`, `inventory`, `inventory/:id`, `qr`, `entry-exit`, `maintenance`, `pipeline` |
| Alias | `src/App.tsx` (`/general-stock/*`) + `utils/stockPath.ts` | mesmo app sob dois prefixos (`STOCK_PREFIXES`) |
| Páginas | `StockDashboard` (usa 5 hooks: stock, kits, movements, inventory, maintenance), `StockSection` (lista/filtros/importação/lote), `StockDetail`, `StockEntryExit`, `MovementsPage`, `KitList/KitDetail`, `InventoryList/InventoryDetail`, `Pipeline`, `QRGenerator/QRScanner`, `StockMaintenance` | — |
| Componentes | `StockCard`, `SectionTabs`, `StockForm`, `MovementForm/MovementTimeline`, `BatchCreateModal`, `DesktopSetupModal`, `NotebookSetupModal` (1.414 linhas), `NotebookBatchImport` (CSV de 26 colunas), `StockBatchBar`, `StockBottomNav`, `StatusBadge`, `ExpiryBadge`, `KitCard/KitChecklist` | — |
| Hooks | `useStock`, `useMovements`, `useKits`, `useInventory`, `useStockMaintenance`, `useStockSelection`, `useExpiryAlerts` | todos leem cache local (síncrono) |
| Serviços | `stockService` (`stock_items`), `movementService` (`stock_movements`, soft-delete), `kitService` (`stock_kits`), `inventoryService` (`inventory_cycles`/`inventory_counts`), `stockMaintenanceService` (`stock_maintenance`), `stockPhotoService` (localStorage+Cloudinary), `expiryAlerts` | wrappers de `createSyncService` (`src/lib/sync.ts`) |
| Utils | `import.ts` (SheetJS), `export.ts`, `batchCreate.ts` (`dedupeBySerial`, `createMany`), `movementEffects.ts` (efeitos + push de empréstimo/devolução), `overdue.ts`, `activateAsPC.ts`, `qrScanner.ts` | — |
| Tipos | `stock.ts`, `movement.ts`, `kit.ts`, `inventory.ts`, `maintenance.ts` | — |
| Testes | 24 arquivos em `__tests__/` (services 8, utils 7, hooks 6, components 4) + `src/lib/components/__tests__/appNavSweep.test.tsx` (nav em `/general-stock`) | — |

**Ações RBAC usadas pela UI:** `stock.item.create/edit/delete`, `stock.movement.create`,
`stock.movement.manage`, `stock.maintenance.manage`, `stock.kit.audit`,
`stock.inventory.run` (via `useCanAccessAction`).

### 2.2 PC Care (`src/apps/pcare/`)

- Rotas (`index.tsx`): `scanner`; `/` Dashboard; `assets`/`assets/new`/`assets/:id`(+edit)
  — hoje operam o modelo **Asset**; `pcs`/`pcs/new`/`pcs/:id`(+edit) — aliases legados;
  `parts`, `parts/consolidado` (`StockConsolidado`), `qr` (redireciona para `/stock/qr`),
  `checklists`, `checklists/:templateId/execute`, `reports`, `maintenance`, `settings`.
- `types/asset.ts` — `Asset`: `assetTag` (rótulo "Patrimônio" no `PCForm.tsx:28`),
  `equipmentType` (17 tipos), `manufacturer`, `model`, `serialNumber`, `location`,
  `status ('in_use'|'available'|'reserve'|'maintenance'|'retired')`, `observations`,
  `technical`, `network` (hostname/MACs/IP/domínio), `parentAssetId`/`childAssetIds`,
  `photos`, `warranty`, `licenses`.
- `types/pc.ts` — legado `PC` (labName, pcNumber, assetTag, roomLocation, specs, config,
  cleaning/restorationStatus...). `assetService.ts` migra `PC → Asset` uma vez
  (`migrateLegacyPCs`) quando a coleção está vazia.
- Serviços: todos `createSyncService`; **`assets` é LOCAL-ONLY** (`sync.ts:120-128`, sem
  tabela remota); `pcs/parts/part_usage/maintenance/checklist_templates/pc_checklists/
  action_logs` → schema `pcare`. `pcService` **não tem `remove`** (exclusão é papel do
  Stock); `partUsageService` é somente-leitura; `pcChecklistService` removido (F2-D-N2).
- `RedirectToStock.tsx` é **código órfão** (exportado, sem rota) — política "PC novo se
  cadastra no Estoque".
- Testes: 39 arquivos (13 páginas, 6 services, 9 hooks, 10 components, 1 util).

### 2.3 Núcleo compartilhado

- `src/lib/sync.ts` — camada local-first: cache IndexedDB (`src/lib/db.ts`), dirty set
  (`labhub_dirty_collections`), tombstones (`labhub_deleted_ids`), log
  (`labhub_sync_log`); `syncSingle`/`syncAll`; `REMOTE_DB` (16 coleções → schemas
  `pcare`/`stock`/`public`), `TABLE_NAME_MAP` (`inventory_cycles → stock_inventory_cycles`,
  `inventory_counts → stock_inventory_counts`, `global_assets → assets`).
- `src/lib/useOnlineSync.ts` — sync no mount, no evento `online`, no `storage` e
  `setInterval` de **30s**.
- `src/lib/useFastSync.ts` — padrão de sync direcionado por coleção (10s) para módulos
  prioritários (chamados/notificações).
- `src/lib/storage.ts` — `createLocalService`: filtra por `workspaceStore.filter`, estampa
  `workspace_id` no create, fail-closed sem sessão (retorna `[]` / no-op);
  `NoCacheIdentityError` existe mas nunca é lançado (decisão documentada).
- `src/core/assets/` — `global-types.ts` (`GlobalAsset` espelhando `public.assets`),
  `global-repository.ts`, `service.ts` (mescla PCs + stock para o seletor de ativos do
  Chamados).

---

## 3. Inventário do banco (Supabase)

### 3.1 Tabelas e views relevantes

| Objeto (nome exato) | Origem | Finalidade / relações / restrições | RLS / grants | Reuso p/ patrimônio |
|---|---|---|---|---|
| `public.workspaces` | 009 (base final em 000) | A unidade/campus. `slug UNIQUE`, `location TEXT`, `lab_count`, `disabled_apps JSONB` | 044: select p/ membro ou super; escrita super-admin | Sim — FK obrigatória |
| `public.profiles` | 001 + 012/014/019/051/087/088 | Usuários; `status CHECK ('pending','active','blocked','rejected','suspended')` (074), `institutionalEmail` (087/088) | 044 select (`profile_visible_to_me`), 067 update c/ trigger guarda (083), 073 delete super | Sim — responsável |
| `public.memberships` | 036 + 045 | `UNIQUE(profile_id, workspace_id)`, `status ('pending','active','suspended','removed')`, `role_id`, `managed_by` (045) | 036: escrita super; select membro/super | Sim — escopo |
| `public.roles` / `role_permissions` / `membership_overrides` | 036 (+040/045) | `roles.slug` (`tec`,`vis`,`est`,`opv`,`adm`,`coordinator`,`lider`); `role_permissions(role_id, action, scope CHECK workspace/global/self)`; overrides allow/deny | escrita super; select membro/super | Sim — matriz |
| **`public.assets`** | **024** (policies refeitas em 033) | Registro global de ativos: `asset_tag`, `serial_number`, `equipment_type`, `manufacturer`, `model`, `name`, `location_id UUID` (sem FK!), `status 'draft'`, `notes`, `metadata JSONB`, `created_by`; `UNIQUE(workspace_id, asset_tag) WHERE asset_tag IS NOT NULL`; índices em serial/status/tipo | 033: select/insert/update `is_super_admin() OR user_belongs_to_workspace(...)`; **delete só super-admin** | **Sim — base do módulo** |
| `stock.stock_items` | 000:68-92 (+016 `expiresAt`) | Itens serializados: `serialNumber`, `room TEXT`, `status ('ativo')`, `condition`, `linkedPcId/Label TEXT` (sem FK), `pcParts JSONB` | 027: `{t}_*` por `user_belongs_to_workspace`; grants: anon revogado (026), authenticated CRUD, service_role ALL | Parcial (referência de padrões) |
| `stock.stock_movements` | 000:94-122 | Histórico: `type CHECK ('entrada','saida','mudanca_sala','conserto','descarte','substituicao','emprestimo','devolucao')`, `fromRoom/toRoom/destinationRoom`, `borrowedBy`, `borrowerContact`, `expectedReturnAt`, `returnedAt`, `deletedAt` | idem 027 | **Padrão de movimentação a copiar** (não reutilizar: `itemId` é TEXT sem FK) |
| `stock.stock_kits` | 000:124-134 | Kits c/ `room TEXT`, `items JSONB` | idem | Não (fora do escopo) |
| `stock.stock_inventory_cycles` / `stock_inventory_counts` | 000:136-166 | Inventário cíclico (contagens) | idem | Referência para contagem patrimonial futura |
| `stock.stock_maintenance`, `stock.stock_photos`, `stock.notifications` | 000:168-193, 016 | Manutenção/fotos/notificações | idem | Referência |
| `pcare.assets` | 000:199-221 | Ativo técnico: `assetTag`, `serialNumber`, `location TEXT`, `technical JSONB`, `network JSONB`, `parentAssetId` self-FK | **Sem policies em 027**; sem GRANT explícito | **Fonte de campos técnicos** |
| `pcare.pcs` / `parts` / `part_usage` / `maintenance` / `checklist_templates` / `pc_checklists` / `action_logs` | 000:223-315 | PC Care operacional | 027 (7 tabelas); 082 endurece checklists c/ `pcare.checklist.*` | `action_logs` = padrão de log por PC |
| **`public.app_audit_logs`** | 054 | Auditoria de app: `workspace_id`, `actor_id/actor_name`, `action`, `entity/entity_id/entity_label`, `meta JSONB`, `timestamp`; índices `(workspace_id, timestamp DESC)` etc. | RLS ENABLE+FORCE; só `app_audit_logs_select` (membro/super); `REVOKE ALL FROM anon, PUBLIC`; `GRANT SELECT TO authenticated` | **Sim — destino da auditoria** |
| `public.rbac_audit_logs` | 036:147-176 | Decisões RBAC (allow/deny) | select só super; escrita só service_role | Não (uso indireto) |
| `workspace_audit_logs` / `workspace_backups` | 021 | Exclusão de workspace | — | Não |
| `workspace_app_settings` / `app_data_backups` | 031 | Config por (workspace, app_id) | `can_manage_workspace_apps()` | Padrão p/ config do módulo |
| `tablet_reservations` | 028 + 051 | Único "equipamento reservável" (tablets, estoque fixo 50 hardcoded) | — | Não no MVP |

**Views:** nenhuma view relevante encontrada nas 87 migrations.

### 3.2 Funções/RPCs (assinaturas exatas, estado final)

- `is_super_admin() boolean` — 024, versão autoritativa 028; `GRANT EXECUTE TO authenticated` (085).
- `user_belongs_to_workspace(ws_id uuid) boolean` — reescrita em **049** (baseada em
  `memberships` ativas; fail-closed; GRANT authenticated+service_role).
- `user_has_action(ws_id uuid, p_action text) boolean` — **082:225-245**: membership
  ativa + `role_permissions` de ação exata com `scope='workspace'`; super-admin fica
  fora do helper (bypass vive na policy). É o helper genérico a reutilizar.
- `can_manage_workspace_apps(uuid)` — 076; GRANT em 085.
- `is_coordinator_of(uuid)`, `get_coordinator_units()`, `get_coordinator_leaders(uuid)`,
  `get_memberships_by_manager(uuid)`, `get_coordinator_unit_overview(uuid) RETURNS jsonb`,
  `coordinator_get_members(uuid)`, ciclo `coordinator_approve/suspend/restore/remove/set_role/set_manager` — 045/046/047/065/066/070/071 (trust boundary 068/069).
- `admin_upsert_membership`, `admin_remove_membership`, `admin_set_manager` — 072.
- Triggers de auditoria: `audit_memberships_change` / `audit_profiles_change` (054;
  enriquecido 065; reconstruído 083), `trg_memberships_manager_guard` (046),
  `trg_workspaces_purge_workspace_ids` (048), `guard_profile_privileged_columns` (067/083).
- **Sem wildcards**: o engine é exato — "no wildcards like `stock.*`" (036:345-347, 040).

### 3.3 Catálogo de Actions existente (relevantes)

- `stock.*` (036:377-385): `item.create/edit/delete`, `movement.create/manage`,
  `kit.audit`, `inventory.run`, `maintenance.manage`, `export` — para `tec` e `est`;
  `vis`/`coordinator` só `stock.export`.
- `pcare.*` (036 + 082): `asset.create/edit/manage`, `part.create/edit/delete`,
  `maintenance.manage`, `export`, `import`, `checklist.create/edit/delete` (tec).
- `ticket.*`, `tv.*`, `music.request` (scope `self`), `reservelab.tablet.reserve/cancel`,
  `admin.app.purge`, `admin.audit.view` (global), `chamados.settings.manage` (082).

### 3.4 Auditoria — mecanismo real

- Escritores atuais: (1) backend Python (`_log_rejection_audit`,
  `src/apps/reservalab/api/app.py:1370` → `app_audit_logs`); (2) triggers 054/065/083
  (memberships/profiles); (3) engine RBAC (`record_rbac_audit` → `rbac_audit_logs`).
- **Frontend nunca escreve auditoria** (grep sem resultados; `'audit_logs'` é só nome de
  coleção local em `sync.ts:125`). Leitura: `CoordinatorAuditTab.tsx:207-211`.
- **Não há fábrica de triggers genérica nem retention** (único cron é backup de workspace).
- Rota de leitura: `GET /api/admin/audit-logs` (`@require_action_rbac('admin.audit.view', scope='global')`).

### 3.5 Localização física — o que existe

Somente texto livre: `stock_items.room`, `stock_movements.fromRoom/toRoom`,
`stock_kits.room`, `stock_inventory_counts.itemRoom/actualRoom`, `pcare.assets.location`,
`pcare.pcs."labName"/"roomLocation"`, `chamados_tickets."roomId"/"roomName"`,
`tablet_reservations.sala`. `stock.rooms` é citada só em ALTER condicional de 009:53
(**tabela fantasma, nunca criada** — `roomService` é local-only e "fluxo morto" segundo
082:17). `public.assets.location_id` (024:35) não tem tabela-alvo.

### 3.6 Sequência de migrations

Presentes 000–036, 038–078, 082–090 (87 arquivos). **Ausentes: 037, 079, 080, 081**
(079 foi liberado pela renumeração 079→082, explicada no cabeçalho de 087).

### 3.7 Código vs. ambientes (DEV/PROD)

**Confirmável pelo código:** DDL, policies, grants, funções e seeds acima.
**Exige verificação separada nos ambientes:** se `024`/`033`/`049`/`082`/`085`/`086` já
foram aplicados (ordem e estado real das policies de `public.assets`), se `assets`
recebeu os grants pós-`ALTER DEFAULT PRIVILEGES`, existência/estado de `stock.*` e
`pcare.*` em cada ambiente, e dados reais (a coluna `location_id` nula ou populada).
O workflow `migrations.yml` roda **testes estáticos**, não aplica migrations.

---

## 4. Auditoria do Stock e PC Care — reuso

### 4.1 Stock: separar, não estender

- Stock = controle de itens de TI (consumíveis + equipamentos de bancada), serializado
  por necessidade operacional, com seções de consumível (`cabos`, `adaptadores`,
  `material_escritorio`). Sem patrimônio institucional, sem prédio/andar, sem
  responsável por colaborador, sem histórico imutável (`stock_movements` tem tombstone
  `deletedAt` e é editável).
- **Misturar ativos patrimoniais em `stock_items` violaria a própria issue** ("não misturar
  estoque de consumíveis com ativo patrimonial sem modelagem clara").
- O que o patrimônio **reutiliza do Stock**: padrões e utilitários —
  `movementEffects` (efeito do movimento no status/local), `overdue` (empréstimos
  atrasados), `batchCreate.dedupeBySerial`/`createMany`, `import.ts` (SheetJS+validação),
  `exportCSV`, o fluxo de preview de importação de `StockSection.tsx:494-584`, e o
  guarda de ações (`useCanAccessAction`).

### 4.2 PC Care: fonte de dados técnicos

- `pcare.Asset` já carrega patrimônio (`assetTag`), série, local (texto), specs,
  rede (hostname/MAC/IP/domínio), garantia, licenças e hierarquia — exatamente o
  complemento técnico de um ativo patrimonial.
- Problemas: coleção **local-only** (não sincroniza; dados presos no navegador),
  sem responsável, sem unidade estruturada, migração one-way de `PC`.
- **Recomendação**: patrimônio (`public.assets`) vira o registro mestre; PC Care passa a
  **referenciar** o ativo (ex.: `metadata.patrimonio_id` ou coluna nova) para dados
  técnicos; não duplicar identificação. Integração pode ser fase 2 (§9/§12).

### 4.3 Registro global já existente

`public.assets` (024) + `GlobalAsset`/`globalAssetRepository` (frontend) + alias de sync
(`global_assets → assets`) formam um protótipo de patrimônio **sem UI**. Decisão central
de desenho: evoluir `public.assets` em vez de criar tabela nova (evita segunda entidade
de ativo — a issue proíbe duplicar sem justificativa).

---

## 5. Auditoria do RBAC — mecanismos e lacunas

### 5.1 Como funciona (backend)

1. **Pertença à unidade**: `memberships(profile_id, workspace_id, role_id, status)`;
   `require_auth` (`src/apps/reservalab/api/auth.py:304-354`) valida JWT (JWKS c/ fallback
   HMAC), bloqueia `blocked`/`rejected`, e preenche `g.user` + `g.user_id` +
   `g.user['workspace_ids']` via `GET /rest/v1/memberships?profile_id=eq.{id}&status=eq.active`
   (`_get_user_workspace_ids`, fail-closed `[]`). `require_workspace` resolve o workspace
   por body/query/slug e valida pertenças (super bypass).
2. **Decisão**: `rbac_can(profile, workspace_id, action, scope='workspace')`
   (`rbac.py:144-201`): super_admin → ALLOW; sem membership ativa → DENY; base =
   `role_permissions` (escopo exato); `override.deny` vence `allow`; default DENY.
   `record_rbac_audit` registra allow/deny em `rbac_audit_logs`.
3. **Uso em handlers**: `_require_action_in_handler(action, scope, resource_type, resource_id)`
   (`api/app.py:80-109`) — o handler resolve o workspace real do recurso e seta
   `g.workspace_id` antes (exemplos: `api/app.py:2789` `ticket.view`; `2960`
   `ticket.delete`; `4620` `ticket.claim`). Decoradores: `@require_action_rbac(...)`.
4. **Banco (sem confiar na UI)**: policies RLS chamando `user_has_action(workspace_id,
   'patrimonio.…')` + `is_super_admin() OR` (padrão 082), e `user_belongs_to_workspace`
   para leitura (padrão 027/033). Lição da 085: todo helper SECURITY DEFINER novo precisa
   `REVOKE anon/PUBLIC` **e** `GRANT EXECUTE ... TO authenticated`.

### 5.2 Frontend

- `useCanAccessAction` → `membershipService.can` (consulta `role_permissions` com o token
  do usuário; fail-closed enquanto carrega). **Não consulta `membership_overrides`**
  (overrides só valem no backend e em `workspaceAssigneesService.ts:74-98`) — lacuna a
  documentar, não a corrigir aqui.
- Visibilidade de módulo: `useModuleLevel`/`MODULE_VISIBILITY_BY_SLUG` (matriz por slug do
  papel) + `AppGuard` ("Acesso restrito" / "Indisponível neste workspace").
- Isolamento local: `workspaceStore.matches/filter` + estampa de `workspace_id` no create
  (`storage.ts:62-71`), fail-closed sem sessão.
- Coordenador multiunidade: escopo vem **só de RPCs SECURITY DEFINER**
  (`get_coordinator_units` etc.), nunca de parâmetro do cliente.

### 5.3 Matriz inicial proposta — patrimônio

Convenção `<módulo>.<entidade>.<operação>`, escopo `workspace`, ação **exata**
(sem wildcard), seed com `ON CONFLICT DO NOTHING` + TRAVAS anti-concessão em massa
(padão 082/086). **Todos os pares papel×ação abaixo são DECISÃO PENDENTE** exceto onde
há analogia direta com o catálogo atual.

| Action (proposta) | tec | coordinator | lider | vis | Observação |
|---|---|---|---|---|---|
| `patrimonio.asset.view` | ✔ | ✔ | ✔ | ✔ | leitura; RLS select por unidade |
| `patrimonio.asset.create` | ✔ | ✖ | ✖ | ✖ | espelha `stock.item.create`/`pcare.asset.create` |
| `patrimonio.asset.edit` | ✔ | ✖ | ✖ | ✖ | |
| `patrimonio.asset.move` | ✔ | ✖ | ✖ | ✖ | movimentação/transferência |
| `patrimonio.loan.manage` | ✔ | ✖ | ✖ | ✖ | empréstimo/devolução (pendente: nome) |
| `patrimonio.asset.archive` | ✔ | ✖ | ✖ | ✖ | arquivar sem apagar |
| `patrimonio.import.run` | ✔ | ✖ | ✖ | ✖ | importação da planilha |
| `patrimonio.audit.view` | ✔ | ✔ | ✖ | ✖ | histórico crítico (pendente: coordenador vê?) |
| `patrimonio.export` | ✔ | ✔ | ✖ | ✔ | análogo a `stock.export` |

**Pendências de matriz**: vis vê unidade inteira ou só o que lhe pertence?; lider tem
algum papel (hoje é 0 ações); coordenador de multiunidade lê auditoria?; existe
`patrimonio.admin` para mesclar/reprocessar importações?

---

## 6. Modelo conceitual proposto

### 6.1 Definições (diferenciação exigida pela issue)

- **Estoque**: quantidade/disponibilidade de material (`pcare.parts.quantity` é o único
  campo quantitativo do projeto; `stock_items` é serializado mas é material de TI).
- **Ativo patrimonial**: equipamento **individual** identificável (patrimônio e/ou série),
  com unidade, localização, responsável, status/condição e histórico.
- **Localização**: onde o ativo está (estruturada: prédio/andar/sala — hoje não existe em
  lugar nenhum do banco).
- **Responsável**: pessoa que responde pelo ativo (nullable — nem todo ativo tem).
- **Movimentação**: evento imutável que registra transferência de local, mudança de
  responsável, empréstimo/devolução, dano, arquivamento.

### 6.2 Estrutura recomendada (mínima que preserva integridade)

**Opção escolhida — evoluir `public.assets` + 2 tabelas novas** (sem entidade paralela):

```
public.assets (024, evoluir)
├── identificação: asset_tag (único por unidade quando presente), serial_number,
│   equipment_type, manufacturer, model, name, notes
├── unidade: workspace_id (FK, NOT NULL, CASCADE)
├── localização: location_id → patrimonio_locations(id)   [coluna 024 já existe; ganha FK]
├── responsável: responsible_profile_id → profiles(id) NULL   [novo]
├── estado: status (draft|active|maintenance|retired — 024) + condition (novo:
│   bom|regular|danificado|inservivel) + archived boolean (novo)
├── empréstimo: modeled por movimentação ativa (ver 6.3)
└── auditoria: app_audit_logs via trigger própria

public.patrimonio_locations (novo; opcional no MVP — ver pendência)
├── id, workspace_id FK, predio TEXT, andar TEXT, nome TEXT (sala/ambiente),
│   UNIQUE(workspace_id, predio, andar, nome) — ou unique por nome normalizado
└── RLS: select por unidade; escrita c/ user_has_action('patrimonio.asset.edit')

public.asset_movements (novo; imutável — sem UPDATE/DELETE policy)
├── id, workspace_id FK, asset_id FK → assets ON DELETE RESTRICT
├── type CHECK ('criacao','transferencia','responsavel','emprestimo','devolucao',
│   'danificado','manutencao','arquivamento','correcao')
├── from_location_id / to_location_id (NULLable), from_responsible_profile_id /
│   to_responsible_profile_id (NULLable)
├── note TEXT, performed_by → profiles, source ('ui'|'import'|'api'), import_batch_id NULL
└── created_at; índices (asset_id, created_at DESC), (workspace_id, created_at DESC)
```

**Alternativas avaliadas**: (a) tudo em `metadata JSONB` — rejeitada (impede busca/index);
(b) reutilizar `stock_movements` — rejeitada (`itemId` TEXT sem FK, sem responsável,
tipos de estoque); (c) tabela nova `patrimonio_assets` — rejeitada (duplicaria `public.assets`,
contra a issue).

### 6.3 Regras de integridade (constraints)

- `UNIQUE (workspace_id, asset_tag) WHERE asset_tag IS NOT NULL` (já em 024) — patrimônio
  único **por unidade** (o mesmo número pode existir em campi diferentes).
- **Ativos sem patrimônio**: `asset_tag NULL` é válido (o partial unique permite N nulos);
  identificação interna = `id UUID` (sempre existe). Exigir ao menos um de
  (`asset_tag`, `serial_number`, `name`) via `CHECK`+validação de app.
- **Série ausente/duplicada**: `serial_number` indexado **sem unique** (séries repetidas/
  vazias são reais); deduplicação é responsabilidade da importação (§8) e relatório.
- Status/condição via `CHECK` (valores pendentes de confirmação — §11).
- Movimentação é a única forma de mudar `location_id`/`responsible_profile_id`
  (enforcement por trigger ou convenção de app — **decisão pendente**); empréstimo ativo =
  último movimento `emprestimo` sem `devolucao` correspondente (mesma semântica de
  `getOverdueLoans`/`stock_movements`).
- Arquivamento: `archived = true` + movimento `arquivamento`; nada é apagado.

---

## 7. Importação do inventário inicial

### 7.1 O que existe e é reaproveitável

- `src/apps/stock/utils/import.ts`: `parseFile` (SheetJS, `XLSX.read`), `validateRows`
  (nº de colunas), `mapStockRow` (mapa PT-BR de cabeçalhos, com fallbacks).
- Preview real em produção: `StockSection.tsx:494-584` (tabela com 6 colunas × 5 linhas,
  contador de linhas, cancelar, confirmar).
- Deduplicação: `dedupeBySerial` (chave = serial trim/lowercase; sem serial → mantém).
- Escrita em lote: `createMany` (conta sucessos; recarrega).
- Backend: **não há endpoint de upload**; XLSX server-side só por URL com SSRF-guard
  (`_tv_parse_events_xlsx`, `_parse_spreadsheet`). Padrão de validação/limites (8 MB,
  5000 linhas, preview 100) reutilizável se um endpoint for criado.

### 7.2 Processo proposto (sem inventar colunas da planilha real)

1. **Upload client-side (SheetJS)** → parsing → **pré-visualização** completa com contagem
   (padrão StockSection, ampliado para paginação da prévia).
2. **Validação por linha**: obrigatórios (unidade = workspace ativo; `equipment_type`;
   ao menos um identificador); normalização de `asset_tag`/`serial_number`
   (trim, caixa, remoção de separadores — regra exata **pendente** com a TI); validação de
   `status`/`condition` contra enums; localização validada contra `patrimonio_locations`
   (ou texto livre no MVP).
3. **Duplicidade**: (a) dentro do arquivo — mesma chave (`asset_tag` normalizado ou
   `serial_number`) em 2 linhas → marca e exige decisão (mesclar/ignorar); (b) contra o
   banco — `UNIQUE(workspace_id, asset_tag)` + consulta de séries existentes → linha vira
   "atualização" (não cria 2º ativo).
4. **Associação à unidade**: sempre o workspace ativo do usuário; nunca coluna de unidade
   da planilha sem validação de membership.
5. **Responsável**: resolver por `institutionalEmail`/nome contra `profiles` da unidade;
   não resolvido → linha rejeitada ou importado sem responsável (**pendente**).
6. **Relatório**: aceitos / rejeitados (por motivo, com nº da linha) / atualizados;
   download do relatório (padrão `exportCSV`).
7. **Reprocessamento seguro**: importação idempotente por lote —
   `import_batch_id` (UUID) gravado no movimento de criação + chave natural
   (`workspace_id + asset_tag`); reimportar o mesmo arquivo atualiza/rejeita, nunca duplica.
8. **Origem**: todo movimento de criação por importação leva `source='import'`,
   `import_batch_id`, `performed_by` = importador; `assets.metadata.source_file` opcional.
9. **Escrita**: preferir um endpoint backend autenticado (`POST /api/patrimonio/import`)
   com service_role + validação server-side (a UI nunca é fronteira) — **decisão
   pendente** vs. escrita client-side via sync (padrão atual, mas sem validação
   centralizada).

**Não importar nada nesta etapa; não definir colunas sem a planilha real da TI.**

---

## 8. Integrações futuras (classificação)

| Integração | Classificação | Base real no código |
|---|---|---|
| Auditoria (`app_audit_logs`) | **Necessária no MVP** | tabela genérica 054 + padrão de trigger; SELECT por unidade pronto |
| RBAC/unidades | **Necessária no MVP** | `memberships`, `user_has_action`, `_require_action_in_handler` |
| Coordenador (visão por unidade) | Recomendada fase 2 | RPCs 047/065/070/071 + `CoordinatorAuditTab` (leitura) |
| Chamados (asset → atendimento) | Recomendada fase 2 | `Ticket.assetId + assetSource ('stock'|'pcare')`; extensão natural `'patrimonio'`; `getOpenByAsset/getHistoryByAsset` já filtram por fonte |
| Empréstimos | Recomendada fase 2 (tipos já previstos no modelo) | semântica `emprestimo/devolucao` de `stock_movements` + cron `/api/push/check-overdue` (`reservalab/api/app.py:1954`) |
| PC Care (dados técnicos) | Fase posterior | `pcare.assets` local-only; ligação por `metadata`/FK nova |
| Stock (materiais/peças) | Fase posterior / opcional | `linkedPcId` livre; manter separado |
| ReservaLab | **Desnecessária no momento** | só `tablet_reservations` (fixo 50); sem entidade de recurso genérico |

---

## 9. Plano de implementação (etapas)

- **Etapa A — Consolidação**: fechar §11 (enums, localização estruturada?, endpoint de
  importação?, matriz final). Saída: este documento revisado + ADR curto.
- **Etapa B — Modelo de dados**: 1 migration pequena: evolui `public.assets`
  (`responsible_profile_id`, `condition`, `archived`, FK `location_id`), cria
  `patrimonio_locations` (se aprovado) e `asset_movements`; policies RLS
  (`user_belongs_to_workspace` p/ leitura; `user_has_action('patrimonio.*')` p/ escrita;
  movimentação sem UPDATE/DELETE); grants (padrão 026: REVOKE anon, authenticated CRUD,
  service_role ALL); TRAVAS de seed de Actions; testes estáticos em `api/tests/`
  (padrão `test_0xx_*`). Dependência: Etapa A.
- **Etapa C — Serviços**: `patrimonioService` (local-first sync ou REST — conforme
  decisão); hooks `usePatrimonio`; `useCanAccessAction` nas ações novas; chave de cache
  namespaced (`<coleção>:<userId>`, padrão #344).
- **Etapa D — UI de listagem/cadastro/edição**: páginas novas (não dentro do Stock):
  busca por patrimônio/série/nome/responsável/local/status/condição; cadastro/edição com
  guards; estados loading/vazio/erro/retry (padrão `EmptyState`/`SkeletonCard`).
- **Etapa E — Movimentações/histórico**: formulário de movimento (transferir, trocar
  responsável, emprestar/devolver, danificar, arquivar) gravando em `asset_movements`;
  timeline por ativo; empréstimos atrasados (padrão `overdue.ts`).
- **Etapa F — Importação**: fluxo §7 + validação conjunta com a TI + reprocesso.
- **Etapa G — Integrações**: auditoria na UI do coordenador, chamados (`assetSource`),
  PC Care, empréstimos avançados.

**Dependências/riscos transversais**: risco de segunda entidade de ativo (mitigado:
evoluir `public.assets`); `pcare.assets` local-only (dados de PC não estão no banco);
`location_id` sem destino hoje (migração precisa criar a tabela antes do FK);
grants/RLS precisam seguir 026/033/085; nada disto vale sem verificar ambientes (§3.7).

---

## 10. Critérios de aceite do MVP

- [ ] Ativo tem `id` único e (opcionalmente) `asset_tag` único **por unidade**.
- [ ] Todo ativo pertence a exatamente 1 `workspace` (FK NOT NULL).
- [ ] Localização registrada (texto no MVP; estruturada se §11 aprovar) e visível na listagem.
- [ ] Responsável registrável e rastreável via `asset_movements`.
- [ ] Toda mudança de local/responsável/status gera 1 movimento imutável.
- [ ] Ativo danificado/arquivado permanece listável e com histórico (nada é apagado).
- [ ] Empréstimo tem ciclo completo (emprestimo → devolucao) e atraso detectável.
- [ ] RLS: usuário de uma unidade não lê/escreve ativo de outra (teste backend +
      verificação manual de policies).
- [ ] Escritas exigem `patrimonio.asset.*` (403 sem ação; teste com `_require_action_in_handler`).
- [ ] Alterações críticas aparecem em `app_audit_logs` (criação, movimentação, mudança de
      responsável, dano, arquivamento).
- [ ] Importação da planilha com pré-visualização, relatório aceitos/rejeitados e
      reimport sem duplicar.

---

## 11. Decisões pendentes (bloqueiam Etapa B)

1. **Evoluir `public.assets` ou criar tabela nova?** (Recomendação: evoluir; confirmar.)
2. **Localização estruturada no MVP** (`patrimonio_locations`) ou texto livre com
   migração futura? (024 já reservou `location_id`.)
3. **Enums oficiais**: valores de `status` (024 tem `draft|active|maintenance|retired`) e
   `condition`; nomes exatos das Actions (`patrimonio.loan.manage` vs
   `patrimonio.asset.loan`).
4. **Movimentação obriga passagem por `asset_movements`?** (trigger no banco vs. convenção
   de serviço.)
5. **Importação**: endpoint backend (service_role) ou escrita client-side? Regra exata de
   normalização de patrimônio/série; o que fazer com responsável não resolvido.
6. **Planilha real**: colunas confirmadas pela TI (não inventar).
7. **Papéis**: permissões de `vis`, `lider`, `coordinator` (matriz §5.3).
8. **PC Care**: como vincular `pcare.assets` (local-only) ao ativo mestre; migrar dados?
9. **Ambientes**: confirmar que 024/033/049/082/085/086 estão aplicados em DEV/PROD antes
   de qualquer migration nova (§3.7).

---

## 12. Recomendação final — sequência de PRs pequenas

| # | PR | Escopo fechado | Critérios de aceite |
|---|---|---|---|
| 1 | `refactor(stock): simplifica navegação — remove Pipeline, Kits e QR da UI` | §13.1: `stock/index.tsx`, `StockBottomNav`, `StockLayout` (ROUTE_ORDER/STOCK_TABS/títulos), `StockDashboard` (cards), `pcare/pages/QRGenerator` (redirect), testes (`appNavSweep`, `StockBottomNav`, `pcare QRGenerator`) | Rotas 404-free (redirecionam p/ `/stock/items`), sem referências a `/stock/{pipeline,kits,qr}` na UI; suíte verde; **nenhuma mudança de banco/sync/RBAC** |
| 2 | `perf(stock): sync sob demanda e swipe discreto` | §13.2/§13.3: dedupe/guarda de `useOnlineSync`, alvo de swipe restrito, transição reduzida, `prefers-reduced-motion` | Uma instância de sync por página; nenhum `select('*')` sem necessidade; gestos não disparam navegação dentro de scrollers horizontais; testes de hook + lint |
| 3 | `feat(patrimonio): modelo de dados + RLS + Actions` (Etapa B) | migration única + testes estáticos `api/tests` | Testes estáticos verdes; TRAVAS; RLS por unidade; sem tocar em dados |
| 4 | `feat(patrimonio): serviços e permissões` (Etapa C) | serviço + hooks + guards | leitura/escrita respeitam Actions; isolamento por unidade testado |
| 5 | `feat(patrimonio): UI de inventário` (Etapa D) | páginas novas fora do Stock | critérios §10 (identificação, unidade, busca) |
| 6 | `feat(patrimonio): movimentações e histórico` (Etapa E) | movimentos + timeline + empréstimos | critérios §10 (movimentações, dano, ciclo de empréstimo) |
| 7 | `feat(patrimonio): importação inicial` (Etapa F) | fluxo §7 | critérios §10 (importação) |
| 8 | `feat(patrimonio): integrações e auditoria na UI` (Etapa G) | chamados/coordenador/PC Care | histórico em `app_audit_logs` visível |

**Primeira PR recomendada: #1** — totalmente front-end, sem risco de dados, destrava a
interface limpa para o inventário e reduz a superfície de testes das PRs seguintes.

---

## 13. Complemento — simplificação do Stock, carregamento e swipe

### 13.1 Remoção de Pipeline, Kits e QR (UI-only)

**Evidências de acoplamento (tudo que precisa mudar):**

| Seção | Referências encontradas |
|---|---|
| Pipeline | rota `stock/index.tsx:15,33`; nav `StockBottomNav.tsx:28`; `StockLayout.tsx:70` (ROUTE_ORDER); página usa `stockService`+`pcService`+`activateItemAsPC`+`useCanAccessAction('stock.item.edit')` (`Pipeline.tsx:1-9,131-133,191-197`); listener `storage` próprio (`:125-129`) |
| Kits | rotas `index.tsx:7-8,26-27`; nav `StockBottomNav.tsx:3-4,11,14,27,40` (`useBadges` carrega kits p/ badge); `StockLayout.tsx:21,48,55,69,151`; card no Dashboard (`StockDashboard.tsx:52,60,260-274`); `KitCard/KitChecklist`, `useKits`, `kitService`, `types/kit.ts`, testes |
| QR | rotas `index.tsx:11-12,20,30`; nav `StockBottomNav.tsx:30`; `StockLayout.tsx:72`; card "Scan" (`StockDashboard.tsx:302-310`); **dependência cruzada**: `pcare/index.tsx:49` monta `QRGenerator` que redireciona p/ `/stock/qr` (`pcare/pages/QRGenerator.tsx:14,77`); libs `qrcode`, `jszip`, `file-saver`, `@zxing/browser` (também usadas pelo PC Care) |
| Testes | `appNavSweep.test.tsx:202-211` (espera `/stock/kits`, `/stock/qr`, `/stock/pipeline`), `StockBottomNav.test.tsx:71`, `pcare/__tests__/QRGenerator.test.tsx:50-61` |

**UI-removível sem tocar em dados:** rotas, entradas de nav, cards do Dashboard, badges de
kits, títulos (`getPageTitle`),`STOCK_TABS`/`ROUTE_ORDER`. **Manter** (compartilhados):
`activateItemAsPC` (usado também por `StockDetail.tsx:15,56`), `pcService` (usado por
`StockForm`/`StockDetail`), utilitários de QR se o PC Care continuar com scanner.

**Não exige excluir nada do banco:** tabelas `stock.stock_kits`, actions
`stock.kit.audit`, coleções em `sync.ts` e dados existentes permanecem (regra da etapa:
não excluir dados/estruturas). Recomendação: remover das rotas/nav e **manter** páginas/
serviços/arquivos mortos por 1 release (ou remover arquivos mas manter sync) — a
diferença é só de escopo de PR, decidível na PR #1.

### 13.2 Carregamento do inventário — o que realmente acontece

**Fatos (com trechos):**

1. **As telas não consultam o Supabase diretamente.** Todos os hooks (`useStock.ts:9-14`,
   `useKits.ts:9-14`, `useMovements.ts:9-14`, `useInventory.ts`, `useStockMaintenance.ts`)
   chamam `service.getAll()` — leitura **síncrona do cache local** (IndexedDB via
   `createLocalService`). Navegar entre abas não gera rede. Não há loop de requisições,
   realtime subscription, prefetch ou invalidação além do dirty-set. Não foi encontrado
   estado de loading que não termina (o `loading` é síncrono; erros de rede só aparecem
   como `syncError` do `useOnlineSync`; vazio tem `EmptyState`).
2. **O custo de rede está no sync, não nas seções.** Ao abrir **qualquer** rota do Stock,
   `StockLayout.tsx:106` monta `useOnlineSync`, que dispara `syncAll()` no mount
   (`useOnlineSync.ts:38-40`) e **a cada 30s** (`:58-61`). `syncAll` (`sync.ts:254-290`)
   percorre **todas** as 23 coleções (7 local-only + 16 remotas) e faz `select('*')`
   **sem filtro, sem paginação** em cada tabela remota (`syncCollection`,
   `sync.ts:205`), incluindo todas as de pcare e todo o estoque — **independente da aba
   aberta**. Ou seja: sim, o "inventário" puxa tudo do Supabase mesmo na aba Dashboard,
   mas por causa do sync global, não de consultas por seção.
3. **Múltiplas instâncias do sync.** `useOnlineSync()` é montado em `HomeView.tsx:54`,
   `Launcher.tsx:48`, `StockLayout.tsx:106`, `pcare/RootLayout.tsx:325` e
   `ChamadosLayout.tsx:56` — e componentes pcare (`SyncStatusBadge`, `OnlineBanner`,
   `useSyncToasts`) também o chamam. Cada instância tem estado próprio: o guarda
   `if (syncing) return` (`useOnlineSync.ts:18-19`) **não** impede duas instâncias
   sincronizando em paralelo, e cada uma mantém seu `setInterval` de 30s.
4. **Polling existente**: 30s (`useOnlineSync`); 10 min (`useExpiryAlerts.ts:4,10` —
   leitura local + cria notificações, idempotente); `useFastSync` (10s por coleção)
   existe como padrão para módulos prioritários. **Server-side independente do
   navegador**: cron de empréstimos atrasados `GET /api/push/check-overdue`
   (`src/apps/reservalab/api/app.py:1954`) e pipeline de push — o carregamento do
   inventário em si é 100% navegador + Supabase.

**Como reproduzir:** abrir `/stock` com DevTools → Network (filtro `rest/v1`) → observa-se
o burst de `select=*` em `stock_*`, `pcare.*`, `workspaces`, `assets` no mount e a cada
30s; navegar entre abas não gera novas requisições.

**Impacto:** com um inventário patrimonial grande (milhares de ativos), o `select('*')`
sem paginação em 30s/instância será o gargalo (payload, memória, merges O(n²) no
`findIndex` de `sync.ts:234`), e múltiplas instâncias multiplicam o custo.

### 13.3 Correção recomendada (carregamento)

1. **Sync sob demanda**: montar o sync global uma única vez (no launcher/app root) e no
   Stock sincronizar **apenas as coleções da seção visitada** — o padrão já existe:
   `useFastSync(['stock_items'], intervalMs)` → `syncSingle` (`sync.ts:183-195`). Entrar
   em "Inventário" sincroniza `inventory_cycles`/`inventory_counts`; sair, para.
2. **Paginação/limite**: `syncCollection` passa a usar `select('*').limit(N)` com cursor
   por `updatedAt` (ou RPC de delta) — primeiro passo simples: `limit` configurável +
   indicador de "parcial".
3. **Cache controlado**: manter dirty-set/tombstones (já corretos); puxar remoto só (a)
   no primeiro acesso à coleção na sessão, (b) em pull-to-refresh (já existe
   `PullToRefresh` nas páginas), (c) no evento `online`. Sem interval global de 30s para
   coleções não abertas.
4. **Estados**: padronizar loading (skeleton), vazio (`EmptyState`), erro com retry
   (hoje o erro de sync vira `console.warn` + `failed[]` em `sync.ts:282-286`; expor na
   UI como os chamados fazem).
5. **Preservar**: RBAC (`useCanAccessAction`), isolamento por unidade
   (`workspaceStore`/estampa no create), `getAllUnfiltered` apenas no fluxo público de
   chamados.

**Testes necessários**: unidade do novo agendador de sync (uma instância; coleções por
rota); teste de `syncCollection` com `limit`/delta; teste de UI "aba X não dispara sync
de coleção Y"; regressão dos 24 testes do Stock; verificação manual com Network.

### 13.4 Redução do swipe

**Causas do deslocamento exagerado (evidências):**

1. `StockLayout.tsx:176-180` registra `onTouchStart/onTouchEnd` **no container inteiro**;
   `handleSwipeEnd` (`:159-173`) navega para a aba vizinha quando `|dx| ≥ 60`,
   `|dx| ≥ 1.5·|dy|` e `dt ≤ 350ms`. Só ignora páginas de detalhe (`:160`).
2. Conflito com scrollers horizontais das páginas: `SectionTabs.tsx:54` (abas com
   `overflow-x-auto`), mini-stats de `StockSection.tsx:416`, e as colunas do Pipeline
   (`Pipeline.tsx:218`, scroll-snap horizontal) — um swipe para rolar essas listas
   **também** troca de aba (o gesto sobe até o container).
3. `useSwipeBack` (`pcare/hooks/useSwipeBack.ts:11-29`) atua no `document` inteiro
   (início com `clientX ≤ 30`; `dx > 80 && dy < 50` → `navigate(-1)`), somando-se ao
   gesto de abas nas listas.
4. `StockPageTransition` (`StockLayout.tsx:28-41`) anima `x: ±36px` com blur em **toda**
   troca de rota via `AnimatePresence mode="wait"` — amplifica a sensação de movimento
   (especialmente quando o gesto e a animação se combinam).

**Proposta discreta (sem perder mobile/a11y):**

- **Remover a troca de abas por swipe horizontal** (manter apenas o edge-back do
  `useSwipeBack`, com threshold ≥ 100px) — as abas já são tocáveis
  (`LiquidBottomNav` + `SectionTabs`); swipe aqui é redundante e é a fonte do conflito.
  Alternativa conservadora: manter o gesto só quando o alvo do toque **não** estiver
  dentro de um `overflow-x-auto` (checar `e.target.closest('[data-hscroll]')`) e elevar
  limiares (dx ≥ 100, dt ≤ 300, dominância 2×).
- **Transição mais discreta**: `x: ±12px`, sem blur, `duration 0.16`, e respeitar
  `prefers-reduced-motion` (`useReducedMotion` do framer-motion) — desativa a animação
  para quem pede menos movimento (acessibilidade).
- **A11y**: nenhuma funcionalidade depende exclusivamente de gesto (botões equivalentes
  continuam existindo); garantir `aria-label` do back e foco previsível após navegação.

**Testes**: componente que simula `touchstart/touchend` dentro de um scroller horizontal
(não navega) e fora (navega, se mantido); snapshot/behaviour da transição com
`prefers-reduced-motion`; regressão de `useSwipeBack.test.ts`.

### 13.5 Ordem sugerida (complemento)

1. PR #1 (§13.1 — simplificação UI) → 2. PR #2 (§13.2/13.3 sync sob demanda) →
3. PR #2b (§13.4 swipe/transição) → 4. PRs de patrimônio (§12 #3+). A simplificação
   primeiro reduz o número de telas afetadas pela mudança de sync.

---

*Relatório gerado por auditoria estática do repositório. Nenhuma verificação de ambiente
(DEV/PROD) foi realizada.*
