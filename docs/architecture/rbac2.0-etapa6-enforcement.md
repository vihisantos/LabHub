# LabHub — RBAC 2.0 · ETAPA 6: Enforcement definitivo · Chamados + Push

> Documento da **ETAPA 6**: materialização do enforcement RBAC 2.0 onde a Action do catálogo é
> **literal** e semanticamente comprovável — Chamados por operação, eventos, weekly-email e push.
> Regras de Rab: nenhuma ambiguidade é "resolvida no feeling"; só se aplica Action **literal** do
> catálogo (`docs/architecture/rbac2.0-actions-catalog.md`); o que não é determinável vira
> `NEEDS_DECISION`; **nunca** permission-by-accident; não se remove gatos legados; flag OFF
> preserva 100% do comportamento legado.

---

## 1. Fonte de verdade e limites desta etapa

- **Catálogo de Actions:** `docs/architecture/rbac2.0-actions-catalog.md` — única fonte.
  Nenhuma Action foi criada, renomeada ou inventada.
- **Engine:** `src/apps/reservalab/api/rbac.py` — coage; nunca define roles/actions.
- **Flag:** `RBAC_2_ENABLED` permanece **OFF por padrão** (default `'0'`). Com flag OFF os pontos
  de enforcement desta etapa são **no-op** (caminho legado preservado) — rollout por chave única.
- **Backend é a fronteira de segurança** — nenhuma decisão de autorização depende do frontend.

---

## 2. FASE 6A — Chamados `<id>` por operação (in-handler enforcement)

### 2.1 Por que in-handler e não decorator

O workspace de um chamado **só é conhecido dentro do handler** (resolve-se pelo ticket; o cliente
não envia `workspace_id`). A rota não tem `@require_workspace`. Portanto o enforcement é feito
**dentro do handler**, após resolver o workspace real do recurso:

1. Fetch do ticket → `ticket_ws = rows[0].workspace_id` (workspace **do recurso**, nunca do cliente).
2. Ownership legada (super admin OU `ticket_ws ∈ user_workspace_ids`).
3. `g.workspace_id = ticket_ws` (escopo do recurso).
4. `_require_action_in_handler(action, scope='workspace', resource_type='ticket', resource_id=ticket_id)`.

Helper adicionado em `api/app.py` (pós bloco rate-limit), **`_require_action_in_handler`**:

- Respeita `RBAC_2_ENABLED` (OFF ⇒ `None`, no-op → legado preservado).
- Fail-closed; `scope='global'` ⇒ `workspace_id=None`.
- Chama `rbac_two_can(user, workspace_id, action, scope)` (**nome vinculado no módulo root**).
- Grava auditoria via `rbac_record_audit` (effect/outcome), **jamais** converte erro→allow.
- Retorna `_forbidden('Permissão insuficiente')` (403 seguro) em negação/exceção.
- Mensagem 403 fixa **"Permissão insuficiente"** — não expõe role/membership/SQL/secrets.

### 2.2 Mapa de Actions por operação (catalógico, literal)

| Rota (método) | Campos/operação | Action (catálogo) | Scope |
|---|---|---|---|
| `GET /api/chamados/<id>` | leitura do ticket | `ticket.view` | workspace |
| `DELETE /api/chamados/<id>` | remoção | `ticket.delete` | workspace |
| `PATCH /api/chamados/<id>` (status/statusNote) | mudança de status | `ticket.status` | workspace |
| `PATCH /api/chamados/<id>` (assignedTo/assignedToUserId) | responsável | `ticket.assign` | workspace |
| `PATCH /api/chamados/<id>` (problemDescription/priority/archived/closedAt/closedBy/photos) | edição | `ticket.edit` | workspace |

### 2.3 PATCH misto é **atômico** (6A.3) — exige TODAS as Actions

Corpo de PATCH pode mudar mais de um campo. `required_actions` é o **conjunto** de Actions
mapeadas pelos campos presentes; o handler exige **TODAS** antes de qualquer mutação:

- `status`/`statusNote` → `ticket.status`
- `assignedTo`/`assignedToUserId` → `ticket.assign`
- `problemDescription`/`priority`/`archived`/`closedAt`/`closedBy`/`photos` → `ticket.edit`

Qualquer negação ⇒ **403 e nenhuma mutação** (authorize-before-mutate; testado com captura de
ausência de `PATCH /rest/v1/chamados_tickets`).

### 2.4 DELETE protege antes de side-effect

A checagem `ticket.delete` ocorre **antes** de qualquer side effect (remoção no Supabase /
destruição de fotos no Cloudinary). Negada ⇒ 403 sem nenhuma deleção.

---

## 3. FASE 6B — Eventos do chamado

| Rota | Ação | Scope | Ref |
|---|---|---|---|
| `GET /api/chamados/<id>/events` | `ticket.view` | workspace | `api/app.py:2954` |
| `POST /api/chamados/<id>/events` | `ticket.comment` | workspace | `api/app.py:3002` |

Ambas aplicam o enforcement in-handler **após** o fetch do ticket (workspace do recurso) e **antes**
de criar o evento. O POST com `ticket.comment` negado não cria evento (testado via ausência de
`POST /rest/v1/ticket_events`).

