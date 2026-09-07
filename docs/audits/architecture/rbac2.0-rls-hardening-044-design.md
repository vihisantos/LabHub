# ETAPA 044-B — Design Técnico da Migration 044 (RLS Hardening `profiles` + `workspaces`)

> **Documento de PROJETO — sem execução.** Nenhuma migration foi criada; nenhum SQL aplicado;
> nenhum ambiente Supabase alterado; nenhum dado, secret, deploy, commit, push ou PR executado.
> Issue #158 permanece aberta.
>
> Base: Discovery `docs/audits/architecture/rbac2.0-rls-hardening-044-discovery.md` + `main@b8da015`.
> PROD `ypkulvbllxgkjzhpzemf` (leitura-only para verificação de schema/grants/policies).

Data: 2026-09-07
Status: Aguardando revisão humana. **Não implementar sem aprovação explícita.**

---

## 1. Executive Summary

A Migration 044 substitui as policies de leitura permissivas `profiles_select USING(true)` e
`workspaces_select USING(true)` por policies fail-closed, consolida as policies de escrita de
`workspaces` (hoje na era `role='admin'` da migration 009 na PROD) para `is_super_admin()`, e introduz
a helper `profile_visible_to_me(uuid)` SECURITY DEFINER para o leiaute de perfis por membership.

Design em uma frase:

```text
profiles     : SELECT  -> id = auth.uid() OR is_super_admin() OR profile_visible_to_me(id)
               INSERT  -> WITH CHECK (id = auth.uid())            [inalterada]
               UPDATE  -> USING/WITH CHECK (id = auth.uid())      [inalterada]
               DELETE  -> USING (id = auth.uid())                 [inalterada]
               admin_abs_edit/delete -> is_super_admin()          [inalteradas]
workspaces   : SELECT  -> is_super_admin() OR user_belongs_to_workspace(id)
               INSERT/UPDATE/DELETE -> is_super_admin()           [consolidacao 009 -> 028]
```

Impacto:
- **Backend Flask: zero** (todos os acessos usam service key e bypassam RLS).
- **Frontend**: os 3 fluxos de leitura ampla continuam funcionando para quem tem direito
  (super admin por `is_super_admin()`; admins/colegas por membership overlap); o **único** corte real de
  visibilidade é o isolamento cross-workspace (objetivo da 044).
- **Realtime** (`ThemeContext` canal `profiles`): contrato preservado; o subscriber recebe apenas linhas
  legíveis por RLS.
- Risco principal: divergência entre `memberships` (036) e `profiles.workspace_ids` (legado). Mitigado
  por validação de contagem pré-aplicação + decisões de produto (Q1–Q5).

---

## 2. Discovery Inputs

Evidências verificadas em PROD/`main` (resumo do Discovery; detalhes no 044-A):

- `profiles_select USING(true)` e `workspaces_select USING(true)` ativas em PROD.
- PROD: `public.schema_migrations` registra apenas `035..043`; policies de workspaces na era 009
  (`EXISTS(profiles ... role='admin')`).
- `is_super_admin()`, `user_belongs_to_workspace(text/uuid)`, `can_access_tv_workspace(uuid)` possuem
  `GRANT EXECUTE` para `authenticated` na PROD (o REVOKE da 028 não está refletido — seed via baseline).
- Schema real de `profiles` (PROD, 15 colunas): `id, email, name, avatar, role, workspace_ids, created_at,
  updated_at, accent, theme_variant, status, app_access, banner, is_super_admin, home_mode`.
- Schema de `memberships` (036): `profile_id, workspace_id, role_id, status CHECK
  (pending|active|suspended|removed)`.
- Helpers atuais: `user_belongs_to_workspace` verifica **`profiles.workspace_ids`** (não memberships);
  `is_super_admin` lê `profiles.is_super_admin` de `auth.uid()`.
- Frontend: 11 usos de `from('profiles')`; 4 usos de `from('workspaces')` (mapas 3.1/4.1 do 044-A).
- Backend: 6 pontos de consulta a `profiles` e 12+ a `workspaces`, todos service key (imunes).
- `user_profiles` (responsável do Chamados) é coleção **local** IndexedDB (`src/lib/sync.ts:127`) — não
  é a tabela `profiles`; imune a RLS.

---

## 3. Security Objective

Objetivo único e mensurável:

```text
Eliminar USING(true) nas policies de leitura de profiles e workspaces,
impedindo qualquer vazamento cross-workspace de dados de usuários e campi,
SEMPRE preservando:
  (a) o fluxo do próprio usuário (perfil/signup/refresh/poll pending);
  (b) o fluxo de Super Admin (aprovações, edição, criação de workspaces);
  (c) o fluxo de membros do mesmo workspace (visibilidade de colegas e campi);
  (d) o backend Flask (service key) — sem mudança de contrato.
```

Princípios:
- **fail-closed**: por padrão, negar; liberar por regra explícita.
- **deny-by-default no RBAC2 continua** (não se altera `rbac.py`).
- **menor privilégio por atributo**: campos sensíveis (`email`, `is_super_admin`, ...) expostos apenas a
  quem os necessita (ver seção 7).
- **fontes autoritativas**: `memberships` (036) é a autoridade de "quem pertence a qual workspace" para
  autorização; `workspace_ids` é compat (legado) para o frontend UI.
- **não usar `USING(true)` nem wildcard** em nenhuma policy nova.

Adoption de mudança de comportamento: a 044 **não** deve quebrar nenhum fluxo atualmente legítimo em
single-workspace; o corte é apenas cross-workspace e para quem não é membro.

---

## 4. Profiles Authorization Model

### 4.1 Perfil próprio

```text
Regra: profiles.id = auth.uid()
```

