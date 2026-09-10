# RBAC 2.0 — Fase 9.3-A: Auditoria e Inventário Completo do Legado `profiles.workspace_ids`

> **Etapa:** 9.3-A — somente auditoria/inventário read-only. Nenhuma alteração de
> código, SQL, migration, RLS, trigger, RPC, endpoint, frontend ou push foi feita.
> A remoção física da coluna NÃO acontece nesta etapa (isso é 9.3-F).
> **Base auditada:** `main` + PRs #181 (9.2-C) e #182 (9.2-D/D.1) — pilha completa
> da Fase 9.2 (branch `audit/rbac92-d-final`, commits até `c0ddd60`).
> **Método:** `git grep` estrutural em `src api supabase scripts .github docs`
> (606 ocorrências em 110 arquivos; `.github` zerado) + leitura dirigida de cada
> ponto de decisão + verificação comportamental read-only em PROD (9.2-D) +
> suítes existentes como prova de independência.

---

## 1. Resumo executivo

- `memberships` (status `active`) é a única autoridade de autorização e
  pertencimento no frontend, nos backends e no banco (RLS/helper unificado).
- **Nenhum caminho de autorização/visibilidade/escopo decide por
  `profiles.workspace_ids`.** Os 5 residuais encontrados na 9.2-D/D.1
  (`RolesPage`, `NotificationRulesTab`, `push/subscribe`,
  `tv/activation/create`, `tv/devices/provision`) foram migrados para a mesma
  fonte membership-based antes deste relatório.
- O que resta da coluna é: **compatibilidade/DTO, espelho bidirecional
  controlado, tipos/fixtures/testes e documentação histórica**.
- A sincronização legada `profiles.workspace_ids → memberships` (trigger 041,
  emendada pela 045) **ainda está ativa e ainda é necessária** até a 9.3-C —
  desligá-la agora quebraria a convergência dos fluxos que ainda escrevem a
  coluna via espelho 052 e re-derivaria estados granulares (ver §5 e §13).
- **Veredito: 9.3-A APROVADA para avançar** (0 blockers, 0 usos de autorização).

---

## 2. Resultado do grep global

| Diretório | Arquivos com match | Ocorrências |
|---|---|---|
| `docs` | 26 | 174 |
| `src` | 41 | 151 |
| `api` | 18 | 114 |
| `supabase` | 20 | 95 |
| `scripts` | 5 | 72 |
| `.github` | 0 | 0 |
| **Total** | **110** | **606** |

Comando de reprodução:
`git grep 'workspace_ids' -- src api supabase scripts .github docs`
(padrões do escopo — `profiles.workspace_ids`, `user.workspace_ids`,
`workspaceIds`, `workspace_ids:`, `workspace_ids =`, `workspace_ids[]`,
`workspace_ids[0]` — todos cobertos pelo literal).

---

## 3. Inventário completo e 4. Classificação A/B/C/D/E/F

### A — AUTORIZAÇÃO / SEGURANÇA — **0 ocorrências (ZERO, verificado ponto a ponto)**

Varredura de todos os pontos de decisão conhecidos; cada um lê memberships:

| Ponto | Fonte atual | Prova |
|---|---|---|
| `WorkspaceContext.assignedWorkspaces` + gate/seleção | `selectAssignedWorkspaces` (memberships ativas) | `WorkspaceContext.test.tsx` (autoridade, fail-closed, loading) |
| `workspaceStore` (filtro da camada de dados) | alimentado por `assignedWorkspaceIds` | idem + `workspaceIsolation.test.ts` |
| Notificações in-app (`notificationAppliesTo`) | `workspaceStore.matches` + `hasAppAccess` (cargo resolvido, sem coluna) | `visibility.test.ts` |
| `authService.refreshProfile` (detecção) | multiset de memberships (`areMembershipsEqual`) | `service.test.ts` (workspace_ids não notifica) |
| TV `SetupFlow` / `TvDesktopInstall` | `selectAssignedWorkspaces` / `assignedWorkspaceIds` | testes do serviço + `tsc` |
| Push client (`buildPushUser`) | `assignedWorkspaceIds` (campo mantido p/ contrato) | `buildPushUser.test.ts` |
| Push subscribe (servidor) | `_get_user_workspace_ids` (service_role, active) | `test_auth_layer.py::TestPushSubscribeUntrusted::test_subscribe_grava_memberships_na_inscricao` |
| Push targeting (`_target_subs`) | payload da inscrição (membership-derived desde B3) | `test_push_cron.py`, `test_push_admin_subscriptions.py` |
| `auth._user_in_workspace` / `require_workspace` / `g.user` uniformizado | memberships via service_role | `TestMembershipAuthority` (3 testes) + suíte backend 672 verdes |
| TV `activation/create`, `devices/provision` | `_get_user_workspace_ids` (D.1-TV) | 4 testes novos em `test_tv_provisioning.py` |
| Admin leitura (`UsersPage`, `UserDetailPage`, `RolesPage`, `NotificationRulesTab`) | `attachMemberships` + `isActiveMember` | testes de escopo/autoridade de cada tela |
| Admin escrita (`approveUser`, toggle, adapter) | RPC 052 + PATCH status/cargo (sem `workspace_ids` no PATCH) | `adminService.test.ts` (15) + teste de proibição de escrita direta |
| RBAC engine Python (`rbac.py`) | memberships/roles/role_permissions (desde 9.1-B) | `test_rbac*.py` |

