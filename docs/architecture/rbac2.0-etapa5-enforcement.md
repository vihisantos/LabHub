# LabHub — RBAC 2.0 · ETAPA 5: Enforcement (Rotas) + Rollout Controlado

> Documento da **ETAPA 5** (aplicação do controle RBAC 2.0 no backend + rollout controlado).
> Alinhado às regras de Rab: nenhuma ambiguidade é "resolvida no feeling"; rotas só são
> protegidas com Actions **literais** comprovadas no catálogo
> (`docs/architecture/rbac2.0-actions-catalog.md`); o que não é determinável é registrado como
> `NEEDS_DECISION`; e **nunca** se cria permission-by-accident.

---

## 1. Fonte de verdade e limites desta etapa

- **Catálogo de Actions:** `docs/architecture/rbac2.0-actions-catalog.md` — única fonte.
  Nenhuma Action foi criada, renomeada ou inventada nesta etapa.
- **Engine:** `src/apps/reservalab/api/rbac.py` — apenas **coage**; nunca define roles/actions.
- **Flag:** `RBAC_2_ENABLED` permanece **OFF por padrão** (default `'0'`). Com flag OFF, o
  decorator `require_action` é **no-op** (caminho legado preservado) — rollout por chave única.
- **Backend é a fronteira de segurança.** Nenhuma decisão de autorização depende do frontend.

---

## 2. FASE 5A — Correção de integração engine × schema 036 (aplicada)

O engine resolvia corretamente contra o schema 036 **somente após a correção** de dois pontos:

### 2.1 `select` de `role_permissions` (corrigido)

- **Antes:** `_fetch_role_permissions` consultava `select='action,effect'`.
- **Realidade (migration 036):** `role_permissions` **NÃO tem coluna `effect`** — as linhas
  são grants por `(role_id, action, scope)`. A coluna `effect` existe apenas em
  `membership_overrides`.
- **Impacto do bug:** com `select='action,effect'`, o Supabase responderia **400** ⇒
  `_fetch_role_permissions` retornava `set()` ⇒ **deny-everything para não-super admin**
  (falha silenciosa que tornaria o RBAC inutilizável quando ativado).
- **Depois:** `select='action,scope'`, filtrando as linhas por **scope exato**.
  Deny-by-default preservado em qualquer erro.

### 2.2 Filtro de scope + normalização (corrigido)

- `rbac_can` normaliza `scope` (`strip` + default `'workspace'`) e o repassa a
  `_fetch_role_permissions`.
- `scope='global'` ⇒ `False` para não-super (deny-by-default; só super admin via bypass).
- `scope='workspace'` e `scope='self'` ⇒ ambos exigem `workspace_id` + membership ativa
  (fail-closed sem workspace).
- O filtro de scope é **exato**: um grant `scope='global'` **não** satisfaz uma checagem
  `workspace` (e vice-versa) — evita permission-by-accident.

### 2.3 Confirmações (já corretas, não alteradas)

- `_fetch_overrides` usa `select='action,effect'` (a tabela TEM `effect`) — correto.
- `_fetch_membership` usa `select='id,role_id,status'` e valida `status='active'` — correto.
- Audit escreve `effect` (`allow|deny` = decisão) e `outcome` (`success|denied` = resultado),
  em conformidade com o CHECK constraint de `rbac_audit_logs`.
- **Audit nunca altera decisão:** é side-channel; falha de escrita NUNCA converte DENY→ALLOW.

---

## 3. FASE 5B — Inventário de rotas (A / B / C)

### Legenda
- **A = protegidas agora** (já possuem `@require_action` com Action literal do catálogo).
- **B = públicas/cron/device por design** (sem user autenticado; não recebem RBAC).
- **C = `NEEDS_DECISION`** (ambiguidade; não podem ser protegidas sem decisão documentada).

### 3.1 A — protegidas (Action literal + deck de decorators correto)

| Rota | Action | Scope | Deck de decorators |
|---|---|---|---|
| `POST /api/tv/cloudinary/delete` (`api/app.py:943`) | `tv.content.manage` | workspace | `require_auth → require_workspace → require_module_auth('tv') → require_action` |
| `POST /api/admin/wipe` (`api/app.py:2633`) | `admin.system.wipe` | global | `require_auth → require_admin → require_action` |
| `GET /api/admin/app-data/describe` (`api/app.py:2759`) | `admin.app.purge` | workspace | `require_auth → require_workspace → require_module_auth('tv') → require_action` |
| `POST /api/admin/app-data/purge` (`api/app.py:2800`) | `admin.app.purge` | workspace | idem |
| `POST /api/admin/backups/prune` (`api/app.py:3287`) | `admin.backup.delete` | global | `require_auth → require_action` + `_require_super_admin()` in-handler |
| `POST /api/admin/backups/<id>/restore` (`api/app.py:3312`) | `admin.backup.restore` | global | idem |
| `DELETE /api/admin/backups/<id>` (`api/app.py:3390`) | `admin.backup.delete` | global | idem |
| `GET /api/admin/audit-logs` (`api/app.py:3416`) | `admin.audit.view` | global | idem |
| `POST /api/admin/workspaces/<id>/delete` (`api/app.py:3441`) | `admin.workspace.delete` | global | idem |

