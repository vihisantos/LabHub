# RBAC 2.0 — Fase 9.1: Desenho Técnico (Membership & Workspace Integrity)

> **Status: APROVADO COM AJUSTES — versão revisada (v2, aguardando autorização do SQL).**
> **NENHUMA ALTERAÇÃO foi feita:** nenhuma migration foi criada, nenhuma migration
> existente foi editada, nenhum código foi alterado, nada foi aplicado no DEV,
> nenhum banco foi tocado, nenhuma alteração de push foi feita.
> **Fase 9.2 (migração do frontend) fica FORA deste documento.**
> **Fonte:** `docs/audits/rbac2.0-fase-9.0-membership-workspace-audit.md` (commit `ba801a1`).
> **Commit do design inicial:** `5a4d3d5`.
> **Data:** 2026-09-08

---

## 1. Escopo e Regras desta etapa

- **9.1-A** — impedir UUIDs fantasma em `profiles.workspace_ids` após exclusão de workspace.
- **9.1-B** — unificar `user_belongs_to_workspace()` para usar `memberships` como fonte de verdade.
- O frontend (consumidor de `workspace_ids`) **NÃO é migrado** nesta fase (fica para a 9.2).
- `profiles.workspace_ids` continua como coluna legada e continua sendo escrita pelo
  fluxo de aprovação/admin (o trigger 041 continua derivando membroships a partir dela).

---

## 2. 9.1-A — UUIDs fantasmas

### 2.1 Estado atual

- `profiles.workspace_ids` é `UUID[] DEFAULT '{}'` (009). É um array simples **sem
  constraint de FK** para `workspaces(id)`.
- `workspaces` (009/028) não tem coluna `is_active`/`status` nem desativação soft:
  a única forma de "remover" um workspace é `DELETE`.
- `DELETE FROM workspaces` dispara **CASCADE** sobre:
  - `memberships` (036: `workspace_id REFERENCES workspaces ON DELETE CASCADE`);
  - `roles` workspace-scoped (036: `workspace_id REFERENCES workspaces ON DELETE CASCADE`);
  - e demais tabelas `workspace_id` (tickets, stock, pcare, tv, tablet_reservations, ...).
- **Nenhum trigger dispara em `profiles`** quando um workspace é deletado: o array
  `workspace_ids` não tem FK, então o banco não "sabe" que deve limpá-lo.

### 2.2 Problema

Após `DELETE FROM workspaces WHERE id = X`:

1. `profiles.workspace_ids` mantém `X` em todos os perfis em que aparecia;
2. `user_belongs_to_workspace(X)` (que lê `profiles.workspace_ids`, ver 9.1-B) continua
   retornando `true` → as ~40+ policies que dependem dela passam a "ver" um workspace que não existe;
3. o RBAC engine (`_fetch_membership`) encontra membership deletada → `false`/DENY;
4. **divergência de autoridade**: RLS libera, RBAC nega; a UI mostra um workspace morto.

### 2.3 Impacto nos mecanismos existentes

**Trigger 041 (profiles → memberships):**
- Dispara em `INSERT or UPDATE OF (status, role, workspace_ids, is_super_admin)` em `profiles`.
- Um `DELETE FROM workspaces` **não toca** `profiles` → o trigger 041 **não dispara**,
  e as memberships do workspace deletado já foram removidas pelo CASCADE.
- **Portanto, não há recursão** entre um possível trigger de limpeza em `workspaces`
  e o trigger 041: são gatilhos em tabelas e colunas distintas.

**Trigger 045/046 (guarda de `managed_by`):**
- Dispara em `memberships` (`UPDATE OF managed_by, workspace_id` + INSERT). Não tem relação
  com `profiles`.workspace_ids. O CASCADE de workspaces já removeu as memberships órfãs;
  `managed_by` com `ON DELETE SET NULL` se resolve sozinho (fail-closed).
- A limpeza de `workspace_ids` em `profiles` **não dispara** a guarda 045/046 (ela é de memberships).