### B — COMPATIBILIDADE TEMPORÁRIA

| # | Onde | Quem produz | Quem consome | Por que ainda precisa | Substituição / remoção |
|---|---|---|---|---|---|
| B1 | Campo `workspace_ids` no payload push (`PushUserInfo`, inscrição Redis, auditoria `push/admin/subscriptions`) | `buildPushUser` (derivado de memberships), `push/subscribe` (derivado via `_get_user_workspace_ids`) | `_target_subs`, tela de diagnóstico | Contrato de segmentação do push; inscrições antigas no Redis têm o campo | 9.3-E: parar de persistir após janela; `_target_subs` passa a resolver memberships por `user.id` |
| B2 | Campo `workspace_ids` no dict `g.user` | `require_auth` (uniformizado: derivado de memberships) | 9 leituras em `api/app.py` (chamados list/manage/reports etc.) | Evita reescrever cada ponto; semântica idêntica | 9.3-E: trocar leituras por helper direto ou remover o campo |
| B3 | Input `workspace_ids` em `approveUser`/`ApproveUserModal`/endpoint | UI admin (campus escolhidos) | `setUserMemberships` → RPC 052 | É o dado de entrada da operação (não leitura de autoridade) | 9.3-E: renomear para `workspaceIds` de intenção (cosmético) ou manter |
| B4 | `updateUserProfile` genérico aceita `workspace_ids` | tipo TS | nenhum chamador atual passa a coluna | Capacidade residual do PATCH | 9.3-E: remover do `Pick` |
| B5 | `User.workspace_ids: string[]` (tipo) | `auth/types.ts` | fixtures, espelho local pós-toggle/approve | Shape do perfil vindo do banco | 9.3-F: remover junto com a coluna (quebra fixtures — atualizar) |

### C — ESPELHO / SINCRONIZAÇÃO LEGADA (`profiles → memberships`)

| Mecanismo | Origem | Finalidade | Disparo | Ainda necessário? |
|---|---|---|---|---|
| `sync_user_memberships(uuid)` + `trg_profiles_sync_memberships` (AFTER INSERT OR UPDATE OF `status, role, workspace_ids, is_super_admin`) | 041 (+ reconcile inicial), emendada pela 045 (`lider`, `managed_by` preservado) | Derivar memberships da coluna legada | Qualquer UPDATE nas 4 colunas; INSERT de profile | **SIM até 9.3-C** — ver §5 e §13 |
| `handle_new_user()` + `on_auth_user_created` (015) | 015 | Perfil pendente no signup (`workspace_ids='{}'`) | INSERT em `auth.users` | SIM (criação de perfil; sem workspace não gera membership — correto) |
| Backfill 036 + reconcile 041 | 036/041 | Carga inicial idempotente | manual/uma vez | NÃO (já executado; manter arquivo = histórico) |
| Purge 048 (remove UUIDs fantasma da coluna) | 048 | Higiene da coluna | aplicada em PROD | NÃO reexecutar sem motivo; arquivo = histórico |

### D — ESPELHO PRODUZIDO PELA NOVA ARQUITETURA (`memberships → profiles`)

| Mecanismo | Origem | Observação |
|---|---|---|
| `052 admin_set_user_memberships` (espelho na mesma transação) | 052 (9.2-C) | **Único mecanismo D. NÃO remover** até 9.3-E/F; é o que mantém leitores legados convergentes |
| `approveUser` PATCH sem `workspace_ids` | frontend 9.2-C | Não escreve a coluna (só status/cargo); trigger re-sincroniza idempotente |
| Toggle/detail optimistic `workspace_ids: mirror` | frontend 9.2-C | Espelho local do retorno do RPC; convergente por construção |

Confirmado: **não existem outros** mecanismos D além do 052.

