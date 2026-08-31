# LabHub — Especificação Técnica do RBAC 2.0

> **Status:** Proposta formal (read-only). NENHUM código, banco, migration ou commit foi alterado.
> **Data:** 2026-08-30
> **Escopo:** Especificação implementável do modelo de autorização granular RBAC 2.0, construída a partir da auditoria read-only do código real.
> **Fonte de verdade de Actions:** `docs/architecture/rbac2.0-actions-catalog.md` (consolidado na Etapa 2). Este documento **não cria, remove nem renomeia** nenhuma Action daquele catálogo.
> **Convenções:** itens que não podem ser determinados pelo código são marcados como `NÃO DETERMINADO PELO CÓDIGO`. Inconsistências da base são catalogadas como `INCONSISTÊNCIA ENCONTRADA` (sem correção).

---

## 1. Resumo Executivo

LabHub hoje possui **duas camadas de controle disjuntas e incompletas**:

1. **Camada de App Access (apenas client-side em sua parte granular):** um modelo `AppAccessLevel = 'dash' | 'read' | 'full'` por usuário/app, resolvido no `browser` (`src/core/permissions/service.ts:82-93`), com override individual e capacidade booleana `manageQr`. O super admin recebe `full` em tudo (`usePermissions.ts:62`). **Não existe autorização granular por Action no backend.** O backend valida apenas autenticação JWT, módulo habilitado (`disabled_apps`) e, pontualmente, super admin / workspace-app-manager.

2. **Camada RLS (backend/banco, de fato autoritativa):** isolamento por workspace (`is_super_admin() OR user_belongs_to_workspace(...)`) enumerado em 33+ migrations (027–035). RLS garante isolamento entre workspaces, mas **não expressa permissões por Action** — qualquer membro do workspace lê/escreve todo o conteúdo do workspace (apenas super admin tem exceções de deletar/gerenciar).

O RBAC 2.0 propõe introduzir **Actions granulares** (do catálogo consolidado) resolvidas **no backend e no banco**, mantendo RLS como o **vetor de isolamento de tenant** (RBAC complementa, não substitui RLS) e impondo **deny-by-default** em todas as camadas. A decisão determinística é:

```
scope(auth_user, ws) = super_admin ⇒ ALL
                      senão ⇒ (role de membership(ws)) ⊕ override(membership(ws))
Permitir Action A em workspace WS ⇔ A ∈ efetivas(role(WS), override(WS)) ∧ membro_de(WS)
```

App Access (dash/read/full) **não** equivale a Action; o app-access decide *vir no painel*; as Actions decidem *o que pode executar*. O modelo introduz o conceito de **membership** (ausente hoje) para que "role pertença ao workspace/membership" (um dos conceitos já fechados pelo prompt).

### Entregáveis desejados (por etapa)
- **Etapa 1:** data model + migrations `profiles`/`memberships`/`roles`/`role_permissions`/`overrides`.
- **Etapa 2:** helpers SQL de resolução + políticas RLS voltadas a Action.
- **Etapa 3:** camada backend (decorators `require_action`) + endpoints.
- **Etapa 4:** frontend (guardas por Action; App Guard permanece para *navegação*, nunca como segurança).
- **Etapa 5:** auditoria + matriz de testes + rollout com feature-flag.

---

## 2. Arquitetura

### 2.1 Orquestração atual (baseline auditado)

```
                        ┌───────────────────────────────┐
   Navegação/UX          │  Frontend (browser)          │
   (NÃO é fronteira de   │  AppGuard.tsx:30  (canAccessApp)│
    segurança)           │  AdminGuard.tsx:19 (is_super)│
                        └───────────────┬───────────────┘
                                        │ JWT (anon key p/ kiosk TV)
                        ┌───────────────▼───────────────┐
   Autoridade de fato   │  Supabase Postgres + RLS      │
   (dados)              │  is_super_admin() OR          │
                        │  user_belongs_to_workspace()  │
                        └───────────────┬───────────────┘
                                        │ service_role     ▲
                        ┌───────────────▼───────────────┐  │ bypass RLS
   Autoridade           │  Flask backend (api/)         │──┘
   (operações)          │  require_auth / require_admin/│
                        │  require_module / require_cron│
                        └───────────────────────────────┘
```

### 2.2 Pontos a corrigir no RBAC 2.0
1. **Frontend hoje decide `full`/`read` (`usePermissions.ts`, `service.ts`).** Fora do painel, qualquer chamada RLS/endpoint ignora isso → as permissões por Action **devem** ser revalidadas em backend/RLS.
2. **Backend não conhece Action** — apenas `require_module` (fail-open), `_require_super_admin`, `_require_workspace_app_manager` (super admin OU `profile.role='admin'` legado), `require_admin` (reservalab, `is_super_admin`).
3. **RLS é workspace-scoped, não Action-scoped** — membro lê/escreve todo o conteúdo do workspace.
4. **Não há tabela `memberships`** — membership vive em `profiles.workspaceIds UUID[]` (`001_create_profiles.sql:10`); `role` (admin/technician/viewer) é coluna do profile (`001:9`) e **não é por-workspace**.
5. **`roles` é coleção LOCAL-ONLY** (`src/lib/sync.ts:120-129` via `createSyncService<Role>('roles')`), logo não é fonte de verdade distribuída/server.
6. **`audit_logs`/`roles` local-only** — auditoria de RBAC precisa de tabela server-side.