**RLS:**
- As policies que usam `user_belongs_to_workspace` se beneficiam da limpeza (o UUID morto deixa
  de conceder acesso). Nenhuma policy nova é necessária; a limpeza remove o UUID do array.

### 2.4 Decisão arquitetural proposta

**Trigger `AFTER DELETE` em `public.workspaces`** que remove o UUID deletado de
`profiles.workspace_ids` (usando `array_remove`) — SECURITY DEFINER, `search_path = public`,
idempotente.

Soluções alternativas consideradas:

| Alternativa | Prós | Contras | Veredito |
|-------------|------|---------|----------|
| **A. Trigger AFTER DELETE em `workspaces`** | Cobre todos os caminhos de delete do app + service_role; local e determinístico; não depende de código | Precisa SET search_path e cuidado com RLS (SECURITY DEFINER) | **ESCOLHIDA** |
| B. Trigger AFTER DELETE em `memberships` | — | `memberships` já é CASCADE, dispara por linha; não resolve o array em `profiles` (arrays não têm FK) | Rejeitada |
| C. Sanitização no frontend (ignorar UUIDs não encontrados) | Sem SQL | Não resolve RLS (que roda no banco); adia o real problema; inconsistente | Rejeitada p/ 9.1 (poderia ser mitigação adicional na 9.2) |
| D. FK array + `ON DELETE` (tipo `uuid[] REFERENCES`) | — | PostgreSQL não suporta FK em array; exigiria tabela de junção normalizada (quebra compat) | Rejeitada (mudança de schema grande) |
| E. Reconcile job (cron/RPC) | sem trigger | não reativo; precisa de execução externa popups | Rejeitada (deixa janela de drift) |

**Justificativa da escolha (A):** é reativa, cobre todos os caminhos de escrita do banco e
elimina a janela de drift sem exigir mudança de schema nem coordenação externa. Um trigger
AFTER DELETE por statement (não FOR EACH ROW) é suficiente e barato.

### 2.5 SQL proposto (SOMENTE PROPOSTA — não aplicar)

```sql
-- 9.1-A: limpar UUID fantasma em profiles.workspace_ids quando um workspace é excluído.
CREATE OR REPLACE FUNCTION public.trg_purge_workspace_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET workspace_ids = array_remove(COALESCE(workspace_ids, ARRAY[]::uuid[]), OLD.id),
         updated_at    = now()
   WHERE OLD.id = ANY (COALESCE(workspace_ids, ARRAY[]::uuid[]));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspaces_purge_workspace_ids ON public.workspaces;
CREATE TRIGGER trg_workspaces_purge_workspace_ids
  AFTER DELETE ON public.workspaces
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_purge_workspace_ids();

REVOKE ALL ON FUNCTION public.trg_purge_workspace_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_purge_workspace_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.trg_purge_workspace_ids() TO authenticated;
```

**Interação com o trigger 041:** a limpeza atualiza `profiles.workspace_ids` (remove o UUID).
Isso **dispara** o trigger 041 (`UPDATE OF workspace_ids`) — que vai rodar `sync_user_memberships`
e (re)calcular memberships. Para o workspace deletado não há membership para recriar (cascade já
removeu; `WHERE EXISTS (workspaces)` evita recriar), então o 041 refaz o idempotente e o conjunto
alvo fica correto. **Não há recursão infinita**: nada em 041 volta a escrever em `workspaces`.

⚠️ **Ponto de atenção para revisão:** o trigger 041 (SECURITY DEFINER) ao ser disparado pela
limpeza fará INSERT/UPDATE/DELETE em `memberships` sob `postgres`. Isso é o comportamento já
esperado do fluxo `profiles → memberships`; a guarda 046 não bloqueará (não há UPDATE de
`managed_by`/`workspace_id` por esse caminho). Confirmar sem impacto de performance em delete
em massa de workspaces.

### 2.6 Ordem de execução (após aprovação da revisão)

1. Criar migration `048_rbac2_purge_stale_workspace_ids.sql` com o conteúdo acima.
2. Teste de regressão (SQL): reproduzir o cenário de exclusão e validar limpeza.
3. Rodar o runner de migrations no DEV + testes estáticos.

### 2.7 Rollback