### E — DTO / TIPAGEM / FIXTURES / TESTES

- `User.workspace_ids`, `UserNotifySettings`, mocks (`src/test/mocks.ts`), fixtures `makeUser`/`makeMembership` em ~20 arquivos de teste: **necessários** enquanto o tipo existir; fixtures que derivam memberships de `workspace_ids` estão marcadas como espelho do trigger 041 e **só valem em teste**.
- Scripts DEV (`scripts/validate_*`, `e2e_rls_044.py`): escrevem a coluna para **exercitar o trigger**; necessários até 9.3-C; depois, reescrever fixtures para memberships diretas.
- Migration tests em `supabase/migrations/tests/`: asserções estruturais (048/049/052); necessários como gate.
- `profile_visible_to_me`, `user_belongs_to_workspace` (049): **não leem a coluna** (lê memberships) — citados aqui só porque testes de migração mencionam a coluna no contexto.

### F — DOCUMENTAÇÃO (26 arquivos, só listar — nenhum editado)

Históricos/auditorias que descrevem a coluna como arquitetura passada
(`architecture/*`, `audits/*`, `plano-rbac2.0-mascote-multiunidades.md`,
`reference/*`, `concepts/*`, `decisions/ADR-004*`, `glossary.md`,
`modules/*`, `rbac2.0-fase-9.1-*`): nenhum é autoridade de runtime (código +
migrations aplicadas mandam). Reescrever docs históricos **não** faz parte da
9.3; docs vivos de arquitetura serão atualizados quando a coluna cair (9.3-F/G).

---

## 5. Triggers 041/045 — cadeia profunda

```text
INSERT INTO profiles (signup via handle_new_user, '{}')
        ↓ trg_profiles_sync_memberships (AFTER INSERT)
        ↓ sync_user_memberships(id): lê role/is_super/status/workspace_ids
        ↓ workspace_ids='{}' ⇒ nenhuma membership (correto)

UPDATE profiles SET status|role|workspace_ids|is_super_admin
        ↓ trg_profiles_sync_memberships (AFTER UPDATE OF...)
        ↓ sync_user_memberships(id):
            mapeia role → slug (technician/viewer/admin/coordinator/lider
              + formas role-*; 045 adicionou lider; desconhecido ⇒ NULL)
            DELETE memberships fora do alvo (suspenso/inativo/super/role
              desconhecida/sem workspace)
            INSERT/UPDATE das do alvo com status='active' (ON CONFLICT atualiza
              role_id+status; managed_by intocado — 045)
```

- **Funções:** `sync_user_memberships(uuid)` (SECURITY DEFINER, EXECUTE p/
  authenticated), wrapper `trg_sync_user_memberships()`.
- **Trigger:** `trg_profiles_sync_memberships` AFTER INSERT OR UPDATE OF
  `(status, role, workspace_ids, is_super_admin)` por linha.
- **Tabelas:** lê `profiles` + `roles` + `workspaces` (existência); escreve
  `memberships`; nunca toca `managed_by` no upsert.
- **Status:** memberships fora do alvo são DELETADAS (não suspensas); dentro do
  alvo são (re)ativadas — inclusive reativando suspensas se o perfil for
  tocado com o workspace ainda atribuído.
- **Efeito colateral central p/ 9.3:** qualquer UPDATE em `profiles` re-deriva
  memberships da coluna + `profiles.role`. Escritas granulares (052, RPCs de
  coordenação em `managed_by`) sobrevivem (trigger não toca `managed_by`), mas
  `role_id`/`status` granular **seria** sobrescrito — por isso o 052 espelha a
  coluna na mesma transação e o `approveUser` faz endpoint-antes-do-PATCH.
- **Desligar (9.3-C):** remover `trg_profiles_sync_memberships` (+ opcionalmente
  a função, mantendo-a para reconcile manual). Pré-requisitos: nenhum escritor
  de `workspace_ids` restante (só o espelho 052, removido junto em 9.3-E) e
  nenhum leitor da coluna (9.3-B). Risco se desligado cedo: perfis criados/
  editados por caminhos legados param de gerar memberships (porta de entrada
  travada).

---

## 6. Funções/RPCs relacionadas

| Função | Papel vs coluna | ACL |
|---|---|---|
| `sync_user_memberships` (+ wrapper trigger) | **lê** a coluna (C) | authenticated (precisa: trigger roda como chamador) |
| `user_belongs_to_workspace` (049) | **não lê** (memberships) | DEFINER, uso em RLS |
| `profile_visible_to_me` (044) | **não lê** (memberships) | DEFINER, uso em RLS |
| `get_leader_team` (045/046), RPCs 047, `coordinator_set_manager` | **não leem** (memberships/`managed_by`) | authenticated + checks internos; escrita 047 delega à trigger 046 |
| `admin_set_user_memberships` (052) | **escreve** a coluna (espelho D, mesma transação) | somente `service_role` |
| `handle_new_user` (015) | **escreve** `'{}'` no signup | trigger em `auth.users`, DEFINER |

