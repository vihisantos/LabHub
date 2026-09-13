# RBAC 2.0 — Fase 9.0: Auditoria Membership ↔ Workspace

> **Status: CONCLUÍDA (read-only)** — nenhuma alteração de código, migrations ou banco nesta fase.
> **Escopo:** auditar a relação `profiles.workspace_ids` ↔ `memberships` e produzir o mapa completo de drift, consumidores e riscos.
> **Data:** 2026-09-08
> **Próximas fases:** 9.1-A (UUID fantasma), 9.1-B (unificação do helper RLS), 9.2 (migração frontend), eventual remoção do legado.

---

## 1. Objetivo

Fechar o maior gap arquitetural pendente da RBAC 2.0: o drift entre o modelo legado
(`profiles.workspace_ids` — associação global ao usuário) e o modelo RBAC 2.0
(`memberships` — relação explícita profile × workspace × role × status × managed_by).

Esta fase é **somente leitura**: auditar, catalogar e documentar. Nada é alterado.

---

## 2. Estado Atual da Arquitetura

### 2.1 Visão geral

```
profiles (workspace_ids, role, status, is_super_admin)
    │
    │  [TRIGGER 041+045: AFTER INSERT OR UPDATE OF
    │   status, role, workspace_ids, is_super_admin]
    │  SECURITY DEFINER → bypass RLS → sync determinístico
    │
    ▼
memberships (profile_id, workspace_id, role_id, status, managed_by)
    │
    │  [TRIGGER 045: BEFORE INSERT OR UPDATE OF managed_by]
    │  trg_memberships_manager_guard → mesmo workspace, gestor ativo, sem ciclos
    │
    ▼
membership_overrides (via CASCADE DELETE da membership)
```

### 2.2 Direção de sincronização

O fluxo é **one-way**: `profiles` → `memberships`.

- A migration `041_rbac2_sync_memberships.sql` cria o trigger
  `trg_profiles_sync_memberships` (AFTER INSERT OR UPDATE OF `status`, `role`,
  `workspace_ids`, `is_super_admin`) que mantém `memberships` derivadas de
  `profiles` de forma determinística.
- A migration `045` reescreve `sync_user_memberships` para incluir o mapeamento
  `lider`/`role-lider` → slug `lider`, e **explicitamente preserva `managed_by`**
  no `DO UPDATE`.
- O trigger **não escreve de volta** em `profiles`. `profiles` continua a fonte de true
  do acesso a workspaces para o frontend e para grande parte das RLS policies.
- `managed_by` é uma relação **per-workspace** entre memberships; sobrevive a
  mudanças de `status`/`role`/`workspace_ids`/`is_super_admin` do profile (o upsert
  do trigger não toca nessa coluna).

### 2.3 Mapeamento determinístico role → slug (036/040/041/045)

| `profiles.role` | slug em `roles` | cargo |
|-----------------|-----------------|-------|
| `technician` / `role-technician` | `tec` | Técnico |
| `viewer` / `role-viewer` | `vis` | Visualizador |
| `admin` / `role-admin` | `adm` | Admin de Workspace |
| `coordinator` / `role-coordinator` | `coordinator` | Coordenador Multiunidade |
| `lider` / `role-lider` | `lider` | Líder |
| qualquer outro / `NULL` | (sem membership) | sem cargo determinístico |

Regras do trigger (espelho da spec §8/§10):

- `status <> 'active'` → sem memberships;
- `is_super_admin = true` → sem memberships (Super Admin **não é cargo**);
- `role` desconhecida/null → sem memberships (determinístico);
- `workspace_ids` vazio → sem memberships (CASO 3 — estado seguro/bloqueado);
- `workspace_id` inexistente → ignorado (não aborta a trigger).

---

## 3. Consumidores de `profiles.workspace_ids` (legado)

| # | Consumidor | Camada | O que faz |
|---|-----------|--------|-----------|
| 1 | `user_belongs_to_workspace()` (033) | SQL/RLS | Helper usado em ~40+ policies RLS (profiles, workspaces, tickets, stock, tv, pcare, reservelab, assets...) |
| 2 | `WorkspaceContext.assignedWorkspaces` (WorkspaceContext.tsx:59,88) | Frontend | Filtra workspaces visíveis: `user.workspace_ids.includes(w.id)` |
| 3 | `useWorkspaceFilter` (useWorkspaceFilter.ts:11,18,26) | Frontend | Filtra itens e notificações por workspace do usuário |
| 4 | `workspaceStore.set()` (WorkspaceContext.tsx:162) | Frontend | Sincroniza o store de isolamento (localstorage) |
| 5 | `adminService.updateUserWorkspaces()` (adminService.ts:172) | Frontend/Admin | Super admin escreve assignments de workspace → PATCH profiles |
| 6 | `app.py:680` (legacy gateway) | Backend | `workspace_id not in workspace_ids` → check de auth do caminho legado |
| 7 | `SetupFlow` (tv-desktop:44-45) | Frontend | Filtra workspaces de TV para o dispositivo |
| 8 | `buildPushUser.ts:28` | Frontend | Propaga `workspace_ids` para o serviço de push |
| 9 | `authService.refreshProfile` (service.ts:296) | Frontend | Detecta mudança de `workspace_ids` e notifica listeners |
| 10 | `UsersPage.tsx:95` | Frontend/Admin | Exibe chips de workspaces do usuário |