### 2.3 Arquitetura-alvo (RBAC 2.0)
```
   Frontend (UX)  ──►  App Guard (navegação; NÃO segurança)
                        │
                        ▼
   Flask backend  ──►  @require_action('stock.item.create', scope=ws)
                        │  resolve(scope) em SQL / tabela de permissões
                        ▼
   Postgres RLS   ──►  política por-Action + isolamento por-workspace
                        (RBAC + RLS em conjunto; RLS mantém o tenant barreira)
```

- **Única fonte de verdade:** banco (tabelas `roles`, `role_permissions`, `memberships`, `membership_overrides`) — **nunca** coleção local ou `profiles.workspaceIds` para decidir Action.
- **RLS permanece** como a barreira de isolamento de tenant; RBAC resolve *ação dentro do tenant*.
- **Deny-by-default** em 3 camadas: frontend (UX), backend (decorator), RLS (policy sem match nega).

---

## 3. Modelo de Dados

> Estado atual relevante (evidência):
> - `profiles.role TEXT CHECK IN ('admin','technician','viewer')` e `profiles.workspaceIds UUID[]` (`001:9-10`).
> - `profiles.is_super_admin BOOLEAN NOT NULL DEFAULT false` (`019:6`), `app_access JSONB` (`013`).
> - `workspaces` + `disabled_apps JSONB` (`028`).
> - `workspace_app_settings` / `app_data_backups` (`031`); `workspace_backups` / `workspace_audit_logs` (`021`).
> - `roles` coleção local client-side (`sync.ts:120-129`); `audit_logs` local-only.

### 3.1 Tabelas propostas (novas)

**`roles` (server-side — nova, substitui a coleção local)**
```sql
CREATE TABLE public.roles (
  id            uuid PRIMARY KEY,
  workspace_id  uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  is_system     boolean NOT NULL DEFAULT false,   -- seed, não editável
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- Chave: um cargo pertence a um workspace (membership). ''/NULL workspace = cargo global/plataforma (só super admin).
```

**`role_permissions` (Actions por cargo)**
```sql
CREATE TABLE public.role_permissions (
  id          uuid PRIMARY KEY,
  role_id     uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  action      text NOT NULL,                 -- uma Action do catálogo (rbac2.0-actions-catalog.md)
  scope       text NOT NULL DEFAULT 'workspace',  -- workspace | all | self
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, action, scope)
);
```

**`memberships` (nova — papel da pessoa num workspace)**
```sql
CREATE TABLE public.memberships (
  id           uuid PRIMARY KEY,
  profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role_id      uuid NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','suspended','removed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, workspace_id)
);
```

**`membership_overrides` (override individual > role — conceito já fechado)**
```sql
CREATE TABLE public.membership_overrides (
  id                uuid PRIMARY KEY,
  membership_id     uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  action            text NOT NULL,
  effect            text NOT NULL CHECK (effect IN ('allow','deny')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (membership_id, action)
);
```

> **Nota de migração (gap de dados):** o catálogo atual **não tem tabela de memberships**. Introduzi-la exige um backfill a partir de `profiles.workspaceIds` e `profiles.role` (vira: técnico->role-technician, admin->role-technician + managed, viewer->role-viewer). A regra de backfill é `NÃO DETERMINADO PELO CÓDIGO` em detalhes finos de mapping de permissões; o mapping coarse é determinável (`LEGACY_ROLE_TO_ID`, `types.ts`).

### 3.2 Colunas/dependências existentes que o RBAC 2.0 consome
- `profiles.is_super_admin` — **capacidade de plataforma global**, não membership (conceito fechado).
- `profiles.workspaceIds` — passa a ser **derivado** de `memberships` (fonte canônica nova); mantém-se por compatibilidade até Fase de rollout.
- `profiles.role` legado — mantém-se somente para compatibilidade; RBAC 2.0 usa `memberships.role_id`.

---

## 4. Role → Membership → Override → Scope (Regra Determinística)

### 4.1 Definição formal
Dado o usuário autenticado `u`, o workspace `WS` e a Action `A` (do catálogo):

```
1. super:     se u.is_super_admin = true ⇒ PERMITIR (capabilidade global; ver §8)
2. membro:    se u ∉ members(WS)          ⇒ NEGAR          (deny-by-default / isolamento)
3. base:      B = perms(role(membership(u,WS)))            (union de actions do cargo)
4. override:  O = perms(membership_overrides(membership(u,WS)))
              aplica-se por Action: O.deny(A) ⇒ NEGAR;  O.allow(A) ⇒ inclui mesmo se não em B
5. efetiva:   A ∈ efetivas ⇔ (A ∈ B ∨ A ∈ O.allow) ∧ A ∉ O.deny
6. escopo:    ver §4.3 (scope da Action dentro do workspace)
```