Cobre: `fetchUserProfile` (`service.ts:219`), poll pending (`LoginPage.tsx:50`
`select('id','status') eq id`), `updateProfile` (`service.ts:204`), `createProfile` basic (`service.ts:251`).
Observação: `createProfile` INSERT já tem `WITH CHECK (auth.uid() = id)` — mantida; usuário recém-registrado
pode criar/ler seu próprio perfil antes de qualquer membership.

### 4.2 Usuários do mesmo workspace — `profile_visible_to_me(id)`

**Definição conceitual**: o usuário autenticado enxerga o perfil do `target` se, e somente se:

```text
target == auth.uid()
OU  auth.uid() é super admin (is_super_admin())
OU  existe workspace W tal que:
      membroship(ME, W).status = 'active'  AND  membroship(target, W).status = 'active'
```

Semânticas precisas:
- **membership ativa**: `public.memberships.status = 'active'`. As entradas `pending` (aguardando role),
  `suspended` e `removed` **não** conferem visibilidade.
- **`pending` de perfil**: a policy de perfis não filtra por `profiles.status`; trata-se apenas o status
  da *membership* na relação de visibilidade. Um perfil `active` **sem membership ativa** é visível
  somente a si mesmo e a super admins. Um perfil com `status='pending'` (aguardando aprovação) é visível
  a si mesmo (para o poll de status) e a super admins (para aprovar); a regra de mesmo-workspace não se
  aplica (ainda não tem membership).
- **usuário sem membership**: visível apenas a si mesmo e a super admins (opção rabbit: admin do workspace
  "herda" pendentes sem membership? — ver Open Decisions Q2; default = super admin only).
- **múltiplos workspaces**: basta **uma** membership ativa em comum
  (`EXISTS ... m_mine.workspace_id = m_other.workspace_id`). Usuários multi-workspace veem a união dos
  perfis de todos os seus workspaces ativos.
- **workspace inexistente / membership órfã**: nunca concede visibilidade (FK de `memberships.workspace_id`
  garante integridade; a consulta apenas não encontra overlap).
- **fonte canônica**: `public.memberships` (036). `profiles.workspace_ids` NÃO é usada na policy
  (é UI legacy); ver cross-check de contagem na seção 6 e Open Decision Q1.

### 4.3 Super Admin

Conceito inalterado: `is_super_admin()` (flag em `profiles.is_super_admin`, SECURITY DEFINER) → leitura
global de **todos** os perfis e workspaces; passa por cima de `profile_visible_to_me`. Não se altera a
definição da função nem o fluxo de aprovação.

---

## 5. `profile_visible_to_me()` Design

```sql
CREATE OR REPLACE FUNCTION public.profile_visible_to_me(target_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE           -- não escreve; chamável dentro de policies de SELECT
SECURITY DEFINER -- executa com privilégios do owner (postgres) para ler memberships
SET search_path = public
AS $function$
  SELECT
    target_user IS NOT NULL                       -- fail-closed: NULL/alvo inválido -> false
    AND (
      target_user = auth.uid()                    -- próprio perfil
      OR COALESCE((
        SELECT p.is_super_admin
        FROM public.profiles p
        WHERE p.id = auth.uid()
      ), false)                                   -- super admin -> tudo
      OR EXISTS (
        SELECT 1
        FROM public.memberships m_mine
        JOIN public.memberships m_other
          ON m_other.workspace_id = m_mine.workspace_id
        WHERE m_mine.profile_id = auth.uid()         -- coluna real da 036
          AND m_mine.status = 'active'
          AND m_other.profile_id = target_user
          AND m_other.status = 'active'
      )
    );
$function$;

-- Grants (ver seção 11): EXECUTE para authenticated e service_role.
```