> Todas as Actions acima **existem como literais no catálogo** e foram semeadas na 036.
> As rotas globais mantêm `_require_super_admin()` legado (FASE 5D): com flag OFF quem coage é
> o gate legado; com flag ON o `require_action` global também exige super admin (via bypass) —
> **zero regressão em ambos os modos**.

### 3.2 B — públicas / cron / device (sem RBAC; legado preservado)

| Rota | Tipo | Razão |
|---|---|---|
| `GET /api/chamados/workspaces` (`api/app.py:1793`) | público | lista de campi para o formulário público do professor |
| `POST /api/chamados` (`api/app.py:1813`) | público | criação via formulário público (sem login) + rate-limit |
| `GET/POST /api/public/chamados/<token>*` (`api/app.py:2441+`) | público | acesso do professor via tracking token (hash SHA-256, scope limitado) |
| `GET /api/reservas` (`reservalab/app.py:406`) | público | exibição pública de reservas (telão) |
| `GET /api/health` (`reservalab/app.py:460`) | público | healthcheck |
| `/api/push/check*` (`reservalab/app.py:746,1018,1104,1303`) | cron | protegidas por `require_cron` (CRON_SECRET) |
| `/api/push/subscribe` (`reservalab/app.py:498`) | device | registro de subscription (Sem roadmap de identidade; sem user autenticado) |

> Estes fluxos **não têm user autenticado**, logo RBAC (que precisa de membership) não se
> aplica. O isolamento é por RLS/scope de token/cron secret — **não é fronteira de segurança
> relaxada**, e sim fluxo intencionalmente sem sessão.

### 3.3 C — `NEEDS_DECISION` (não protegidas; ver §4)

| Rota | Motivo |
|---|---|
| `GET /api/chamados` (`api/app.py:1961`) | lista abrange **múltiplos workspaces** do user (sem workspace único) |
| `GET/PATCH/DELETE /api/chamados/<id>` (`api/app.py:2005`) | operações **mistas** (edit/status/assign/close/reopen/delete) + workspace resolvido **dentro do handler** |
| `GET /api/chamados/reports` (`api/app.py:2354`) | múltiplos workspaces por user |
| `POST /api/chamados/<id>/events`, `<id>/feedback`, etc. | workspace resolvido in-handler (fluxo evento/feedback) |
| `POST /api/chamados/push/test` (`api/app.py:2563`) | sem Action literal de teste de push |
| `GET /api/admin/backups` (`api/app.py:3260`) | sem Action literal de "listar backups"; já gated por `_require_super_admin()` |
| `/api/push/test` (`reservalab/app.py:598`) | sem Action literal de teste de push |
| `/api/push/send` (`reservalab/app.py:616`) | Action existente (`reservelab.push.manage`/`admin.notification.send`) mas decisão de identidade/workspace em aberto; já `require_admin` |
| `/api/push/action` (`reservalab/app.py:692`) | handler **misto** approve/reject (`admin.user.approve`/`admin.user.reject`) |
| `/api/push/notify-loan|return` (`reservalab/app.py:903,938`) | catalog §4.3 nota "dead in prod"; só gate de módulo legado |

---

## 4. `NEEDS_DECISION` consolidados (abertos; NÃO resolvidos no feeling)

1. **Chamados `<id>` (PATCH/DELETE) e eventos** — operação mista com workspace resolvido dentro
   do handler e **sem `@require_workspace`** (o frontend não envia `workspace_id`; ele deriva do
   ticket). Aplicar `@require_action` exigiria **refatoração estrutural** (resolver workspace
   antes de autorizar por operação) — fora do escopo "mínimo/auditável/reversível" desta etapa.
   As Actions (`ticket.edit/status/assign/close/reopen/delete/comment`) **existem** no catálogo;
   a pendência é de **aplicação**, não de modelagem.
2. **`/api/chamados` GET e `/reports`** — escopo abrange múltiplos workspaces do user (não há
   workspace único para `require_action(scope='workspace')`). Decisão de design necessária.