`DROP TRIGGER trg_workspaces_purge_workspace_ids ON public.workspaces; DROP FUNCTION
public.trg_purge_workspace_ids();` — não altera dados existentes (é idempotente e reversível).

### 2.8 Matriz de impacto (9.1-A)

| Alvo | Impacto |
|------|---------|
| `profiles.workspace_ids` | remove UUID do workspace deletado (correção) |
| `memberships` | já removidas por CASCADE; nada a fazer |
| Trigger 041 | re-dispara `sync_user_memberships` (idempotente, sem drift) |
| `managed_by` | intacto (CASCADE + ON DELETE SET NULL já resolvem); guarda 046 não é acionada |
| RLS | policies que leem `user_belongs_to_workspace` param de "ver" o workspace morto |
| Frontend | melhora (menu deixa de listar workspace morto); não é alterado nesta fase |
| Delete em massa | uma UPDATE por statement via array (barata; FOR EACH STATEMENT) |

### 2.9 Casos de teste (9.1-A)

**Cenário integrado obrigatório (workspace A em uso):**

```
workspace A
├── profiles.workspace_ids contém A
├── membership em A
└── managed_by configurado

DELETE A

resultado esperado:
├── profiles.workspace_ids NÃO contém A
├── memberships relacionadas seguem a política definida (CASCADE remove;
│   nenhuma membership fantasma é recriada)
├── managed_by não fica apontando para entidade inválida (ON DELETE SET NULL
│   nas memberships cujo gestor era do workspace removido)
└── nenhum workspace/membership fantasma é recriado
```

Testes individuais:

1. `DELETE` de workspace existente em `profiles.workspace_ids` → UUID removido de todos os perfis.
   (Cobrir o caso onde o workspace tem membership e a membership tinha `managed_by` apontando para
   ela e PARA ela.)
2. `DELETE` de workspace não referenciado → nenhuma linha de `profiles` muda.
3. Perfil com `workspace_ids = NULL` → não quebra (COALESCE).
4. Após delete, `user_belongs_to_workspace` (nova versão 9.1-B) retorna `false` para o UUID morto.
5. `memberships` do workspace deletado não são recriadas pelo re-disparo do 041.
6. **Ordem de execução no PostgreSQL (não apenas teórica):** verificar no comportamento real a
   sequência `CASCADE`/`ON DELETE SET NULL` vs `AFTER DELETE` do trigger:
   - o CASCADE remove as memberships do workspace e o SET NULL limpa `managed_by` das órfãs;
   - o `FOR EACH STATEMENT` do trigger roda **depois** do delete completar, fazendo a limpeza
     do array em `profiles` baseada no estado já consistente de `memberships`.
   Registrar o plano de execução (`EXPLAIN`) e o resultado real do delete como evidência.
7. Rollback: `DROP TRIGGER/FUNCTION` volta ao comportamento anterior, sem efeito colateral.

---

## 3. 9.1-B — unificar `user_belongs_to_workspace()` para `memberships`

### 3.1 Estado atual

```sql
CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ws_id IS NOT NULL AND ws_id <> ''
      AND ws_id IN (SELECT unnest(workspace_ids)::text FROM public.profiles WHERE id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ws_id IS NOT NULL AND ws_id::text IN
    (SELECT unnest(workspace_ids)::text FROM public.profiles WHERE id = auth.uid())
$$;
```

- Fonte: `profiles.workspace_ids`.
- **Super-admin:** hoje, `user_belongs_to_workspace` **não** faz bypass de super admin. O bypass
  de super admin é feito **explicitamente nas policies**, ex.: `is_super_admin() OR user_belongs_to_workspace(...)`.

### 3.2 Problema

- A autoridade fica em `profiles.workspace_ids` (legado), enquanto o RBAC 2.0 (engine +
  `profile_visible_to_me` 044) usa `memberships`.
- Se houver drift (UUID fantasma, membership manual, suspensão), as decisões divergem entre as
  duas famílias de policies.

### 3.3 Consumidores da função (auditoria)