> Coluna usada: em `public.memberships` (036) a coluna de usuário é **`profile_id`** (`uuid FK ->
> `profiles(id)`). O SQL acima já usa `m_mine.profile_id` / `m_other.profile_id` com
> `profile_id = auth.uid()` e `profile_id = target_user`.

### Justificativa SECURITY DEFINER e segurança

| Ponto | Decisão | Motivo |
|-------|---------|--------|
| `SECURITY DEFINER` | SIM | A função consulta `memberships`, tabela cuja RLS de leitura exige `is_super_admin() OR user_belongs_to_workspace(...)`. Como definer (owner = criador = `postgres`), ignora RLS e evita recursão: uma policy de `profiles` que lê `memberships` não pode depender de RLS própria de `memberships` (que por sua vez chama helpers). |
| Owner esperado | `postgres` (criador da migration via runner) | Sem owner-drop explícito; migrations do repo rodam com privilégio de postgres. |
| `search_path` seguro | `public` fixo, sem `$user` | Impede captura de objetos por schemas anteriores; todas as tabelas/functions referenciadas são qualificadas (`public.`), inclusive `auth.uid()`. |
| Privileges mínimos | EXECUTE para `authenticated` e `service_role`; REVOKE de `anon` e `PUBLIC` | Anon não chama; service_role mantém para compat; sem exposição a PUBLIC. |
| Prevenção de abuso | Não expõe dados; só retorna boolean; STABLE; sem parâmetro de workspace/role que permita pivotar | Usuário não consegue "espiar" colunas de profiles via função — a função só decide visibilidade de um `uuid`. |
| Tratamento de `NULL` | `target_user IS NOT NULL AND (...)` | Fail-closed: NULL → `false` (nunca vaza). |
| UUID inválido | UUID inválido não tipa para `uuid` em SQL (erro de conversão), e UUID inexistente simplesmente não cai no `EXISTS` → `false` | Fail-closed. |
| Alvo = próprio | `target_user = auth.uid()` → `true` (linha 1 do OR) | Idempotente com a regra de perfil próprio. |
| Sem membership em comum | `EXISTS` não encontra overlap → `false` | Cross-workspace negado. |
| Dependência circular | Profunda analisada na seção 12 (não há: helpers chamam alguma RLS? Não; `is_super_admin`/`user_belongs_to_workspace` são definer e leem `profiles`/`memberships` sob owner) | OK. |
| Retorno excessivo | Nenhum — apenas boolean | OK. |
| `STABLE` + linguagem SQL | Corpo "plain SQL"; indexável/planejável; sem loops | OK. |

---

## 6. Workspaces Authorization Model

```text
SELECT : is_super_admin()  |  user_belongs_to_workspace(workspaces.id)
INSERT : is_super_admin()            (consolidação 009-era)
UPDATE : is_super_admin()            (consolidação 009-era)
DELETE : is_super_admin()            (consolidação 009-era)
```

### Reutilizável: `user_belongs_to_workspace(uuid)`?

**Sim, diretamente, com 2 ressalvas documentadas:**

1. **Fonte de verdade = `profiles.workspace_ids`** (a função atual), não `memberships`. Isso significa que
   a visibilidade de workspaces é dada pelo array legacy de workspaces do perfil, alinhado com o filtro
   client-side do frontend (`WorkspaceContext.assignedWorkspaces` e `SetupFlow` usam `workspace_ids`).
   **Consistente** — boa notícia: a policy acompanha o que o frontend já filtra.

2. **Risco de drift**: se `workspace_ids` e `memberships` divergirem (ex.: membership removida mas array não
   limpo, ou vice-versa), o RLS de workspaces segue `workspace_ids`. A 044 deve incluir **cross-check de
   contagem pré-aplicação** (DEV): `count(who tem membership active)` vs `count(who tem workspace_ids not
   empty)`; se divergir, decidir (Open Q1) antes do merge. Em caso de manutenção de consistência a médio
   prazo, a 044 mantém o comportamento atual para não quebrar login/onboarding.

**Condição adicional necessária?** Não há necessidade de helper `workspace_visible_to_me` no momento:
a semântica "membro do workspace == membro contido no meu `workspace_ids`" é exatamente o modelo que o
frontend implementa hoje. (Se a decisão Q1 evoluir para `memberships`, então sim, trocar por uma helper
baseada em `memberships` — ver seção 17.)

Semânticas:
- **Super Admin**: vê todos (bypass por `is_super_admin()`).
- **múltiplos workspaces**: lista = meus `workspace_ids` (todos).
- **nenhum workspace (`workspace_ids = '{}'`)**: lista vazia — o `WorkspaceContext` já renderiza o estado
  "sem workspace" e o `pending` é bloqueado no Firewall Etapa 7.
- **UUID conhecido de outro workspace**: negado (não está no meu array).
- **workspace inexistente**: `workspace_ids` nunca o conterá (FK) — policy não avalia linha.
- **fail-closed**: sem array → `false`; NULL → a versão 033 já é NULL-negativa.

---

## 7. Sensitive Fields Analysis (campo a campo de `profiles`)

Classificação (para o relatório; **nenhuma mudança de schema** nesta etapa):

| Campo | Classificação | Exposto a (pós-044) | Justificativa |
|-------|---------------|---------------------|---------------|
| `id` | SAFE_FOR_NORMAL_READ | próprio + co-membros + super admin | chave; necessário em listas |
| `name` | SAFE_FOR_NORMAL_READ | próprio + co-membros + super admin | exibição de colegas |
| `avatar` | SAFE_FOR_NORMAL_READ | próprio + co-membros + super admin | foto de perfil |
| `accent` | SAFE_FOR_NORMAL_READ | próprio + co-membros + super admin | cor de exibição |
| `theme_variant` | SAFE_FOR_NORMAL_READ | próprio + co-membros + super admin | tema do card |
| `home_mode` | SAFE_FOR_NORMAL_READ | próprio + co-membros + super admin | layout do app |
| `banner` | SAFE_FOR_NORMAL_READ | próprio + co-membros + super admin | banner de exibição |
| `status` | SENSITIVE | próprio + super admin (aprovação) | pending/active — usado no poll próprio e na fila de aprovação |
| `role` | SENSITIVE | próprio + super admin (+ membros do ws apenas se decisão Q2) | autorização legada |
| `workspace_ids` | SENSITIVE | próprio + super admin | expõe em quais campi o user está |
| `app_access` | SENSITIVE | próprio + super admin (+ co-membros se decisão Q2 para admin ws) | mapeamento de apps |
| `email` | SENSITIVE | próprio + super admin (notificações exigem email) | PII |
| `is_super_admin` | ADMIN_ONLY | próprio + super admin | flag de privilégio amplo |

> Observação: a classificação é **conceitual** e entra no design da futura camada de leitura (seção 7.1).
> Com a policy da 044, uma linha legível expõe **todas as colunas** dela (RLS é por linha, não por coluna).
> Portanto, para atingir a classificação acima, seletores explícitos (alternativa 5) serão necessários a
> médio prazo — o alvo **realista** da 044 é restringir *linhas*, não *colunas*.

### 7.1 Decisão de arquitetura de leitura (alternativas)

| Alternativa | Prós | Contras | Decisão |
|-------------|------|---------|---------|
| 1. Manter `profiles` direto | zero mudança | ainda expõe colunas sensíveis por linha | **combinar (mínima)** |
| 2. Replace `select('*')` → selects explícitos | remove colunas sensíveis sem schema novo | precisa tocar os 11 usos frontend | **sim, fase 2** |
| 3. View segura | colunas controladas, um único objeto | "RLS em view" do Supabase tem limitações; manutenção | avaliar em Q2 |
| 4. RPC `user_search(...)` | controle fino + busca server-side | mais código backend/frontend | avaliar em Q4/Q5 |
| 5. RLS + selects explícitos | mínimo, imediato, compatível | colunas ainda existem no schema | **escolhido p/ 044** |

**Recomendação da 044**: Alternativa 5 (RLS endurecida AGORA + selects explícitos como fase 2).
Não criar views/RPCs nesta migration.

---

## 8. Frontend Impact

### 8.1 Fluxo 1 — Admin (Users / Roles / UserDetail / Notifications)

- **Hoje**: `listAllProfiles()` → `select('*')` sem filtro (filtro no client por workspace em
  `UsersPage`, `RolesPage`; `NotificationSendTab`/`RulesTab` filtram por `userHasAppAccess`/ws).
- **Pós-044**: a policy devolverá apenas: o próprio + co-membros ativos do(s) meu(s) ws + (super admin) todos.
  - Super admin: identidade de comportamento (vê todos). **nada muda.**
  - Admin/coordinator (`adm`) não-super: vê os perfis apenas do seu ws (não cross-ws). **correção
    desejada**; o filtro client-side deles continua válido (mesmo ws).
  - **Acesso real necessário por operação**:
    - `listAllProfiles` (lista usuarios): co-membros do ws (roles quem atende) → **PRECISA** de
      co-membros ativos; **GERA** (hoje) também pendentes cross-ws que devem migrar p/ super-admin-only;
    - approve/reject pendentes (`status='pending'`): **só super admin** — política de leitura já exclui
      pendentes de outros ws para não-super; backlink: se a UX do `adm` precisar listar pendentes, decisão
      Q2;
    - `setRole`/`updateUser` (`adminService.ts:141,158`): **super admin** (policy de update via
      `admin_abs_edit_profiles` is_super_admin — inalterada);
    - Notifications (`send`/`rules`): precisa de `email`+`name` dos alvos → para não-super os alvos são
      co-membros (ok); super admin envia para todos (ok).
  - **Mudança mínima proposta (não implementar agora)**: quando os admins não-super ainda precisarem ver
    "usuários sem ws ainda" (atribuição), adicionar à helper a condição "target sem membership MAS mesma
    ... " — apenas após decisão Q2. Em default, manter super-admin-only.

### 8.2 Fluxo 2 — WorkspaceContext / switcher (`workspaces/service.ts:34`)

- **Hoje**: `select('*').order('name')` → alimenta `local` (via `syncFromSupabase`) e o
  `WorkspaceContext` (switcher, gate, store de filtro).
- **Pós-044**: usuário não-super recebe **apenas seus workspaces** — o `assignedWorkspaces` (filtro
  client por `workspace_ids`) fica **redundante e idêntico**; super admin recebe todos.
- **Campos realmente necessários para o switcher** (`WorkspaceSwitcherSheet.tsx` usa `id, name, location,
  color`; `WorkspaceContext` usa `id, slug`; gate usa `name, location, color, disabled_apps,
  spreadsheet_url`; store usa `id` como chave):
  `id, name, slug, location, color, disabled_apps, spreadsheet_url, created_at, updated_at`.
- **Mudança mínima proposta (fase 2)**: trocar `select('*')` por `select('id,name,slug,location,color,
  disabled_apps,spreadsheet_url,created_at,updated_at')`. **Não é bloqueio da 044** (RLS restringe linhas,
  não campos), mas reduz superfície de PII de workspaces? — workspaces não têm PII; ainda assim é boa
  prática. Sem alteração funcional.

### 8.3 Fluxo 3 — TV SetupFlow (`SetupFlow.tsx:41`)

- **Correção de fato do Discovery**: **o fluxo NÃO consulta `profiles`** — consulta
  `supabase.from('workspaces').select('*').order('name')`. O usuário faz login, e `loadWorkspaces` filtra
  client-side: `if (!u.is_super_admin && u.workspace_ids.length > 0) assigned = all.filter(w =>
  u.workspace_ids.includes(w.id))`.
- **Pós-044**: para não-super o Supabase já devolve só seus workspaces → o filtro client vira no-op
  (comportamento idêntico). Super admin continua vendo todos na listagem para escolher (configuração de
  TV).
- **Campos usados**: `id, name, slug, location, color, disabled_apps, spreadsheet_url` (para renderização
  e para gravar `DeviceConfig`/activation).
- **Mudança mínima proposta**: nenhuma obrigatória para a 044 funcionar. Opcional fase 2: select explícito.
- **Obs**: fluxo `activation/create`/`devices/provision` é backend (service key) — imune.

---

## 9. Backend Impact

Nenhuma mudança. Todos os acessos a `profiles`/`workspaces` do Flask (`auth.py`, `api/app.py`,
`reservalab/api/app.py`) usam `SUPABASE_SERVICE_KEY` → RLS **não** se aplica (role `service_role`).

Lista de pontos imunes (verificada no Discovery):
- `_get_user_profile` / `_get_workspace` (auth.py:162/188/214) — ~26 rotas protegidas por `require_auth`.
- push subscribe/action/check-pending (reservalab app.py:526/722/734/1202).
- tv activation/redeem/provision (api/app.py:1249/1270/1366/1438/1458).
- chamados workspaces public (api/app.py:1954) e chamados create (2021).
- relatório semanal (3469), admin backups (3693), admin delete workspace (3800/3835).
- reservalab rooms seed (app.py:186/244).

Nota: `rbac.py` (engine RBAC2) também usa service key para ler perfil — imune. Nenhuma rota roda o
`select('*')` client com token de usuário no backend.

---

## 10. Proposed Policies (SQL conceitual — NÃO executado)

> O SQL abaixo é **referência de design**; será implementado na migration 044 após aprovação.

### 10.1 `profiles_select` (READ, perfil)

```sql
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.is_super_admin()
    OR public.profile_visible_to_me(id)
  );
```

- **Nome**: `profiles_select` | **Tabela**: `public.profiles` | **Operação**: SELECT
- **USING**: `id = auth.uid() OR is_super_admin() OR profile_visible_to_me(id)`
- **WITH CHECK**: N/A (SELECT não tem)
- **Quem pode**: usuário do próprio perfil; super admin; co-membros ativos via helper.
- **Justificativa**: próprio + autoridade + mesmo workspace; corta o `USING(true)`.
- **Risco**: se `memberships` não estiver populado no ws, membros não se veem (mitigado: cross-check Q1;
  fallback operator via super admin).
- **Teste**: `test_044_rls_profiles_select` — ver matriz seção 13.

### 10.2 `profiles_insert` / `profiles_update` / `profiles_delete` (inalteradas — documentadas)

```sql
-- SEM mudança: já são fail-closed (próprio) + admin_abs (super admin).
-- profiles_insert   : WITH CHECK (auth.uid() = id)
-- profiles_update   : USING/WITH CHECK (auth.uid() = id)
-- profiles_delete   : USING (auth.uid() = id)
-- admin_abs_edit/delete_profiles : is_super_admin()
```

### 10.3 `workspaces_select` (READ, workspace)

```sql
DROP POLICY IF EXISTS "workspaces_select" ON public.workspaces;
CREATE POLICY "workspaces_select"
  ON public.workspaces
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_belongs_to_workspace(id)
  );
```

- **USING**: `is_super_admin() OR user_belongs_to_workspace(id)`
- **Quem pode**: super admin (todos); qualquer usuário membro do workspace (via `workspace_ids`).
- **Justificativa**: o frontend já filtra por `workspace_ids`; a policy torna isso server-side.
- **Risco**: drift `workspace_ids` vs `memberships` (Q1); lista vazia para usuários sem ws (comportamento
  correto do gate).
- **Teste**: `test_044_rls_workspaces_select`.

### 10.4 `workspaces_insert/update/delete` (consolidação 009→028, se `role='admin'`):

```sql
DROP POLICY IF EXISTS "workspaces_insert" ON public.workspaces;
CREATE POLICY "workspaces_insert"
  ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "workspaces_update" ON public.workspaces;
CREATE POLICY "workspaces_update"
  ON public.workspaces FOR UPDATE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "workspaces_delete" ON public.workspaces;
CREATE POLICY "workspaces_delete"
  ON public.workspaces FOR DELETE TO authenticated
  USING (public.is_super_admin());
```

- **Justificativa**: a PROD ainda está na era 009 (`role='admin'`). A 044 consolida para `is_super_admin()`
  — inclusive preservando o intent da 028 que nunca foi aplicada em PROD. `workspaces` tem poucos
  registros (3); criação é operação de plataforma (super admin).
- **Risco**: se houver um admin de workspace que hoje cria workspaces via UI com `role='admin'` e que não
  seja super admin, perde a ação (decisão: workspaces são campi/escolas — plataforma-level; super admin).
  Teste de regressão de gate deveria confirmar `canCreate` só para super admin.

### 10.5 Resumo de eliminação de `USING(true)`

| Policy | Antes | Depois |
|--------|-------|--------|
| `profiles_select` | `USING(true)` | remove |
| `workspaces_select` | `USING(true)` | remove |

---

## 11. Proposed Grants

```sql
-- Helper nova
REVOKE  EXECUTE ON FUNCTION public.profile_visible_to_me(uuid) FROM anon, PUBLIC;
GRANT   EXECUTE ON FUNCTION public.profile_visible_to_me(uuid) TO authenticated;
GRANT   EXECUTE ON FUNCTION public.profile_visible_to_me(uuid) TO service_role;

-- Requisitos já existentes (VERIFICAR/Preservar na PROD):
-- is_super_admin()            -> EXECUTE para authenticated (confirmado na PROD)
-- user_belongs_to_workspace() -> EXECUTE para authenticated (confirmado na PROD)
```

| Função | Assinatura | Grant | Necessário porque | Risco de exposição |
|--------|-----------|-------|-------------------|--------------------|
| `profile_visible_to_me` | `(uuid) returns boolean` | `authenticated`, `service_role` | policies chamam dentro do contexto do usuário | Baixo: retorna boolean; usa `public.`; fail-closed; sem acesso a dados além do decidir |
| `is_super_admin` | `() returns boolean` | `authenticated` (já existe) | policies `profiles_select`, `workspaces_*` e `admin_abs_*` a chamam no contexto do request | Baixo: boolean derivado do próprio auth.uid() |
| `user_belongs_to_workspace` | `(uuid) returns boolean` | `authenticated` (já existe) | policy `workspaces_select` | Baixo: boolean; dependente de `workspace_ids` próprio |

> Atenção: **não** deve-se revogar EXECUTE de PUBLIC em `is_super_admin`/`user_belongs_to_workspace` sem
> replicar GRANT a `authenticated` (lição 028 — na PROD o grant sobreviveu; em ambientes "limpos" um
> REVOKE órfão quebraria as policies).

---

## 12. SECURITY DEFINER Security Review

1. **`search_path` inseguro**: todas as functions definem `SET search_path = public` (fixo, sem `$user`,
   sem variável). Referências qualificadas `public.*` e `auth.uid()`.
2. **Resolução de objetos por schema**: nomes de tabelas plenamente qualificados (`public.memberships`,
   `public.profiles`); sem dependência de search_path do caller.
3. **Privilege escalation**: as helpers são definer, mas (a) não aceitam DDL/SQL do caller; (b) retornam
   apenas `boolean`; (c) o único dado lido é membership/profiles sob owner; (d) `GRANT EXECUTE` apenas a
   authenticated/service_role (não anon/PUBLIC). Não há como o usuário forçar leitura arbitrária.
4. **Acesso indireto cross-workspace**: a helper só retorna true se há membership ativa comum. Não há
   parâmetro de workspace que permita "provar" outro ws (o overlap é derivado das memberships do próprio
   `auth.uid()`). Cross-workspace → `false`.
5. **Funções chamáveis diretamente pelo usuário**: sim, `authenticated` pode executar
   `profile_visible_to_me(x)` via REST `rpc`? — apenas se exposto. Recomendação: **não** expor RPC
   dedicado; se exposto, o pior resultado é `true/false` (sem vazamento de campo). Não criar rota SQL RPC
   na 044. (O Supabase expõe funções `SELECT` como RPC; o impacto é nulo porque retorna boolean.)
6. **Retorno excessivo de dados**: só boolean; nenhum json/aggregate.
7. **Dependência circular entre helpers e RLS**:
   - `is_super_admin()` → lê `profiles` sob owner (definer). Policy de `profiles` a chama → sem ciclo
     (definer não reavalia RLS de profiles no mesmo nível? A chamada da policy roda sob o usuário da
     query; a FUNCTION é definer → roda sob postgres → leitura própria OK).
   - `user_belongs_to_workspace()` → lê `profiles.workspace_ids` sob owner; usada na policy de
     `workspaces`. Sem ciclo.
   - `profile_visible_to_me()` → lê `memberships` sob owner; usada na policy de `profiles`. Sem ciclo
     (a leitura de `memberships` pela function não é filtrada pela RLS de `memberships` pois é definer).
   - `handle_new_user()` trigger (001) — definer, insere em profiles no signup: permanece; policy
     `profiles_insert` with-check `auth.uid()=id` é satisfeita na criação? O trigger roda como o usuário
     que faz a sessão (auth.uid() = id do signup) — já funciona hoje; sem mudança.
   - **Sem ciclos**: confirmado.

Fail-closed adicional: caso `profile_visible_to_me` falhe por erro (função inexistente, schema), a policy
`profiles_select` continua a conceder via `id = auth.uid() OR is_super_admin()` mas NÃO concede a ninguém
por overlap (erro na call → a cláusula OR com erro leva a erro de query, não vazamento). Em qualquer
cenário, `USING(true)` não regressa.

---

## 13. Adversarial Test Matrix

> Resultado esperado `ALLOW`/`DENY` — testes a criar na fase de implementação (não agora).

### Profiles

| # | Cenário | Request | Resultado esperado |
|---|---------|---------|--------------------|
| P1 | Próprio perfil | `select * from profiles where id = auth.uid()` | **ALLOW** |
| P2 | Co-membro ativo (mesmo ws, ambos `status='active'` na membership) | `where id = <co-membro>` | **ALLOW** |
| P3 | Outro workspace (sem overlap) | `where id = <user de outro ws>` | **DENY** |
| P4 | Múltiplos workspaces — alvo em ws em que sou membro | `where id = <alvo em ws1>` | **ALLOW** |
| P5 | Sem membership (perfil existe, sem membership) | `where id = <perfil sem membership>` | **DENY** (próprio/super admin exceto) |
| P6 | Membership `pending` | `where id = <alvo com membership pending>` | **DENY** |
| P7 | Workspace inexistente | `where id = <alvo cujo único ws não existe>` | **DENY** (FK impede, mas teste de robustez) |
| P8 | Usuário inexistente | `where id = '000...000'` | **DENY** (vazio) |
| P9 | Super Admin | `select * from profiles` | **ALLOW** (todos) |
| P10 | Super Admin em otro ws não pertencente | qualquer `id` | **ALLOW** (bypass) |
| P11 | Próprio UPDATE / avatar | `update profiles set avatar=... where id=auth.uid()` | **ALLOW** |
| P12 | UPDATE em perfil de outro não-super | `update profiles set role=... where id=<outro>` | **DENY** |

### Workspaces

| # | Cenário | Request | Resultado esperado |
|---|---------|---------|--------------------|
| W1 | Próprio workspace (membro via `workspace_ids`) | `select * from workspaces where id = meu.ws` | **ALLOW** |
| W2 | Outro workspace (não membro) | `where id = <ws de outro>` | **DENY** |
| W3 | Múltiplos workspaces | `select * from workspaces` (lista) | **ALLOW** (todos os meus) |
| W4 | Nenhum workspace | `select * from workspaces` | **DENY** (vazio) |
| W5 | Super Admin | `select * from workspaces` | **ALLOW** (todos) |
| W6 | UUID conhecido de outro ws | `where id = <ws conhecido não meu>` | **DENY** |
| W7 | INSERT workspace (não-super) | `insert into workspaces ...` | **DENY** |
| W8 | INSERT workspace (super admin) | `insert ...` | **ALLOW** |
| W9 | DELETE workspace (não-super) | `delete from workspaces where id=...` | **DENY** |
| W10 | UPDATE workspace (super admin) | `update ...` | **ALLOW** |

### Ataques

| # | Ataque | Request | Resultado esperado |
|---|--------|---------|--------------------|
| A1 | UUID manipulation (enumerar ids de outros ws) | `where id = <uuid qualquer>` | **DENY** (sem overlap) |
| A2 | Cross-workspace SELECT (query direta) | `select email from profiles where id=<user de outro ws>` | **DENY** |
| A3 | JOIN (indireto cross-ws) | `select p.email from chamados_tickets ... join profiles p on ...` | **DENY** se a linha de profiles não for legível; sem vazamento |
| A4 | RPC (função exposta) | `select profile_visible_to_me('<uuid>')` | **ALLOW** (retorna bool; sem vazamento de dados) |
| A5 | View | `select * from public.<view que lê profiles>` | **DENY** (view honra RLS da tabela base) |
| A6 | Acesso direto via Supabase client (`defaultDb`) | `defaultDb.from('profiles').select('*')` | **DENY** (RLS server-side) |
| A7 | Sem capability (sem membership) | qualquer select em profiles/workspaces | **DENY** |
| A8 | Sem membership mas super admin do RBAC2 | select em profiles de outro ws | **DENY** (super admin é flag de profiles, não membership); SE flag = sim → **ALLOW** |
| A9 | Realtime channel `profiles` | subscriber não-membro | **DENY** (RLS filtra eventos legíveis) |
| A10 | Poll pending (`LoginPage`) | `select('id','status') eq id próprio` | **ALLOW** |

> Definição: "membroship válida" nos testes = `public.memberships.status='active'` para a helper de
> profiles; para workspaces, a regra usa `workspace_ids` (função existente).

---

## 14. Regression Test Plan (após implementação)

**Backend / RLS (pytest — `api/tests/`):**
- `test_044_rls_hardening_migration.py` (estrutural: policies/grants/helper presentes, sem `USING(true)`).
- `test_044_helper_sql_review.py` (definer, search_path, fail-closed, membros overlap).
- `test_workspace_isolation.py`, `test_auth_layer.py`, `test_rbac*.py`, `test_chamados_ownership.py`,
  `test_push_isolation.py`, `test_tv_provisioning.py`, `test_spreadsheet.py` — permanecer verdes (falso
  positivo = RLS quebrando fluxos legítimos).

**Frontend (Vitest):**
- `WorkspaceContext.test.tsx` (gate, assignedWorkspaces, pending firewall).
- `workspaces/service.test.ts` (fetch/sync — mock RLS assert de `select` não `select('*')` se fase 2).
- `UsersPage.test.tsx`, `RolesPage.test.tsx`, `UserDetailPage.test.tsx`, `NotificationSendTab`,
  `NotificationRulesTab` — comportamento com lista reduzida.
- `LoginPage*.test.tsx` (poll pending).
- `TicketDetail.test.tsx` (responsável usa `user_profiles` local — deve permanecer green sem tocar RLS).
- typecheck + lint (tsc, eslint) — `select('*')` explicito (fase 2) altera type de retorno.

**Cross-workspace / fail-closed (integração):**
- Script adversarial (estilo `scripts/e2e_*` do repositório): usuário `vis` de WS-A tenta ler perfil de
  WS-B via Supabase client → espera 0 linhas (não 42501, não dados).
- Mesma rotina para workspaces (W2/W4/W6), para super admin (P9/W5) e para membership pending (P6).

**Validação funcional manual:**
- Login super admin: aprovar pendente, editar role, criar workspace (workflow de hoje intacto).
- Login admin de ws: ver Users/Roles do próprio ws apenas.
- Login vis: switcher mostra só seus campi; TV SetupFlow mostra só seus campi.
- Backend: rotas de push/TV/chamados/report funcionam (service key).

---

## 15. DEV → STAGING → PROD Rollout

```text
Design (este doc)
  -> Review humano (aprovação obrigatória)
  -> Implementação (migration 044 + testes)
  -> DEV: aplicar migration; rodar adversarial matrix (seção 13) + regression backend/frontend
  -> RLS adversarial tests (A1–A10) — confirmar nenhum vazamento
  -> Frontend regression (Vitest + tsc + lint + WorkspaceContext/Admin/TV)
  -> STAGING: replica da PROD (dados sanitizados); full regression (`pytest api` completo)
  -> PR para main (com a migration 044 + testes + este relatório de referência)
  -> MAIN merge -> workflow `Migrations` aplica automaticamente (runner idempotente; a migration
     precisa estar 100% validada ANTES do merge — não há gate posterior)
  -> PROD: aplicar via pipeline; healthcheck + deployment events; verificar policies em PROD via
     `pg_policies` (SELECT) e grants via `pg_proc.proacl`
  -> Post-deployment audit: nova rodada da auditoria (behavioral RBAC2 + RLS adversarial em PROD),
     fechar Issue #158 após confirmação; 48h de observação
```

Pontos de atenção:
- O workflow `Migrations` (`.github/workflows/migrations.yml`) pode aplicar a 044 automaticamente após
  merge — por isso **o PR deve já incluir todos os testes** e o merge não deve acontecer sem CI verde.
- Ordem de ambiente: aplicar 1º em DEV, 2º STAGING, 3º PROD (via PR). Não aplicar SQL manual fora do
  pipeline.

---

## 16. Rollback Strategy

**Não executar rollback agora; nenhum SQL/banco alterado.** Documentação do plano:

Se, após aplicação em DEV/STAGING/PROD, algo quebrar (ex.: membros não se enxergam por `memberships`
vazio; super admin perdeu acesso; fluxo de atribuição quebro):

- **Revert simples NÃO é aceitável**: restaurar `USING(true)` reintroduz o débito #158 — apenas como
  partida de emergência com análise de risco prévia e registro de incidente. RLS é mudança de segurança;
  "rollback = voltar ao bug" precisa de aprovação explícita.
- **Rollback primário (migration reversa 044-rollback / 045)**: migration append-only que restaura as
  policies originais EXATAS (para `profiles_select`/`workspaces_select` o estado 006/009-legacy) — mas
  **não** recomendada a não ser como último recurso, pois reverte também o objetivo de segurança.
- **Rollback correcional (preferido)**: aplicar **correção de policy/migration** pequena (ex.: ajustar
  helper para usar `workspace_ids` em vez de `memberships` — ver Q1 — ou adicionar condição para
  `usuários sem ws`). Mais rápido e dirigido que reverter o mundo.
- **Sem novo deploy de código**: RLS/policies vivem no banco; o "deploy" é aplicar a migration reversa
  ou a correção via pipeline (novo merge/PR). O frontend não muda nesta etapa (excepto fase 2/seletores
  explícitos), então não há binário para rebobinar.
- **Sequência de decisão**: (1) avaliar impacto (leitura vs escrita; quais fluxos); (2) escolher
  correção dirigida; (3) se inaceitável, aplicar 045-restauração após aprovação; (4) reportar incidente
  e reabrir #158 se regrediu.

---

## 17. Open Product Decisions

| # | Decisão | Opção default (recomendada) | Impacto |
|---|---------|------------------------------|---------|
| Q1 | Fonte de pertença ws: `memberships` (autoritativa RBAC2) vs `workspace_ids` (legado) | **Aguardar cross-check de contagem; manter `workspace_ids` na policy de workspaces (compat) e `memberships` na helper de profiles. Se divergirem >0, discutir antes do merge.** | Alinhamento futuro; drift momentâneo documentado |
| Q2 | Usuários sem membership/`pending` visíveis a quem na página Admin? | **Super admin only** (default fail-closed). Se produto exigir "admin de ws atribui membros novos", estender helper com condição específica | UX de atribuição |
| Q3 | TV SetupFlow: operador TV (`opv`) deve ver apenas seus campi? | **Sim** (já filtra); manter | Corrige conf. tv hoje |
| Q4 | Realtime `profiles` assinado por todos vs só super admin | **Hoje em dia todo autenticado assina; com RLS restritiva, eventos são filtrados. Opcional: restringir subscription no `ThemeContext` por `is_super_admin`** | Menor: privacidade do canal |
| Q5 | Fase 2: substituir `select('*')` por selects explícitos? | **Sim, fase 2 separada** (não bloquear 044) | Menos superfície de colunas |

---

## 18. Final Recommendation

1. **Implementar a Migration 044** exatamente com o design das seções 10–12, precedida por:
   - cross-check de contagem `memberships.active` vs `workspace_ids` (DEV) — resolver Q1 se divergir;
2. **Não** criar views/RPCs agora; manter RLS + selects explícitos (fase 2) como arquitetura de leitura.
3. **Não** alterar `profiles_insert/update/delete` próprias nem `admin_abs_*`; consolidar apenas
   `workspaces_*` (009→028) e as duas policies de lectura.
4. **Grants**: garantir EXECUTE p/ `authenticated` de `profile_visible_to_me` (e manter os existentes de
   `is_super_admin`/`user_belongs_to_workspace`).
5. **Testes**: criar `test_044_*` estruturais + repetir adversarial matrix (seção 13) e full regression
   (seção 14) em DEV/STAGING antes do PR.
6. **Rollout**: aplicar via pipeline (DEV→STAGING→PROD), audit pós-aplicação, fechar #158 após confirmação.

**Critério de sucesso — resposta direta:**

> **Qual SQL implementar na 044:** o bloco das seções 10.1 (profiles_select), 10.3 (workspaces_select),
> 10.4 (workspaces_insert/update/delete) + criação da helper `profile_visible_to_me(uuid)` (seção 5) +
> grants (seção 11).
> **Por que cada policy existe:** para tornar o isolamento cross-workspace efetivo no nível de banco
> (fail-closed), eliminando os dois `USING(true)` e consolidando a era 009 nas escritas de workspaces.
> **Quem pode ler cada linha:** (profiles) próprio | super admin | co-membros ativos; (workspaces)
> super admin | membros do próprio `workspace_ids`.
> **Quais campos podem ser expostos:** por linha legível, todos os 15 campos da tabela; classificação da
> seção 7 orienta a fase 2 (selects explícitos) para reduzir colunas sensíveis a quem tem direito.
> **Quais fluxos frontend mudam:** nenhum comportamento quebra para super admins e membros; admins não-super
> passam a ver só seu ws (correção); fase 2 troca `select('*')` por selects explícitos nos 3 fluxos.
> **Quais testes provam ausência de vazamento cross-workspace:** matriz P3/A1/A2/A6/A9 (adversarial) +
> `test_044_*`, todos com resultado esperado explícito ALLOW/DENY, executados em DEV/STAGING/PROD.

---

## Apêndice A — Confirmação de não-alteração (ETAPA 044-B)

Confirmado:

- ✗ Nenhum SQL foi aplicado (nem em DEV, nem STAGING, nem PROD).
- ✗ Nenhuma migration foi criada (`supabase/migrations/044_*.sql` NÃO existe).
- ✗ Nenhum ambiente Supabase foi alterado (somente SELECTs via Management API read-only p/ schema/grants/
  policies).
- ✗ Nenhum dado foi alterado (nada de INSERT/UPDATE/DELETE).
- ✗ Nenhum deploy foi feito.
- ✗ Nenhum secret/env foi alterado.
- ✗ Nenhum commit foi criado; nenhum push foi feito; nenhuma PR foi aberta.
- ✓ Issue #158 **permanece aberta**.
- ✓ Nenhum frontend/backend/arquivo de código alterado (nem test, nem seletores).

`git status` final:

```text
 M docs/architecture/rbac2.0-etapa7-activation.md          (da etapa anterior da auditoria)
?? docs/audits/architecture/rbac2.0-prod-audit-2026-09.md  (da auditoria pós-produção)
?? docs/audits/architecture/rbac2.0-rls-hardening-044-discovery.md
?? docs/audits/architecture/rbac2.0-rls-hardening-044-design.md   (ESTE documento)
?? screenshots/                                              (pré-existente)
?? scripts/...                                               (pré-existente, scripts de auditoria)
```

**Entregável para revisão humana: este relatório técnico.**

**Aguardando aprovação explícita antes de qualquer implementação.**