---

## 4. FASE 6C — `POST /api/chamados/reports/weekly-email`

`api/app.py:3190` — adicionado `@require_action_rbac('ticket.weeklyEmail', scope='global')`
(rotas já tinham `@require_auth @require_admin`).

> **Nota explícita sobre o escopo (regra Rab — não redefinir catálogo):**
> o catálogo declara `ticket.weeklyEmail` com `scope=workspace`; porém a rota atual é
> **super-admin-only** (gate legado). Aplicamos `scope='global'` **unicamente para reproduzir
> fielmente o gate legado de super-admin** — **não** redefinimos o catálogo (documentado aqui,
> não na fonte de verdade). Com flag OFF o `require_action` é no-op e o gate legado
> `require_admin` governa invariável. A decisão de migrar para `scope=workspace` (semanal
> multi-workspace por admin de workspace) fica em `NEEDS_DECISION` (§8).

---

## 5. FASE 6D — `POST /api/push/send` (`reservelab.push.manage`)

`src/apps/reservalab/api/app.py` — adicionado `@require_action_rbac('reservelab.push.manage',
scope='global')` (rotas já tinham `@require_auth @require_admin`), após o bloco de import do auth.

- **Action literal no catálogo:** `reservelab.push.manage` — comprovada; é a Action de gerência
  de push.
- **Escopo global** por ser broadcast (não vinculado a um workspace único) e consistente com o
  gate legado super-admin-only de `require_admin`.
- **Coexistência de gates (6D):** `require_auth → require_admin → require_action`.
  - Flag **OFF**: `require_action` é no-op ⇒ coage só `require_admin` (super admin). **Sem regressão.**
  - Flag **ON**: `require_action` global ⇒ só super admin (via bypass) — consistente.

---

## 6. FASE 6E — Resumo final de todas as rotas Chamados/Push

| Rota | Resultado | Action/Scope | Evidência |
|---|---|---|---|
| `GET /api/chamados/<id>` | **Protegida** | `ticket.view` / workspace | in-handler |
| `DELETE /api/chamados/<id>` | **Protegida** | `ticket.delete` / workspace | in-handler |
| `PATCH /api/chamados/<id>` | **Protegida** (atômica, multi-Action) | `ticket.status`+`ticket.assign`+`ticket.edit` / workspace | in-handler |
| `GET /api/chamados/<id>/events` | **Protegida** | `ticket.view` / workspace | in-handler |
| `POST /api/chamados/<id>/events` | **Protegida** | `ticket.comment` / workspace | in-handler |
| `POST /api/chamados/reports/weekly-email` | **Protegida** | `ticket.weeklyEmail` / **global*** | decorator |
| `POST /api/push/send` | **Protegida** | `reservelab.push.manage` / **global** | decorator |
| `GET /api/chamados` | `NEEDS_DECISION` | multi-workspace | — |
| `GET /api/chamados/reports` | `NEEDS_DECISION` | multi-workspace | — |
| `POST /api/public/chamados/<token>/feedback` | **PUBLIC/DESIGN EXCEPTION** | identity por token, sem RBAC | — |
| `/api/push/test`, `/api/push/action`, `/api/push/notify-loan|return`, `/api/chamados/push/test` | `NEEDS_DECISION` | sem Action literal de self-test / ramo misto | — |

\* `ticket.weeklyEmail` com scope global **reproduz** o gate legado super-admin (ver §4); não
redefine o catálogo.

### 6.1 Drift `admin → technician` vs `Admin de Workspace` (confirmado, NÃO corrigido)

Pesquisa de subagente confirmou a divergência já registrada na Etapa 4 (§5.1) e no catálogo (linha 532):

| Camada | `admin` mapeia para |
|---|---|
| Frontend `src/core/permissions/types.ts:71-82` `LEGACY_ROLE_TO_ID` | `role-technician` (stale) |
| Migration 036 + `_require_workspace_app_manager` (`api/app.py:2700`) | Workspace Admin (`adm`) |

`_require_workspace_app_manager` já ramifica: RBAC ON → membership-based `admin.app.purge`; OFF →
legado `profile.role=='admin'`. **Nenhuma correção automática agora** (flag OFF); registrado como
`NEEDS_DECISION` (Etapa 4 §5.1 + catálogo). Corrigir exigiria decisão documentada de qual camada é
a fonte de verdade da UI.

---

## 7. FASE 6F — Auditoria e segurança

- In-handler grava `rbac_audit_logs` com `effect=allow|deny` e `outcome=success|denied` (check
  constraint 036) **após** decidir; falha de escrita é engolida/logada — **nunca** vira allow.
- Fail-closed: sem workspace derivado ⇒ sem checkout; exceção ⇒ 403 "Permissão insuficiente".
- Workspace é **sempre derivado do recurso** (ticket), nunca do corpo/query do cliente
  (testado: enviar `?workspace_id=` diferente não altera o workspace passado ao `rbac_can`).
- Mensagens 403 seguras; nenhum secret/role/membership nos meta/erros.

