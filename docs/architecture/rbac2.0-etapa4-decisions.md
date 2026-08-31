# LabHub — RBAC 2.0 · ETAPA 4: Decisões, `NEEDS_DECISION` e Resolução de Pendências

> Documento da **ETAPA 4** (Materialização do RBAC 2.0 + Fechamento das Pendências).
> Alinhado às regras de Rab: nenhuma ambiguidade é "resolvida no feeling"; tudo que não
> é determinável pelo código/migration/catálogo é registrado como `NEEDS_DECISION`, e
> **nunca** se cria permission-by-accident.

---

## 1. Fonte de verdade e limites desta etapa

- **Catálogo de Actions:** `docs/architecture/rbac2.0-actions-catalog.md` — única fonte.
  Nada foi renomeado/removido/criado no catálogo.
- A migration `036_rbac2_schema.sql` semeia **apenas Actions literais que existem no catálogo**.
- O RBAC 2.0 **não** é ativado globalmente (`RBAC_2_ENABLED` continua OFF); legacy preservado.

---

## 2. Mapping determinístico de roles (fechado)

| `profiles.role` legado | Role RBAC 2.0 (slug) | Matriz (spec §5) |
|---|---|---|
| `technician` | **Técnico** (`tec`) | `ticket.*`, `stock.*`, `pcCare.*`, `reservelab.*`, `tv.*` (conteúdo) |
| `viewer` | **Visualizador** (`vis`) | leitura (`ticket.view`, `ticket.report`, `stock.export`, `pcare.export`) |
| `admin` | **Admin de Workspace** (`adm`) | workspace-admin (`admin.app.purge`, `tv.purge`, `tv.settings.manage`) |
| `is_super_admin` | **não vira role/membership** | capabilidade de plataforma global (spec §8) |

> **Nota de drift (documentado):** `src/core/permissions/types.ts` (`LEGACY_ROLE_TO_ID`)
> mapeia `admin → role-technician`, e `_require_workspace_app_manager` (`api/app.py:2692`)
> ainda confia em `profile.role='admin'` como "admin de workspace". A migration 036 adota
> a interpretação **do prompt/task** (`admin → Admin de Workspace`), que é a que melhor
> preserva a semântica atual de `_require_workspace_app_manager`. Esse drift é registrado
> como `NEEDS_DECISION` (§5) e deve ser reconciliado quando o RBAC 2.0 for ativado.

O **Super Admin** não possui membership: é a capability `profiles.is_super_admin`
(bypass global, acima de membership/override — spec §4.1/§8). A migration não cria role/membership
para super admin.

---

## 3. Seeding de permissões — regra aplicada

- **Sem wildcard** (`stock.*`, `ticket.*`, `*.read`). O engine `rbac_can` faz *exact-match*
  sobre nomes de Action; wildcard no banco seria *no-op silencioso* (bug).
- Apenas Actions **literais presentes no catálogo** são semeadas (38 no total).
- Scope padrão `workspace`; exceção documentada: `music.request` com scope `self`
  (catalog §4.2 — pedido de música pertence ao próprio usuário).

---

## 4. Resolução das pendências da ETAPA 3 (Chamados / Push / manageQr)

Estas rotas **não receberam** `@require_action` nesta etapa. Motivo: falta uma Action
literal correspondente no catálogo, e a regra proíbe inventar. Para cada uma, registra-se
a situação factual.

### 4.1 `/api/chamados/<ticket_id>` PATCH / DELETE (`api/app.py:2005`)
- Hoje: `require_module('chamados')` + escopo workspace resolvido dentro do handler;
  **sem `@require_action`**. Cobre `ticket.edit` / `ticket.status` / `ticket.assign` /
  `ticket.comment` / `ticket.close` / `ticket.delete`.
- As Actions literais **existem no catálogo** (`ticket.edit`, `ticket.status`, `ticket.assign`,
  `ticket.close`, `ticket.reopen`, `ticket.delete`). Portanto **não é `NEEDS_DECISION` a existência**,
  mas a **aplicação do decorator** fica para a fase de ativação do RBAC (Etapa de rollout/Fase 2),
  a fim de não alterar o comportamento atual (flag OFF = no-op). Registrado como **pendência de
  aplicação**, não de modelagem.

### 4.2 `/api/chamados/push/test` (`api/app.py:2563`)
- Rota de teste/envio de push de chamados. Não há Action catalogada específica
  (`admin.notification.send` existe, mas é `ADMIN` super-admin).