**Prioridade (fechada no prompt): `override > role`.**
- `override.deny` bloqueia mesmo que a role conceda.
- `override.allow` concede mesmo que a role negue.
- `super_admin` está **acima** de override (é capacidade global de plataforma, não participa de membership).

### 4.2 Líder ≠ admin (conceito fechado)
- `leaderId` em `Role` (`types.ts:18`) é hoje **display-only** (`RolesPage.tsx:121-125,295-320`) — não confere permissão.
- No RBAC 2.0, "líder" **não** é sinônimo de admin e **não** auto-concede Actions; é apenas um atributo de visibilidade/organização. `NÃO DETERMINADO PELO CÓDIGO` se líder deve herdar algum conjunto de Actions — não há evidência; decisão fica para a Etapa de modelagem (marcar como pendência real se necessário).

### 4.3 Escopo (scope ≠ Action — conceito fechado)
Uma Action pode ter scope:
- `workspace` (padrão): vale para registros do workspace `WS`.
- `all`: vale para todo o tenant/plataforma (ex.: leitura de workspace agrupado em relatórios de super).
- `self`: vale apenas sobre o próprio registro do usuário (ex.: atualizar próprio perfil).

A **granularidade de linha** continua sendo responsabilidade do RLS (workspace `workspace_id`); a **Action** diz *o tipo de operação* permitida; o **scope** limita *sobre o quê*.

---

## 5. Matriz de Concessão (papéis × Actions)

> Papéis são **por-pontos-blueprint**; tabela abaixo é o **seed proposto** (a partir do catálogo). A granularidade por-app está 100% ligada às Actions consolidadas; abaixo usam-se famílias de Actions (prefixos). A matriz completa por Action individual fica no catálogo de implementação; aqui define-se o **padrão de concessão**.

| Papel (workspace)     | Famílias de Actions concedidas (seed)                                          | scope |
|-----------------------|-------------------------------------------------------------------------------|-------|
| **Técnico**           | `ticket.*`, `stock.*`, `pcCare.*`, `reservelab.*`, `tv.*` (conteúdo), `dashboard.*` | workspace |
| **Visualizador**      | `*.read` / `*.view` / `dashboard.*`                                           | workspace |
| **Gestor de Estoque** | `stock.*` (full) + `reports.*` + `export.*`                                   | workspace |
| **Operador TV**       | `tv.content.*`, `music.*` (moderar fila)                                      | workspace |
| **Admin de Workspace**| `workspace.*`, `membership.*`, `appSettings.*`, `backup.*`, `purge.*`         | workspace |
| **Super Admin (global)**| `*.*` (todas via capabilidade `is_super_admin`)                              | all |

> `ticket.createPublic`, `ticket.track`, `reservelab.lab.view` são **PUBLIC** (catálogo) → concedidas a membros e não-membros via endpoint público token/anon; **não** passam pela matriz de workspace normal.
> Quick Actions (`ticket.create`, `music.request`, `reservelab.tablet.reserve` — catálogo) são **derivadas** das Actions (conceito fechado) e aparecem na UI **apenas** se a Action raiz for permitida.

**Regra de maior-privilégio:** a concessão efetiva é a **união** de todas as memberships do usuário no workspace (o prompt fecha "uma role por membership"; um usuário pode ter múltiplas memberships em workspaces distintos, mas **uma por (profile, workspace)** — `UNIQUE(profile_id, workspace_id)` garante).

---

## 6. App Access × Action × Scope

**Os três conceitos são ortogonais** (conceito fechado: "Action ≠ App Access; Action pode existir sem app access; scope ≠ action").

| Conceito        | O que decide                          | Onde é realmente validado hoje | Onde será validado no RBAC 2.0 |
|-----------------|---------------------------------------|--------------------------------|--------------------------------|
| **App Access**  | *Exibir* o app no painel (dash/read/full) | Frontend (`AppGuard`, `service.ts`) — NÃO é segurança | Frontend (UX) + backend `require_module` (módulo habilitado) |
| **Action**      | *Executar* operação granular (criar/editar/aprovar/purge) | RLS workspace-scoped (grosso) | Backend `@require_action` + RLS por-Action |
| **Scope**       | *Sobre quais registros* a Action vale | RLS `workspace_id` | RLS `workspace_id` + `scope` da permissão |