---

## 8. `NEEDS_DECISION` consolidados (abertos; NÃO resolvidos no feeling)

1. **`GET /api/chamados` + `GET /api/chamados/reports`** — multi-workspace do user; sem workspace
   único p/ `rbac_can(scope='workspace')`. Design de aplicação pendente.
2. **`ticket.weeklyEmail` em `scope=global`** — reproduz super-admin legado; migrar p/ workspace
   (semanal por admin de workspace) exige decisão.
3. **`/api/push/send` identidade/workspace** considerando `admin.notification.send` como
   alternativa; escolhido `reservelab.push.manage` (literal, gerência de push) — confirmar.
4. **`/api/push/test` e `/api/chamados/push/test`** — sem Action literal de "teste de push".
5. **`/api/push/action`** — handler misto approve/reject → aplicar Action por ramo
   (`admin.user.approve`/`admin.user.reject`).
6. **`/api/push/notify-loan|return`** — catalog §4.3 nota "dead in prod"; só gate de módulo legado.
7. **Drift `admin` → technician (frontend) vs `adm` (backend/036)** — qual camada é a fonte de
   verdade da UI (ver §6.1).

> Regra aplicada: nada acima foi resolvido; sem Action literal + contexto limpo ⇒ `NEEDS_DECISION`
> e **não** se adicionou decorator/checagem arbitrária (evita permission-by-accident).

---

## 9. FASE 6G — Testes

`api/tests/test_rbac_etapa6.py` (23 testes) — cobertura Etapa 6 (OFF e ON):

- **GET/DELETE/PATCH `<id>`:** allow + deny por operação (`ticket.view/delete/status/assign/edit`);
  OFF preserva legado (200 e `rbac_can` não chamado).
- **PATCH misto:** exige TODAS as Actions; uma negada ⇒ 403 **sem mutação** (atomicidade).
- **Events GET/POST:** `ticket.view`/`ticket.comment`; POST negado não cria evento.
- **Workspace derivado do recurso:** cliente não pode sobrescrever (`?workspace_id=` ignorado);
  captura o `workspace_id` passado ao `rbac_can` = workspace do ticket.
- **Weekly-email:** `ticket.weeklyEmail` scope global; super+ON permissão → 200;
  super com Action negada (mock) → 403 "Permissão insuficiente".
- **Push/send:** `reservelab.push.manage` scope global (captura args); OFF+non-super → 403
  "Super admin access required" (gate legado) e `rbac_can` não chamado; ON+Action permitida → não-403.
- **Auditoria/segurança:** falha de escrita de audit **não** converte deny→allow (mantém 403).

Testes patcham os dois caminhos: decorator (`sys.modules['rbac'].rbac_can`) e in-handler
(`sys.modules['root_api'].rbac_two_can`).

Rodando a suíte completa (`pytest tests/ -q`): **494 passed** (471 da Etapa 5 + 23 novos).
`py_compile` OK para `api/app.py`, `src/apps/reservalab/api/app.py`, `src/apps/reservalab/api/rbac.py`.

---

## 10. Arquivos modificados nesta etapa

| Arquivo | Mudança | Porquê |
|---|---|---|
| `api/app.py` | import root rbac + `rbac_record_audit` (linha ~26) | habilitar auditoria in-handler |
| `api/app.py` | helper `_require_action_in_handler` (linha ~58) | enforcement in-handler (6D) seguro |
| `api/app.py` | GET `<id>` → `ticket.view` | Etapa 6A |
| `api/app.py` | DELETE `<id>` → `ticket.delete` (pré side-effect) | Etapa 6A |
| `api/app.py` | PATCH `<id>` → conjunto `ticket.status/assign/edit` (atômico) | Etapa 6A.3 |
| `api/app.py` | GET/POST `<id>/events` → `ticket.view`/`ticket.comment` | Etapa 6B |
| `api/app.py` | weekly-email → `@require_action_rbac('ticket.weeklyEmail', scope='global')` | Etapa 6C |
| `src/apps/reservalab/api/app.py` | push/send → `@require_action_rbac('reservelab.push.manage', scope='global')` | Etapa 6D |
| `api/tests/test_rbac_etapa6.py` | **novo** — 23 testes | Etapa 6G |
| `docs/architecture/rbac2.0-etapa6-enforcement.md` | **novo** — este documento | Etapa 6H |

---

## 11. O que NÃO foi mudado (auditabilidade/reversibilidade)

- Nenhuma Action criada/renomeada no catálogo.
- Nenhuma migration reescrita.
- Nenhum gate legado removido (`require_auth`/`require_admin` mantidos em todas as rotas).
- Nenhuma checagem adicionada a rotas `NEEDS_DECISION`/públicas/cron.
- `auth.py` **não** modificado.
- Nenhuma mudança no frontend; nenhuma correção automática do drift 6.1.

> **Reversível:** flag `RBAC_2_ENABLED=OFF` ⇒ todo o enforcement desta etapa vira no-op e o
> legado governa por completo. Nada aqui altera o comportamento com flag OFF (total de 494 testes
> verdes, incluindo os legados).