A função é usada por **todas** as policies workspace-scoped criadas em 027/028/033 e RPCs de
030. Como é `SECURITY DEFINER`, a alteração da função **propaga automaticamente** para todos os
consumidores (nenhuma re-criação de policy é necessária). Lista representativa:
- 027: policies de `chamados_tickets`, `tablet_reservations`, assets, etc.;
- 028: polices de workspaces/tv/múltiplos módulos;
- 033: policies workspace-scoped;
- 030: `tv_device_identity` / helpers.

### 3.4 Decisão arquitetural proposta

**Reescrever `user_belongs_to_workspace(uuid)` e `user_belongs_to_workspace(text)` para ler
`memberships` ativas em vez de `profiles.workspace_ids`:**

- Procurar membership ativa (`status = 'active'`) do `auth.uid()` no workspace.
- Super admin continua sendo tratado **pelas policies** (via `is_super_admin()`), como hoje;
  a função em si continua sem bypass, preservando a semântica atual de forma segura.
- **Semanticamente equivale** ao padrão atual (workspace_ids ↔ membership ativa) porque o
  trigger 041 mantém os dois sincronizados para o caminho legado.
- **Mudança comportamental desejada:** se a membership for suspensa/removida (status ≠ active)
  ou o workspace excluído, a função retorna `false` — a RLS "percebe" a perda de acesso em tempo
  real, mesmo que `workspace_ids` ainda contenha o UUID (redundância de segurança).

Alternativas consideradas:

| Alternativa | Prós | Contras | Veredito |
|-------------|------|---------|----------|
| **A. Reescrever helper p/ ler `memberships` (status='active')** | Propaga para todas as policies; alinha com RBAC 2.0; time-real | muda semântica sutil (workspace_ids pode divergir temporariamente) | **ESCOLHIDA** |
| B. Adicionar `OR EXISTS membership` mantendo workspace_ids | menor risco | mantém divergência/dupla autoridade; não resolve o design gap | Rejeitada |
| C. Deixar como está, migrar na 9.2 | zero risco agora | adia a fundação que a 9.1 deve entregar | Rejeitada |
| D. Bypass de super admin dentro da função | conveniência | muda semântica de todas as policies que já fazem o OR is_super_admin; risco de comportamento duplicado/incorreto | Rejeitada |

**Justificativa (A):** resolve o ponto central do relatório 9.0 (divergência de autoridade) de
forma pontual e centralizada — uma única função alimenta dezenas de policies. Como o trigger 041
mantém memberships sincronizadas com workspace_ids no caminho legado, o comportamento para o fluxo
normal **não muda**; apenas os casos de drift (que eram o problema) passam a ser capturados.

### 3.5 SQL proposto (SOMENTE PROPOSTA — não aplicar)

```sql
CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ws_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.memberships m
       JOIN public.profiles pf ON pf.id = m.profile_id
       WHERE pf.id = auth.uid()
         AND m.workspace_id = ws_id
         AND m.status = 'active'
     )
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ws_id IS NOT NULL AND ws_id <> ''
     AND EXISTS (
       SELECT 1
       FROM public.memberships m
       JOIN public.profiles pf ON pf.id = m.profile_id
       WHERE pf.id = auth.uid()
         AND m.workspace_id::text = ws_id
         AND m.status = 'active'
     )
$$;

-- ACL inalterada (já REVOKE anon/PUBLIC + GRANT authenticated no 033); manutenção da convenção:
REVOKE EXECUTE ON FUNCTION public.user_belongs_to_workspace(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_belongs_to_workspace(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_belongs_to_workspace(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_belongs_to_workspace(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_workspace(text) TO authenticated;
```

### 3.6 Riscos específicos

**Risco de circularidade/recursão com RLS — TESTE OBRIGATÓRIO, NÃO PROVA TEÓRICA:**

A cadeia potencial:

```
RLS memberships
   ↓
memberships_select (036)
   ↓
user_belongs_to_workspace()   ← nova implementação lê memberships
   ↓
SELECT memberships            ← sob o owner da função (DEFINER)
   ↓
RLS memberships               ← reavaliaria? (depende de como o Postgres resolve)
```