---

## 4. Consumidores de `memberships` (RBAC 2.0)

| # | Consumidor | Camada | O que faz |
|---|-----------|--------|-----------|
| 1 | `rbac_can()` (rbac.py) | Backend | Enforcement: `_fetch_membership(profile_id, ws)` → role + overrides |
| 2 | `profile_visible_to_me()` (044) | SQL/RLS | Policy `profiles_select`: overlap de memberships ativas |
| 3 | `get_leader_team()` (045) | SQL/RPC | Equipe do líder: memberships com `managed_by` da membership dele |
| 4 | `get_coordinator_units()` (047) | SQL/RPC | Unidades sob coordenação (memberships ativas de coordenação) |
| 5 | `get_coordinator_leaders()` (047) | SQL/RPC | Lideranças subordinadas diretas ao coordenador na unidade |
| 6 | `get_memberships_by_manager()` (047) | SQL/RPC | Equipe de uma liderança na árvore do coordenador |
| 7 | `coordinator_set_manager()` (047) | SQL/RPC | Escrita escopada de `managed_by` (único caminho não-super) |
| 8 | `membership.ts` (canViewTeam/canManageTeam/canViewTeamMember) | Frontend | UI de Líder/Coordenador — lê `TeamMember.membership` |

---

## 5. As 7 Classes de Drift / Risco

### 5.1 — `workspace_ids` com UUID de workspace deletado (DRIFT REAL)

**Mecanismo:** delete de workspace → FK CASCADE deleta memberships → mas
`profiles.workspace_ids[]` **mantém o UUID morto** (nenhum trigger dispara em
`profiles` porque não houve UPDATE).

**Impacto:**
- `user_belongs_to_workspace(dead_uuid)` → **TRUE** (lê profiles, não valida
  existência do workspace);
- Frontend: workspace morto aparece na lista mas não tem dados → UI quebrada;
- RBAC engine: membership deletada → DENY correto;
- **Inconsistência:** RLS diz "pertence" mas RBAC diz "não pertence".

**Frequência esperada:** baixa (deletar workspace é raro, admin-only).

### 5.2 — Inconsistência entre helpers RLS (DESIGN gap)

**Mecanismo:** `user_belongs_to_workspace()` (033) lê `profiles.workspace_ids`,
enquanto `profile_visible_to_me()` (044) lê `memberships`.

**Consequência:** duas RLS policies no mesmo banco usam fontes diferentes para
decidir visibilidade:
- `profiles_select` usa memberships (044);
- `workspaces_select`, `tickets`, `stock`, `tv`, `pcare`, `assets` etc. usam
  `user_belongs_to_workspace` → workspace_ids.

Se houver drift (workspace deletado, membership manual), as decisões divergem.

**Risco:** médio. Hoje o trigger mantém consistência; o gap é arquitetural, não operacional.

### 5.3 — Frontend 100% workspace_ids — zero leitura de memberships

**Fato:** `WorkspaceContext`, `useWorkspaceFilter`, `workspaceStore`, `SetupFlow`,
`TvDesktopInstall`, `buildPushUser`, `UsersPage` — **todos** lêem
`user.workspace_ids`. Nenhum consome `memberships` para visibilidade.

**Consequência:** para migrar memberships como fonte de verdade, **todos esses
caminhos** precisam ser alterados (ou o trigger continua como ponte). É a maior
tarefa da Fase 9.

**Risco:** alto para o esforço de migração; baixo para segurança hoje (trigger sincroniza).

### 5.4 — `memberships.status` CHECK aceita valores mortos (DESIGN debt)

**Fato:** o CHECK (036) permite `'pending'`, `'active'`, `'suspended'`, `'removed'`.
Mas o trigger **sempre** escreve `'active'` e deleta o resto. Esses status são
dead-letter — impossíveis de persistir pelo fluxo normal.

**Impacto:** nenhum código consulta esses status (o RBAC engine checa
`status != 'active'` → DENY). É uma promise de funcionalidade (suspensão/remoção)
que nunca se materializou.

**Risco:** baixo (cosmético/debt documentado).

### 5.5 — Insert manual de membership sem `workspace_ids` (EDGE CASE)

**Mecanismo:** super admin insere membership diretamente no banco (bypass do
trigger, que só dispara em `profiles`).

**Impacto:** usuário tem membership ativa mas `workspace_ids` não inclui o workspace:
- Frontend: não vê o workspace no gate;
- `user_belongs_to_workspace` → pode divergir do RBAC engine;
- RBAC engine: membership existe → pode autorizar.