- `NEEDS_DECISION`: definir uma Action literal para testes/envio de push de chamados,
  ou reutilizar `admin.notification.send`. Nada semeado.

### 4.3 `/api/push/*` (`src/apps/reservalab/api/app.py:498-1305`)
- Cobrem `subscribe`, `test`, `send`, `action`, `check`, `notify-loan`, `notify-return`,
  `check-overdue`, `check-pcare`, `check-all`. Muitas são cron/backend (sem user) ou públicos.
- Catálogo lista `reservelab.push.manage` (ADMIN, send) e `admin.notification.send`.
- `NEEDS_DECISION`: quais endpoints `/api/push/*` precisam de Action ~ individual vs. derivada
  de `reservelab.push.manage` / `admin.notification.send`; rotas cron requerem decisão de
  identity (super admin / system key). Nada semeado além de usar as Actions já existentes
  no catálogo quando aplicável.

### 4.4 `manageQr` (capability `ticket.qr` / `pcare.qr.gen`)
- Catálogo mapeia o proxy atual `manageQr` para `ticket.qr` (§4.1) e `pcare.qr.gen` (§4.4).
- A Action **literal `ticket.qr` existe no catálogo** e **foi semeada** para `tec`.
  `pcare.qr.gen` também existe no catálogo (proxy `manageQr`).
- `NEEDS_DECISION` (documentado): `manageQr` hoje é uma capability booleana independente do
  nível de app access (`permissions/service.ts:115-122`). No RBAC 2.0 deve mapear para
  `ticket.qr` / `pcare.qr.gen` — decisão de aplicação (frontend) fica para a fase de rollout.

---

## 5. `NEEDS_DECISION` consolidados (abertos; NÃO resolvidos no feeling)

1. **Drift `admin` → `role-technician` vs `Admin de Workspace`** (§2): reconciliar types.ts
   `LEGACY_ROLE_TO_ID` + `_require_workspace_app_manager` quando o RBAC for ativado.
2. **Ações de workspace-admin não listadas como Actions no catálogo** — `membership.manage`,
   `appSettings.manage`, `admin.workspace.manage`, `backup.*` aparecem como *famílias* na
   matriz do spec §5, mas **não existem como Actions literais no catálogo**. NÃO semeadas aqui.
3. **`/api/chamados/push/test` e `/api/push/*`**: action de teste/envio de push (4.2/4.3).
4. **`reservelab.tablet.cancel`**: inconsistência atual (UI `full` vs RLS super admin-only,
   catalog §4.5/§8) — virará Action controlada quando ativado. Não semeada como permission
   individual (não há Action literal `reservelab.tablet.cancel` no catálogo §15).
5. **`music.moderate`** e **`music.request`** (spec §5 "Operador TV"): `music.request`
   foi semeado com scope `self`; `music.moderate` semeado para `opv`. A regra de
   **concorrência** de moderação é de domínio, não permissão (catalog §13) — não modelada.

---

## 6. Backfill (036) — regras aplicadas

- Fonte: `profiles.workspace_ids` (unnest) × `profiles.role`.
- Mapeia `technician→tec`, `viewer→vis`, `admin→adm`, status `active`.
- **Idempotente** (`ON CONFLICT (profile_id, workspace_id) DO NOTHING`).
- **Reversível** (novas tabelas; queda das tabelas desfaz o backfill; nada legado é apagado).
- **Não toca** `profiles.workspace_ids` / `profiles.role`.
- Perfis sem workspace (ou com role vazia/desconhecida) → **0 memberships** (contado e
  reportado via `RAISE NOTICE`). Super admin não é backfillado (não vira membership).

---

## 7. Segurança (RLS) aplicada em 056

- Escrita em `memberships` / `membership_overrides` / `roles` / `role_permissions`
  = **super admin-only** → um usuário comum **não pode se auto-conceder** override/role.
- `rbac_audit_logs` = **append-only** (SELECT super admin-only; INSERT via service_role;
  sem policies de UPDATE/DELETE para authenticated) → **não forjável** por usuário comum.
- Seleção de `memberships`/`role_permissions` é workspace-isolada (`user_belongs_to_workspace`),
  preservando isolamento RLS entre workspaces.
- `meta` de `rbac_audit_logs`: nunca armazena secrets/JWTs/service keys (comentário DDL).