Análise teórica:
- `user_belongs_to_workspace` é `SECURITY DEFINER` (owner = postgres/owner da migration), então
  lê `memberships` **ignorando RLS** de memberships (o owner é `bypassrls`). Por isso não há
  reavaliação recursiva das policies de `memberships`.
- `memberships_select` (036) é `is_super_admin OR user_belongs_to_workspace(workspace_id)` — a
  chamada da política ocorre no contexto da QUERY da policy (invoker), mas a função por ser
  DEFINER foge à RLS da própria tabela ao executar `SELECT memberships`.
- Não há `WITH CHECK` recursivo (a policy é SELECT-only).
- ⚠️ **`SECURITY DEFINER` NÃO é prova suficiente isoladamente.** A semântica de RLS em
  Postgres pode variar conforme o plano (ex.: reescrita da query/inlining de função `sql
  STABLE`). A única prova aceitável é **teste real no banco** cobrindo os cenários do §3.7,
  incluindo a leitura de uma tabela cuja policy depende indiretamente da função.

**Comportamento de super-adm:** inalterado — as policies continuam fazendo
`is_super_admin() OR user_belongs_to_workspace(...)`. A função não concede nada extra a super admin.

**Status de membership:** apenas `status = 'active'` concede. `pending/suspended/removed` → `false`
(para o membro). Isso alinha RLS com o RBAC engine (que também exige `active`).

**Workspace ativo/inativo:** `workspaces` não tem coluna de status; a existência implícita é o
único fator. Isso não muda.

### 3.7 Testes adversariais (9.1-B)

Grupos de cenários (todos executados no banco real, não apenas teóricos):

**Leitura / RLS de `memberships` (circularidade):**
1. Usuário comum lendo a **própria** membership → `true`, sem erro de policy/recursão.
2. Usuário lendo membership de **outro** usuário no mesmo workspace → vê (policy atual permite
   `is_super_admin OR user_belongs_to_workspace(workspace_id)`).
3. Usuário em workspace A tentando acessar membership de B em workspace B → **nenhum vazamento
   cross-workspace** (USING=false).
4. Usuário **sem membership** → não vê nada; função retorna `false`.

**Status de membership:**
5. Membership `suspended` no workspace → função `false`; RLS bloqueia.
6. Membership `removed` no workspace → função `false`; RLS bloqueia.
7. Membership `pending` no workspace → função `false`; RLS bloqueia (regra `active` only).

**Super-admin:**
8. Super admin **não tem membership** (regra 041) → a função sozinha retorna `false`; o acesso
   garantido vem das policies que contêm `is_super_admin() OR helper`.
9. Super admin consultando workspace próprio/qualquer → funcional via bypass das policies,
   sem depender da função.

**Função direta / indireta:**
10. Chamada **direta** da função (como super admin e como comum) — sem erro.
11. Acesso a uma tabela cuja policy **depende indiretamente** da função (ex.: `chamados_tickets`
    via 027/028/033) → sem |recursão|/loop, filtro correto.

**Integração com 9.1-A:**
12. Após `DELETE` do workspace (com 9.1-A aplicado), função retorna `false` para o UUID morto.
13. Cross-workspace: usuário `A` de `ws1` não vê nada de `ws2`; `B` de `ws2` não vê `ws1`.

**Critério de aceite (§7):** nenhuma recursão, erro de policy, vazamento cross-workspace ou falso
positivo em qualquer cenário acima.

---

## 4. Ordem exata de execução (após revisão e aprovação)

> **Regra de isolamento:** 9.1-A e 9.1-B são tratados como **mudanças logicamente separadas**,
> mesmo convivendo no mesmo ciclo de migration. Se o teste de `user_belongs_to_workspace()`
> revelar comportamento inesperado, conseguimos isolar exatamente qual mudança causou o problema.
> Autorização é concedida **por item**: implementar 9.1-A primeiro; 9.1-B só após a validação da
> 9.1-A.