**Frequência esperada:** muito rara (exige acesso direto ao banco).

### 5.6 — Backend dual-enforcement (legacy vs RBAC_2)

**Mecanismo:**
- `app.py:680`: `workspace_id not in workspace_ids` → auth legado;
- `rbac.py:rbac_can()`: `_fetch_membership()` → RBAC 2.0.

Quando `RBAC_2_ENABLED=false` (default), só o legacy path roda. Quando habilitado,
os dois rodam (legacy como fallback, RBAC como gate).

**Risco:** se o trigger falhar ou houver drift, os dois caminhos decidem diferente.
Hoje OK (trigger funciona). Bomba-relógio se alguém desabilitar o trigger ou editar
`memberships` diretamente.

### 5.7 — Preservação de `managed_by` (CONFIRMADO CORRETO)

**Mecanismo:**
- `coordinator_set_manager` (047) → UPDATE `managed_by` na membership;
- `trg_profiles_sync_memberships` dispara **APENAS** em `UPDATE OF
  (status, role, workspace_ids, is_super_admin)` em profiles — **não dispara**
  em updates de memberships;
- se profiles é atualizado, o `DO UPDATE` do trigger preserva `managed_by`
  (explícito no 045).

**Invariante confirmado:** `managed_by` sobrevive a mudanças de role/status/
workspace_ids do profile. É um dos invariantes mais bem documentados do sistema.

---

## 6. Matriz de Risco Consolidada

| # | Drift | Severidade | Frequência | Mitigação atual | Esforço Fase 9 |
|---|-------|-----------|-----------|----------------|----------------|
| 1 | workspace_ids com UUID morto | **Média** | Rara | Nenhuma | Trigger de limpeza OU validação na UI |
| 2 | Helpers RLS inconsistentes | **Média** | Sempre (design) | Trigger sincroniza | Unificar helpers em memberships |
| 3 | Frontend 100% workspace_ids | **Alta** (migração) | Sempre | Trigger como ponte | Migrar ~10 caminhos |
| 4 | Status CHECK dead-letter | **Baixa** | Sempre (design) | RBAC engine ignora | Remover valores ou implementar |
| 5 | Membership manual sem workspace_ids | **Média** | Muito rara | Nenhuma | Reconcile job |
| 6 | Dual enforcement legacy/RBAC | **Alta** | Quando RBAC_2 enabled | Feature flag | Migrar app.py para memberships |
| 7 | managed_by preservação | **Baixa** | N/A (CORRETO) | Trigger 045 + 047 | Nenhuma (OK) |

---

## 7. Conclusão

O trigger `041+045` é **mais forte do que o esperado**: na prática torna `profiles`
a fonte de verdade e `memberships` uma **view materializada reativa**. O drift real
não é entre as duas tabelas (o trigger cuida), mas sim:

- **Arquitetural:** helpers RLS inconsistentes (workspace_ids vs memberships);
- **Operacional:** workspace deletado deixa UUID fantasma em workspace_ids;
- **Migratório:** o frontend inteiro depende de workspace_ids; memberships é ilha
  isolada (Líder/Coordenador + backend RBAC).

**Conclusão de sincronização:** `profiles → memberships` é atualmente o fluxo de
sincronização (one-way, via trigger 041+045).

**Invariantes do `managed_by` (confirmados):**
- mesmo workspace; gestor ativo; cargo de liderança;
- sem ciclos; sem lider→lider; coordenador é raiz da unidade;
- preservado nas re-sincronizações do trigger.

---

## 8. Recomendações para 9.1 e 9.2

**Prioridade imediata (9.1-A):** resolver o drift #1 — workspace deletado com
`workspace_ids` stale. Opção A: trigger AFTER DELETE em `workspaces` que limpa
`workspace_ids` dos profiles. Opção B: validação no frontend (ignorar UUIDs não
encontrados — já parcialmente feita). **Antes de criar trigger, confirmar que não
conflita com o mecanismo 041.**

**Prioridade alta (9.1-B):** unificar `user_belongs_to_workspace` para ler
`memberships` em vez de `workspace_ids` (#2). É o ponto de ancoragem de ~40+
RLS policies e resolve a divergência de autoridade de forma pontual.

**Prioridade alta (9.2):** migrar os ~10 caminhos frontend que lêem `workspace_ids`
para `memberships` (#3). O trigger pode continuar como ponte durante a migração.

**Prioridade média (limpeza):** decidir sobre `memberships.status` dead-letter (#4):
implementar suspensão/remoção ou remover do CHECK.

**Prioridade baixa (edge case):** adicionar reconcile job para memberships órfãs de
`workspace_ids` (#5), similar ao reconcile inicial da 041.

---

## 9. Execução

**Método:** auditoria somente leitura sobre o código-fonte e migrations — nenhum
arquivo, migration ou banco foi alterado. Sem testes executados nesta fase (nenhuma
mudança de runtime causada).