**Regras de composição:**
1. **App Access não substitui Action.** Um usuário com `full` no app **deve ainda** ter as Actions específicas; sem elas, o backend/RLS nega. (`INCONSISTÊNCIA ENCONTRADA` — hoje `full` no frontend concede escrita, mas backend/RLS não distinguem; ver §7.)
2. **Action pode existir sem app access.** Ex.: super admin executa `ticket.createPublic` via endpoint público sem estar logado no painel (public token flow `035_tracking_token.sql`).
3. **`manageQr`** é uma capability separada (não é Action de app). No RBAC 2.0 passa a ser modelado como Action (`qrcode.manage`) ou mantido como flag — decidir na Etapa de modelagem (`NÃO DETERMINADO PELO CÓDIGO` qual a Action canônica; o catálogo deve conter o candidato correspondente).
4. **Deny-by-default:** se nenhuma Action permite, o backend retorna 403 e o RLS não devolve linha — independente do App Access.

---

## 7. Autorização no Backend

### 7.1 Estado atual compilado (evidência)
| Fronteira | Mecanismo | Local | Comportamento |
|-----------|-----------|-------|---------------|
| Auth | `require_auth` (JWT → perfil do server, re-fetch de `role,is_super_admin,workspace_ids`) | `src/apps/reservalab/api/auth.py:269`; `api/app.py:804` | 401 se sem JWT; **não confia** no cliente |
| Módulo | `require_module` (fail-open se workspace ausente) | `api/app.py:1087-1104` | 403 se `module_id ∈ disabled_apps` |
| Admin | `require_admin` (reservalab) | `auth.py:398` | exige `g.user.is_super_admin` |
| Admin | `_require_super_admin` | `api/app.py` | super admin |
| Workspace mgmt | `_require_workspace_app_manager` | `api/app.py:2692-2705` | super admin **OU** `profile.role='admin'` legado |
| Cron | `require_cron` (cron key) | `auth.py:424` | rota de job |
| Chamados público | `require_tracking_token` (hash SHA-256, header) | `api/app.py:78`; `035_tracking_token.sql` | RLS fechado; só endpoint valida |

**Rotas existentes (catalogadas):**
- `api/app.py`: `/api/tv/*` (activation, devices/provision, cloudinary/delete, source/fetch), `/api/chamados` (POST/GET), `/api/chamados/<id>` (GET/PATCH/DELETE), `/api/chamados/*/events`, `/api/chamados/reports`, `/api/chamados/reports/weekly-email`, `/api/chamados/photos/purge`, `/api/public/chamados/<tracking_token>[...]`, `/api/chamados/workspaces`, `/api/admin/wipe`, `/api/admin/app-data/{describe,purge}`, `/api/admin/backups[...]`, `/api/admin/audit-logs`, `/api/admin/workspaces/<id>/delete`, `/api/chamados/push/test`.
- `reservalab/app.py`: `/api/reservas` (GET, **sem decorator de auth** — lê dados de planilha/cache públicos), `/api/health`, `/api/push/*` (subscribe/test/send/action/check/notify-loan/notify-return/check-overdue/check-pcare/check-all; alguns `@require_auth`, alguns `@require_cron`, `/push/*` de stock com `@require_module_auth('stock')`).

### 7.2 Proposta de contrato (decorator)
```python
# Novo helper compartilhado em api/auth.py (ou módulo rbac.py)
def require_action(action: str, scope: str = 'workspace'):
    def deco(f):
        @functools.wraps(f)
        @require_auth
        @require_workspace          # (quando houver workspace na rota)
        def wrapper(*args, **kw):
            ws = g.workspace_id
            if not rbac_can(profile=g.profile, workspace=ws, action=action, scope=scope):
                return _forbidden('Permissão insuficiente')   # 403, deny-by-default
            return f(*args, **kw)
        return wrapper
    return deco
```

- `rbac_can` consulta (via **service_role**, respeitando a mesma lógica das views SQL) `memberships` + `role_permissions` + `membership_overrides` e retorna booleano.
- **LAZINESS/consistência:** a mesma resolução deve ser implementada como **função SQL** (para RLS) e **consulta/lógica Python** (para `@require_action`) — ambas derivadas da MESMA regra determinística (§4) para evitar drift.

### 7.3 Segurança de service_role
`service_role` **bypassa RLS** — portanto qualquer rota que opere com `service_role` (todas as de `api/app.py`, `reservalab/app.py`) **deve** aplicar `@require_action` individualmente. Este é o ponto crítico: hoje `chamados_tickets`/`ticket_events` têm `REVOKE ALL` (`028`) e tudo passa pelo Flask → é o **backend o único lugar que pode decidir Action para esses dados**. Sem `@require_action`, o RBAC 2.0 não surte efeito nesses endpoints.

### 7.4 Endpoints públicos / TV
- `/api/public/chamados/<tracking_token>*`: público por design (token), **não** passa por `@require_action` — o token é a autorização (scope = aquele chamado). Manter.
- `/api/tv/*` e `/api/push/*`: devem receber `@require_action` adequado por rota (ex.: `tv.device.provision`, `stock.notify`) além do `@require_module_auth` atual.
- `/api/reservas` (GET público, sem auth): permanece público (dados de exibição) — `NÃO DETERMINADO PELO CÓDIGO` se deve ser fechado; hoje é intencionalmente aberto (`app.py:406`).