3. **`/api/push/send`** — pode usar `reservelab.push.manage` ou `admin.notification.send`
   (ambos literais). Decisão de aplicação/identidade em aberto; hoje já é `require_admin`.
4. **`/api/push/test` e `/api/chamados/push/test`** — sem Action literal de "teste de push".
5. **`/api/push/action`** — handler misto approve/reject; precisa aplicar a Action **por ramo**
   (`admin.user.approve` / `admin.user.reject`), não no decorator.
6. **`GET /api/admin/backups`** — listar backups não tem Action literal; hoje `_require_super_admin()`.

> Regra aplicada: nada acima foi "resolvido no feeling". Sem Action literal + contexto limpo
> ⇒ rodou-se para `NEEDS_DECISION` e **não** se adicionou `@require_action`.

---

## 5. FASE 5C — Gate de módulo legado (`require_module` / `require_module_auth`)

- `require_module_auth('stock')` (`reservalab/app.py:905,940`) e `require_module`/`require_module_auth`
  para `chamados`/`tv` são **toggles de módulo por workspace** (`disabled_apps`/`app_access`),
  independentes do RBAC (que é grant de Action). São **preservados e não alterados**.
- Comportamento fail-closed: `require_module` só passa quando `g.workspace` existe e o módulo
  está habilitado; sem `@require_workspace` ele faz pass-through (não inventa permissão). Este
  gate legado **não** subverte o RBAC (não concede Action; só libera/nega o toggle do app).

---

## 6. FASE 5D — Gates legados coexistem (sem remoção)

- Rotas A globais mantêm **ambos** os gates: `require_admin`/`_require_super_admin()` **e**
  `require_action(scope='global')`.
  - Flag **OFF**: `require_action` é no-op ⇒ quem coage é o gate legado. **Sem regressão.**
  - Flag **ON**: `require_action` global ⇒ só super admin (via bypass de `rbac_can`). Consistente.
- Nenhum mecanismo legado foi removido sem substituto comprovado. Super admin preservado em
  todos os caminhos.

---

## 7. FASE 5E — Flag de rollout (continua OFF)

- `rbac_enabled()` lê `RBAC_2_ENABLED`; valores `('1','true','yes','on')` ativam. Default `'0'`.
- Nenhuma infraestrutura complexa de rollout foi adicionada nesta etapa; a chave de ambiente é
  o único mecanismo. Rodar com flag OFF hoje = comportamento legado idêntico ao anterior.

---

## 8. FASE 5F — Auditoria (`success` / `denied`)

- O decorator registra em `rbac_audit_logs`:
  `effect = 'allow'|'deny'` (decisão) e `outcome = 'success'|'denied'` (resultado).
- **Invariante:** a decisão é tomada **antes** da escrita; falha de audit é engolida e logada no
  logger do app. **Jamais** converte DENY→ALLOW (testado).
- Nada de secrets/JWT/service-key vai para `meta` (DDL já documenta).

---

## 9. FASE 5G — Testes

`api/tests/test_rbac_routes.py` (13 testes) — cobertura Etapa 5:

- **Schema 036 `select`:** `role_permissions` consulta `select=action,scope` (sem `effect`);
  `memberships` = `id,role_id,status`; `membership_overrides` = `action,effect`.
- **Scope filtering:** grant `global` não satisfaz checagem `workspace` (e vice-versa); grant
  `workspace` satisfaz checagem `workspace`; `self` exige context+membership ativa; blank
  normaliza p/ `workspace`; missing workspace ⇒ DENY mesmo com grant.
- **Audit fail-safe:** falha de escrita de audit não altera decisão; `record_rbac_audit` nunca
  lança.
- **Público B:** `/api/chamados/workspaces` alcançável sem auth, com flag OFF e com flag ON.

Rodando a suíte completa (`pytest tests/ -q`): **471 passed** (458 da Etapa 4 + 13 novos).

---

## 10. Resumo do que NÃO foi mudado (auditabilidade/reversibilidade)

- Nenhuma Action criada/renomeada no catálogo.
- Nenhuma migration reescrita.
- Nenhum gate legado removido.
- Nenhum decorator adicionado a rotas C/públicas/cron (decisão disciplinada: ver §3).
- `auth.py` não foi modificado sem necessidade objetiva.
- Única mudança de código de engine: FASE 5A (2.1/2.2) em `rbac.py` + novos testes 5G.

> **Reversível:** reverter `rbac.py` 5A exigiria reintroduzir o bug de `select` (400/deny);
> os novos testes 5G o pegariam. O rollout é 100% reversível desligando `RBAC_2_ENABLED`.