---

## 7. Backend (`api/`, Flask + helpers)

- Gate único: `auth._user_in_workspace` lê memberships via service_role
  (fail-closed); `require_auth` uniformiza `g.user['workspace_ids']` como
  derivado — os 9 pontos de `api/app.py` e os fluxos TV (`activation/create`,
  `devices/provision`) decidem por esse dict.
- Push: `subscribe` grava inscrição com memberships (`_get_user_workspace_ids`);
  `_target_subs`/auditoria leem o payload (derivado desde B3).
- Admin: endpoint de memberships (052) é a única escrita; `approveUser` não
  escreve a coluna no PATCH.
- Nenhum handler decide por leitura direta da coluna (verificado por grep +
  suíte backend 672 verdes, incluindo `TestMembershipAuthority`).

---

## 8. Frontend (`src/`)

- 7 consumidores de `user.memberships` com gate em `membershipsLoaded`
  (`WorkspaceContext`, `SetupFlow`, `TvDesktopInstall`, `buildPushUser`,
  `UsersPage`, `UserDetailPage`, `refreshProfile`); `selectAssignedWorkspaces`/
  `assignedWorkspaceIds`/`isActiveMember`/`attachMemberships` são a fonte única.
- `resolveRoleSlug`: zero chamadores em produção (só badges/ações futuras).
- `getByUser`: filtro + RLS do token; teste IDOR verde.
- `setUserMemberships`/`approveUser`: só via RPC (teste de proibição de escrita
  direta verde).
- `useMemberships`: expõe o flag (nenhum consumidor ainda — sem decisão).
- `useWorkspaceFilter`: removido (9.2-B2).

---

## 9. Supabase/migrations — linha do tempo da coluna

| Migration | Papel da coluna |
|---|---|
| 001/003/004/005 | cria/renomeia/normaliza (`workspaceIds` → `workspace_ids`) |
| 008 | exemplo de INSERT com a coluna |
| 009 | `ADD COLUMN workspace_ids UUID[] DEFAULT '{}'` + índice GIN — **nascimento** |
| 015 | `handle_new_user` semeia `'{}'` no signup |
| 024/027/033 | RLS lendo a coluna (`unnest`) — **substituídas** por 044/049 |
| 026/028 | revoke anon / consolidação (notas) |
| 036 | cria `memberships` + backfill **a partir** da coluna |
| 040 | seed `coordinator` |
| 041 | **sync coluna → memberships** (trigger + reconcile) |
| 044 | `profiles_select`: `id = auth.uid()` (coluna sai do SELECT) |
| 045 | `managed_by` + `lider` no sync; guardas |
| 046 | guard da trigger (auditoria 7.7) |
| 047 | escopo do coordenador (não toca a coluna) |
| 048 | **purge** de UUIDs fantasma da coluna (aplicada em PROD) |
| 049 | `user_belongs_to_workspace` passa a ler memberships |
| 050/051 | tablets (sem relação) |
| 052 | **espelho reverso** memberships → coluna (mesma transação) |

Migrations antigas nunca são editadas (histórico imutável).

---

## 10. Contratos externos

**Nenhum.** Repositório único; Vercel só guarda chaves; push vai a vendors
(FCM/APNs/WebPush) com targeting derivado de memberships; TV desktop usa
activation codes vinculados a workspaces de membership; nenhum parceiro/API
externa consome a coluna.

---

## 11. Testes que comprovam independência (cenários A–D)

| Cenário | Esperado | Prova |
|---|---|---|
| A: `ws=[]` + membership ativa em A | acesso A = SIM | `WorkspaceContext.test` (legado vazio + membership mooca → mooca); backend divergência (legado ws-b + memberships ws-a → ws-a 200) |
| B: `ws=[A,B]` + sem memberships | acesso = NÃO | `WorkspaceContext` (vazias/suspensas/removidas → nada); backend `memberships_vazias_negam`; `isActiveMember`/`getActiveWorkspaceIds` |
| C: `ws=[A]` + membership suspensa | acesso = NÃO | `WorkspaceContext` (suspended/removed excluídos); `areMembershipsEqual` (suspensão detectada) |
| D: `ws=[A]` + membership B ativa | B SIM, A NÃO | `WorkspaceContext` (autoridade: legado sjc + membership mooca → só mooca); backend divergência (ws-b 403, ws-a 200); `UsersPage` autoridade; TV provision/activation |