---

## 8. Super Admin

### 8.1 Definição corrente (evidência)
- Coluna `profiles.is_super_admin BOOLEAN NOT NULL DEFAULT false` (`019:6`).
- Função `public.is_super_admin()` — **autoritativa** em `028_authorization_consolidation.sql`:
  ```sql
  SELECT COALESCE((SELECT p.is_super_admin FROM public.profiles p WHERE p.id=auth.uid()), false);
  ```
  `SECURITY DEFINER` (evita recursão de RLS em profiles), `STABLE`, `search_path=public`, `REVOKE ... FROM anon/PUBLIC` (`028`).
- **Bypass:** `service.ts:82-93` (super → full), `usePermissions.ts:62` (`is_super_admin → 'full'`), `AdminGuard.tsx:19`, `require_admin` (reservalab), `_require_super_admin`, `_require_workspace_app_manager` (super admin OR role='admin').

### 8.2 Como o RBAC 2.0 trata
- `is_super_admin` é **capabilidade de plataforma global**, **separada de membership** (conceito fechado). Super admin **transcende** workspace e override.
- No RBAC 2.0, **`is_super_admin() = true ⇒ true para qualquer Action/workspace`**, mas o super admin **não possui membership** (não tem role por workspace). Isso **não** o isenta do RLS de isolamento? — **Não**: `is_super_admin()` já aparece **dentro** das políticas RLS (`... OR is_super_admin()`), logo RLS concede a leitura/escrita. RBAC complementa mantendo esse bypass explícito e documentado.
- **Recomendação de endurecimento (por fase):** manter `is_super_admin()` como bypass é aceitável para operações de plataforma (`admin.*`, `workspace.*`, `backup.*`, `purge.*`). Para Actions de dados de app (ex.: `stock.item.create`), **decidir** se super admin também passa direto ou se precisa de membership — `NÃO DETERMINADO PELO CÓDIGO` (sem janela de comportamento desejado); proposta: super admin criava/adita via `admin.*` e tabelas, não pelos endpoints operacionais.
- **Gap atual catalogado:** `_require_workspace_app_manager` (`.py:2692`) aceita `profile.role='admin'` **legado** → `INCONSISTÊNCIA ENCONTRADA`: o RLS foi migrado de `role='admin'` para `is_super_admin()` (028), mas esse trecho do backend **ainda** confia no `role` legado. Recomendação (na fase de implementação): alinhar ao `is_super_admin()` ou a `can_manage_workspace_apps()` (`031`).

---

## 9. Deny by Default

**Regra imutável:** se nenhuma camada concedeu explicitamente, **nega**.

Camadas e seu estado atual:
| Camada | Deny-by-default hoje? | Observação |
|--------|----------------------|------------|
| RLS | ✅ (sem policy match → nega) | Workspace-scoped; **grosso**, não por-Action |
| Backend | ⚠️ | `require_module` **fail-open** (`api/app.py:1087-1104`: workspace ausente ⇒ permite); `@require_action` inexistente |
| Frontend | ⚠️ (UX, não segurança) | `AppGuard` bloqueia app sem access; mas é client-side |

**Ações de conformidade (na fase de implementação):**
1. Tornar `require_module` **fail-closed** para rotas sensíveis (módulo ausente ⇒ nega), exceto onde intencional (`NÃO DETERMINADO PELO CÓDIGO` o conjunto exato de exceções).
2. Adicionar `@require_action` em **todas** as rotas que operam com `service_role`.
3. RLS nova por-Action com **regras permissive OR explícitas e verificáveis** (o `029/034` já provaram que policies permissive legadas vazam; manter auditoria de `USING(true)` pós-deploy).

---

## 10. Integração com RLS

**Princípio:** RLS continua sendo o vetor de **isolamento de tenant/workspace**; RBAC adiciona **seleção de Action** dentro do tenant. As duas camadas **coexistem** (AND lógico de fato por construção: a policy filtra por linha `workspace_id` **e** a Action é validada na camada acima/explícita).

Estratégia de implementação sugerida (fases, ver §13):
- **Abordagem A (views/funções de permissão):** criar função `public.has_action(action text, ws uuid)` (SECURITY DEFINER, busca em `memberships`/`role_permissions`/`overrides` + `is_super_admin()`), e incorporar às policies existentes, ex.:
  ```sql
  -- Exemplo (ilustrativo; policies reais por-action na fase de RLS)
  CREATE POLICY "stock_stock_items_insert" ON stock.stock_items
    FOR INSERT TO authenticated
    WITH CHECK ( user_belongs_to_workspace(workspace_id)
                 AND has_action('stock.item.create', workspace_id) );
  ```