```
9.1 revisão de segurança (usuário) — versão v2 do desenho
   ↓
[autorização da 9.1-A (usuário)]
   ↓
9.1-A migration 048 (trigger purge de workspace_ids)
   + teste de regressão SQL (cenário workspace A + ordem CASCADE/SET NULL)
   ↓
validação no DEV (runner + testes estáticos + testes SQL + EXPLAIN do delete)
   ↓
[autorização da 9.1-B (usuário)]
   ↓
9.1-B migration 049 (reescrever user_belongs_to_workspace)
   + testes adversariais de RLS (circularidade, cross-workspace, status)
   ↓
validação no DEV (suíte + RLS adversarial + invariantes 1–6)
   ↓
commit separado por item (9.1-A, 9.1-B)
   ↓
revisão + push controlado
```

---

## 5. Matriz de impacto consolidada (9.1)

| Área | 9.1-A (purge) | 9.1-B (helper) |
|------|---------------|----------------|
| `profiles.workspace_ids` | remove UUID morto | não altera a coluna |
| `memberships` | indireto (041 re-sync idempotente) | fonte de leitura do helper |
| `managed_by` | invariantes preservadas | não afetado |
| RLS policies | comportamentais (deixam de ver workspace morto) | fonte de leitura muda (propaga) |
| RBAC engine (Python) | não alterado | não alterado (já lia memberships) |
| Frontend | melhoria via dados | sem mudança (9.2) |
| Rollback | DROP trigger/function | RESTORE das defs 033 |

---

## 6. Invariantes pós-migration

Estes invariantes guiam a validação de 9.1-A e 9.1-B (novos testes + regressão).

**INVARIANTE 1**
Nenhum `profiles.workspace_ids` pode apontar para um workspace inexistente.

**INVARIANTE 2**
`user_belongs_to_workspace(U,W) = true` somente quando `U` possui membership
`active` em `W`.

**INVARIANTE 3**
Super-admin continua autorizado pelas policies que **explicitamente** possuem o
bypass `is_super_admin()`.

**INVARIANTE 4**
Nenhuma policy passa a depender de uma cadeia recursiva de RLS.

**INVARIANTE 5**
Nenhuma operação cross-workspace ganha acesso como efeito colateral.

**INVARIANTE 6**
`managed_by` não é alterado pela limpeza de `workspace_ids`.

> Nota: a normalização semântica de `memberships.status` (suspenso/removido) fica
> **fora** da 9.1 — decidido na revisão. A regra permanece fail-closed:
> `active` → acesso; qualquer outro status/sem membership → sem acesso.

---

## 7. Critérios objetivos de aceite

**9.1-A:**
1. DELETE de workspace remove o UUID de todos os `profiles.workspace_ids`.
2. Nenhuma membership fantasma é criada depois do re-disparo do 041.
3. `managed_by` invariantes intactas (046 segue válida).
4. Delete de workspace não-referenciado tem zero efeito colateral.
5. Trigger idempotente (re-run não falha).

**9.1-B:**
1. `user_belongs_to_workspace` retorna `true` **apenas** para memberships `active`.
2. Não quebra nenhuma policy existente (suíte de RLS verde).
3. Sem loop/recursão de RLS (teste adversarial).
4. Super admin continua com acesso via policies (`is_super_admin() OR helper`).
5. Suíte global continua verde (testes TS) — nenhuma regressão de authorization.

---

## 8. Riscos residuais

- **Performance (9.1-A):** delete em massa de workspaces faz uma UPDATE em `profiles`
  (FOR EACH STATEMENT) — aceitável; validar em DEV.
- **Semântica (9.1-B):** se algum backfill futuro criar membership `suspended` legado, o helper
  nega acesso (fail-closed) — desejado, mas comportamento a comunicar.
- **Não coberto nesta fase:** consumidores frontend de `workspace_ids` (9.2); remoção final do
  legado (fase futura); decisão sobre `memberships.status` dead-letter (pendente formal).

---

## 9. Próximos passos

- Aguardar **revisão de segurança** do usuário sobre o desenho acima.
- Após aprovação: criar migrations 048 (9.1-A) e 049 (9.1-B) **separadamente**, com testes.
- Não iniciar 9.2 ou qualquer alteração até a validação da 9.1.