Sem mudanças funcionais para provar: só referências acima.

---

## 12. Dependências para a remoção (tabela)

| Dependência | Tipo | Ainda necessária? | Pode remover antes da coluna? | Substituição | Risco |
|---|---|---|---|---|---|
| Trigger 041 + `sync_user_memberships` | C | sim, até 9.3-C | não | remover trigger após zerar escritores/leitores | alto se cedo (trava entrada) |
| `handle_new_user` (`'{}'`) | C | sim | não (reescrever p/ sem coluna = 9.3-F junto) | remover coluna do INSERT junto ao DROP | baixo |
| Espelho 052 | D | sim, até 9.3-E | não | remover chamada + bloco na 052/remover função | médio (leitores legados divergem) |
| Campo no tipo/payloads/dicts | B/E | sim (shape) | testes/mocks sim; runtime com a coluna | remover junto ao DROP | baixo |
| `updateUserProfile` genérico | B residual | não usada p/ coluna | sim (tirar do `Pick`) | — | baixo |
| Fixtures/mocks/scripts DEV | E | sim p/ testes atuais | sim, migrando fixtures p/ memberships diretas | — | baixo |
| Docs históricos (F) | F | sim (história) | não reescrever | atualizar docs vivos em 9.3-G | nenhum |

## 13. Riscos

1. **Re-derivação pelo trigger:** enquanto 041 viver, qualquer UPDATE em
   `profiles` reescreve `role_id`/`status` granular a partir da coluna +
   `profiles.role` (cenário 3.5.1 documentado). Mitigado hoje pela ordem
   endpoint-antes-do-PATCH e pelo espelho; some ao desligar o sync.
2. **Cargos sem slug** (personalizados): endpoint 400 fail-closed; trigger os
   ignora (0 memberships). Comportamento atual preservado; decidir em 9.3 se
   personalizados ganham slug.
3. **Janela approve:** endpoint ok + PATCH falho = memberships sem status
   ativo (retry idempotente cobre; monitorar erro).
4. **Desligar o sync cedo** orfana entradas legadas (signup manual, imports).
5. **`managed_by`**: nunca tocado por sync/RPC-052 — sem risco aqui.

## 14. Sequência recomendada da 9.3

A proposta do gate (A→G) **está correta** e não precisa de ajuste:

```text
9.3-A inventário (este documento)
        ↓
9.3-B remover consumidores legados (restam: updateUserProfile Pick, fixtures,
        scripts DEV, payload push — trocar por resolução direta)
        ↓
9.3-C desligar sincronização profiles → memberships (drop trigger + avaliar
        função; reescrever handle_new_user sem a coluna)
        ↓
9.3-D janela de observação (monitorar divergência mirror × memberships)
        ↓
9.3-E remover compatibilidade (espelho 052, campo em payloads/dicts/tipo TS)
        ↓
9.3-F DROP COLUMN (+ índice GIN)
        ↓
9.3-G auditoria final (re-grep zerado + docs vivos atualizados)
```

## 15. Critério de saída da 9.3-A

- [x] todo `workspace_ids` classificado (606 ocorrências, §2–§4)
- [x] nenhuma referência desconhecida (`.github` zerado; resto mapeado)
- [x] triggers 041/045 documentados (§5)
- [x] funções relacionadas identificadas (§6)
- [x] dependências frontend/backend/SQL mapeadas (§7–§9)
- [x] contratos externos identificados: nenhum (§10)
- [x] nenhum caminho de autorização depende da coluna (§4A + §11)
- [x] proposta concreta de desligamento (§12–§14)
- [x] lista do que NÃO remover ainda (§12: trigger, espelho 052, campo, fixtures)

## 16. Conclusão

A 9.3-A está **APROVADA para avançar**: a coluna é hoje dado de compatibilidade
com um único produtor reverso controlado (052) e um único sincronizador legado
(041, com desligamento mapeado). Próximo gate: 9.3-B.

```text
BLOCKERS: 0
USOS DE AUTORIZAÇÃO POR workspace_ids: 0
DEPENDÊNCIAS LEGÍTIMAS RESTANTES: B(5)+C(4)+D(1)+E(tipos/fixtures/testes/scripts)+F(26 docs históricos)
TRIGGERS LEGADOS: 2 (trg_profiles_sync_memberships + on_auth_user_created; +1 guard 046 fora do escopo legado)
CONTRATOS EXTERNOS: 0
ALTERAÇÕES REALIZADAS: 0
```