- **Abordagem B (backend-only p/ Actions, RLS p/ isolamento):** manter RLS como está e decidir Action **apenas no backend** por `@require_action` (dados `REVOKE ALL` como chamados já dependem do backend). **Recomendada inicialmente** por menor risco de quebrar kiosk/eventualmente, e depois estender ao RLS conforme adoção.
- Tabelas que **não** devem ter policy por-Action: `workspace_backups`, `workspace_audit_logs` (service_role no RLS, `033`), `tv_music_tracks`/`tv_gallery_photos` (filhas via JOIN, `030`), `profiles`/`workspaces` (políticas próprias).

**Gap/inconsistência de RLS atual a manter documentado (não corrigir aqui):**
- `INCONSISTÊNCIA ENCONTRADA`: `tv_music_requests` moderation é **super-admin-only** via RLS (`019:48`) — não há Action de "aprovar música" associada a role de workspace; é restrita a super. Impacto: operador TV não pode moderar até existir Action `music.*.approve`. Recomendação: modelar `music.request.approve` e decidir papel.
- `INCONSISTÊNCIA ENCONTRADA`: `stock.notifications` com `workspace_id NULL` global por design (`033`) — a Action de notificação precisa tratar NULL como fora de workspace (`user_belongs_to_workspace(NULL)` é false). Impacto: membro não lê notificações globais. Recomendação: decidir escopo global ou por-workspace.

---

## 11. Auditoria

> Estado atual: `audit_logs` é **local-only** (`sync.ts:120-129`); `workspace_audit_logs` (`021`) registra apenas exclusão de workspace e é service_role-only; `app_data_backups` (`031`) é append-only.

**Requisitos do RBAC 2.0:**
1. Tabela server-side `rbac_audit_logs` (uuid, actor_id, actor_is_super, action, workspace_id, scope, effect(allow/deny), outcome(success/denied), resource_type, resource_id, ts, meta jsonb).
2. **Registrar sempre:** tentativas **negadas** (deny) são tão importantes quanto permitidas (detecção e depuração).
3. Gravar via backend (`service_role`) em todas as rotas com `@require_action`; em RLS, divulgar de forma não-bloqueadora (ex.: função `log_denied` chamada em policy, ou somente via backend — `NÃO DETERMINADO PELO CÓDIGO` a solução de auditoria por-RLS; risco de deadlock/perf).
4. `rbac_audit_logs` com RLS: SELECT apenas `is_super_admin()`/service_role; INSERT via service_role (espelho de `app_data_backups`).
5. Retenção/configuração TTL, e privacy (actor_id pseudonimizado se necessário) — `NÃO DETERMINADO PELO CÓDIGO`.

> `INCONSISTÊNCIA ENCONTRADA` (auditoria): não existe hoje auditoria de **permisões** (quem mudou role/permissão de quem) em tabela server-side; `RolesPage` `:378` tem placeholder "Futuro: Ações permitidas". O RBAC 2.0 deve registrar operações de concessão/revogação.

---

## 12. Estado Atual × Desejado

| Capacidade | Estado atual | Estado desejado (RBAC 2.0) |
|------------|--------------|----------------------------|
| Permissão granular | App access (dash/read/full) client-side | Actions por-role por-workspace, server-side |
| Fonte de verdade de roles | Coleção local (`sync.ts`) | Tabela `roles` no banco + `role_permissions` |
| Membership | `profiles.workspaceIds` array + `profiles.role` (não por-workspace) | Tabela `memberships` (1 cargo por membership) |
| Override individual | `user.app_access` JSONB (por app, só níveis) | `membership_overrides` (por-Action allow/deny) |
| Backend authz | `require_auth`+`require_module`(+admin/cron) | + `require_action` em todas rotas service_role |
| RLS | Isolamento workspace (is_super_admin OR belonging) | Isolamento workspace + seleção por-Action |
| Super admin | `is_super_admin()` bypass — em RLS e `service.ts` | Bypass global explícito + alinhar `_require_workspace_app_manager` |
| Deny-by-default | Parcial (backend fail-open) | Completo (backend fail-closed + RLS por-Action) |
| Auditoria | local-only + `workspace_audit_logs` (delete) | `rbac_audit_logs` server-side (allow+deny) |

---

## 13. Lacunas

1. **Sem tabela `memberships`** — não é possível ter "role pertence ao workspace" com o model atual.
2. **`roles`/`audit_logs` local-only** — não são fontes de verdade distribuíveis para backend/RLS.
3. **Backend sem conceito de Action** — toda a autorização granular precisará ser introduzida via `@require_action`.
4. **`require_module` fail-open** — módulo desabilitado com workspace ausente permite (`.py:1087-1104`).
5. **`_require_workspace_app_manager` confia em `profile.role='admin'` legado** — drift vs RLS `is_super_admin()` (`028`).
6. **RLS não por-Action** — membro opera todo o workspace; deadlines de "deletar" só super (algumas tabelas), incoerente (ex.: `tablet_reservations_delete` só super, `034`).
7. **TV moderation super-only** (`019:48`) — sem Action de role.
8. **`manageQr`** como flag solta; precisa virar Action (ou regra explícita).
9. **Auditoria de permissões inexistente**.
10. **TV kiosk anon** — decisões de auth de kiosk afetam se Actions podem ser validadas em RLS sem quebrar display (debt documentado em `028` §6, `030`).

---

## 14. Plano de Implementação (fases, risco-minimizado)

> Ordem escolhida para reduzir risco: primeiro **fonte de verdade** (banco), depois **resolução** (escrita uma vez, reutilizada), depois **enforcement** (backend → RLS → frontend), com **feature-flag** em cada fase e **nenhuma Action nova/removida** em relação ao catálogo.

**Fase 0 — Pré-requisitos (sem mudança de comportamento):**
- Congelar catálogo de Actions (`rbac2.0-actions-catalog.md`).
- Levantar estado real do banco (policies `USING(true)` restantes — auditoria `029/034` voltada a RBAC).
- Definir mapping de backfill para `memberships` e mapping legado `app_access`→Actions (documentar `NÃO DETERMINADO`).

**Fase 1 — Schema + seeds (data model):**
- Criar `roles`, `role_permissions`, `memberships`, `membership_overrides`, `rbac_audit_logs` (§3, §11).
- Seeds dos papéis (§5) com Actions do catálogo. Serviço `rbac` (Python) de leitura/resolução.

**Fase 2 — Função SQL de resolução:**
- `public.has_action(text action, uuid ws)` + `public.role_effective_actions(uuid ws)` (SECURITY DEFINER, mesma lógica §4). Unit-test SQL.

**Fase 3 — Enforcement backend:**
- `@require_action` + aplicação às rotas service_role de `api/app.py` e `reservalab/app.py` (inclui chamados via backend-only, §7).
- Tornar `require_module` fail-closed em rotas sensíveis.
- Corrigir `_require_workspace_app_manager` (alinhar a `is_super_admin()`/`can_manage_workspace_apps()`).
- Auditoria `rbac_audit_logs` (allow+deny). **Feature-flag**: rollback = remover decorators (comportamento via flag).

**Fase 4 — RLS por-Action (estendido):**
- Aplicar `has_action(...)` às policies workspace-scoped das tabelas operacionais (stock/pcare/assets/tv), **preservando** `is_super_admin()` OR e isolamento de workspace. Roteirizar por schema e testar (kiosk TV!).
- Manter `REVOKE ALL` em chamados (backend-only).

**Fase 5 — Frontend:**
- Migrar `useAppAccess`/`service.ts` para consumir a resolução server-side (ou espelhar), mantendo UX; **frontend nunca é fronteira de segurança**.
- Webhook em `RolesPage` para editar Actions da role (substituir placeholder `:378`), mas ONLY para seed/role do workspace (não-system).
- Derivar Quick Actions das Actions permitidas.

**Fase 6 — Testes + rollout:**
- Matriz de testes (§15) automatizada (pytest Flask + política SQL).
- Migrar `profiles.workspaceIds` para derivar de `memberships`; manter sync temporário.
- Remover flag gradativamente.

---

## 15. Matriz de Testes

| # | Cenário | Esperado | Camada |
|---|---------|----------|--------|
| 1 | Não-autenticado em rota `@require_action` | 401 | Backend |
| 2 | Autenticado, não membro do workspace, Action permitida do seu cargo noutro ws | 403 (isolamento) | Backend/RLS |
| 3 | Membro, Action **não** concedida pela role | 403 deny-by-default | Backend/RLS |
| 4 | Membro, Action concedida pela role | 2xx | Backend/RLS |
| 5 | Membro, role nega mas `override.allow` | permitida (override>role) | Backend/RLS |
| 6 | Membro, role permite mas `override.deny` | negada (override>role) | Backend/RLS |
| 7 | Membro com role permite, override sem menção | role decide | Backend/RLS |
| 8 | Super admin em Action/workspace qualquer | permitida (global) | Backend/RLS |
| 9 | `require_module` com módulo desabilitado | 403 (fail-closed após Fase 3) | Backend |
| 10 | `require_module` sem workspace (rota sem ws) | conforme decisão (fail-closed salvo exceção intencional) | Backend |
| 11 | Action de app × App Access `read` no frontend | backend/RLS ainda nega escrita | Cross |
| 12 | Action existe sem App Access (public/create token) | permitida via token; negada direto | Backend |
| 13 | `_require_workspace_app_manager` com user `role='admin'` legado ≠ super | negado (após correção) | Backend |
| 14 | RLS por-Action: usuário sem Action, mesmo membro do ws | 0 linhas / insert negado | RLS |
| 15 | RLS por-Action: kiosk TV anon | não quebrado (display lê) | RLS |
| 16 | Auditoria: tentativa negada gravada com outcome=denied | 1 linha em `rbac_audit_logs` | Backend |
| 17 | `manageQr` mapping para Action | UI/hook reflete | Frontend |
| 18 | Backfill `workspaceIds → memberships` idempotente | sem duplicatas | Migration |
| 19 | Dois usuários, um role em cada ws | isolamento preservado | RLS |
| 20 | Qualquer tela do painel continua navegando (UX intacta) | smoke | Frontend |

---

## 16. Riscos

| Risco | Mitigação |
|-------|-----------|
| Quebrar kiosk TV anon ao mudar RLS | Fase 4 só após Fase 3; policy preserva `can_access_tv_workspace`/`is_super_admin`; teste específico (caso 15). |
| Drift entre função SQL (RLS) e lógica Python (backend) | Derivar AMBAS da mesma regra (§4); teste de paridade automatizado. |
| `service_role` bypassa RLS em todas as rotas | `@require_action` obrigatório em toda rota service_role; review de diff. |
| Fail-open mantido | Tornar `require_module` fail-closed; auditoria de exceções. |
| Backfill de memberships incorreto | Mapping coarse determinável (`LEGACY_ROLE_TO_ID`); finos `NÃO DETERMINADO` → validação manual e migração reversível. |
| Regressão de UX (papéis locais vs server) | Feature-flag; manter leitura comp. com coleção local durante Fase 5. |
| Policy permissive legada vazando | Reusar checklist `029/034` (buscar `USING(true)` pós-deploy). |
| Auditoria por-RLS com custo/perf deadlock | Preferir auditoria no backend; RLS log via função besta (avaliar). |

---

## 17. Decisões Pendentes

> Apenas lacunas reais que o código não decide. Se o usuário considerar que não são reais, suprimem.

1. **`NÃO DETERMINADO PELO CÓDIGO`** — Super admin deve passar direto nas Actions de **dados de app** (ex.: `stock.item.create`) ou só nas de plataforma (`admin.*`, `workspace.*`)? Atualmente o RLS deixa super fazer tudo; o RBAC 2.0 pode estreitar.
2. **`NÃO DETERMINADO PELO CÓDIGO`** — Líder deve herdar/Action extra além de não-admin (`leaderId` display-only)?
3. **`NÃO DETERMINADO PELO CÓDIGO`** — `manageQr` vira Action `qrcode.manage` ou permanece flag?
4. **`NÃO DETERMINADO PELO CÓDIGO`** — Exceções intencionais de `require_module` fail-open (quais rotas permanecem abertas com módulo ausente)?
5. **`NÃO DETERMINADO PELO CÓDIGO`** — Auditoria por-RLS (função em policy) ou apenas backend?
6. **`NÃO DETERMINADO PELO CÓDIGO`** — `/api/reservas` GET público permanece aberto?

---

## Apêndice A — Mapa de evidências (arquivo:linha)

- `src/core/permissions/types.ts:1,15,18` — `AppAccessLevel`, `manageQr`, `leaderId`; import de `DEFAULT_ROLES/resolveRoleId`.
- `src/core/permissions/service.ts:82-93` — `resolveAppAccess` (super→full, override>role, none nega); `:106-112` `canWriteApp`; `:115-122` `canManageQr`; `:125-129` `requireWrite`; `createSyncService<Role>('roles')` `:6`.
- `src/core/permissions/usePermissions.ts:62-66` — `is_super_admin → 'full'`.
- `src/lib/sync.ts:120-129` — `LOCAL_ONLY_COLLECTIONS` (roles, audit_logs).
- `src/core/auth/AppGuard.tsx:30,57`; `src/core/auth/AdminGuard.tsx:19` — guardas de navegação.
- `src/apps/admin/pages/RolesPage.tsx:121-125,295-320,378` — edição de role, `leaderId`, placeholder "Futuro: Ações permitidas".
- `supabase/migrations/001:9-10`, `013`, `019:6`, `021`, `024`, `027`, `028` (`is_super_admin` autoritativa + REVOKE), `029`, `030` (TV device identity), `031`, `032`, `033`, `034`, `035` (tracking token).
- `api/app.py:78` (`require_tracking_token`), `:1087-1104` (`require_module` fail-open), `:2692-2705` (`_require_workspace_app_manager` role='admin' legado), `:1080-1084` (`_validate_device_id`), rotas TV/chamados/admin/backups/purge/audit.
- `src/apps/reservalab/api/auth.py` — `require_auth:269`, `require_workspace:309`, `require_module:372`, `require_admin:398` (is_super_admin), `require_cron:424`; `_get_user_profile` re-fetch server (SEC-03, `:511`).
- `src/apps/reservalab/api/app.py` — `/api/reservas:406` (sem auth), `/api/push/*:903-940` (`@require_auth`+`@require_module_auth('stock')`), rotas admin `:599,617,693` (`@require_admin`), cron `:747,1019,1105,1304`.

---
*Fim do documento. Somente este arquivo foi criado; nenhum código, migration, banco ou commit foi alterado.*
