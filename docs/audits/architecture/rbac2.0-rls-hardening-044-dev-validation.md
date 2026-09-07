# ETAPA 044-C — Validação em DEV da Migration 044 (RLS Hardening `profiles` + `workspaces`)

> **Status: CONCLUÍDA em DEV — PARADO conforme escopo.** Nenhuma alteração em STAGING/PROD; nenhum
> commit/push/PR/merge; Issue #158 permanece aberta; nenhuma migration reversa criada.
>
> Base: Discovery `rbac2.0-rls-hardening-044-discovery.md` + Design `rbac2.0-rls-hardening-044-design.md`.
> Repo `main@b8da015`. Data: 2026-09-07.

---

## 1. Migration criada

`supabase/migrations/044_rls_hardening_profiles_workspaces.sql` — implementação fiel do Design 044-B
(§5, §10.1–10.4, §11), com estilo do repositório (cf. 042/043):

1. Helper **`public.profile_visible_to_me(target_user uuid)`** — `LANGUAGE sql`, `STABLE`,
   `SECURITY DEFINER`, `SET search_path = public`; fail-closed (`target_user IS NOT NULL`); lógica:
   próprio (`target_user = auth.uid()`) OR super admin (COALESCE do flag) OR **overlap de memberships
   ativas** (`memberships.status='active'` na coluna real **`profile_id`** da 036).
2. Grants da helper: `REVOKE EXECUTE FROM anon, PUBLIC` + `GRANT EXECUTE TO authenticated, service_role`
   (lição 028 — sem REVOKE órfão).
3. `profiles_select`: `USING(true)` → `id = auth.uid() OR is_super_admin() OR profile_visible_to_me(id)`.
4. `workspaces_select`: `USING(true)` → `is_super_admin() OR user_belongs_to_workspace(id)` (helper
   existente, fonte `profiles.workspace_ids` — alinhada ao filtro client-side).
5. `workspaces_insert/update/delete`: consolidação **era 009 (`role='admin'`) → `is_super_admin()`**
   (idempotente: DEV já-028; PROD será consolidada pela própria migration via pipeline no futuro).
6. **`profiles_insert/update/delete` próprias e `admin_abs_edit/delete_profiles` mantidas intactas.**

Confirmado: `supabase/migrations/044_*.sql` não existia antes desta etapa.

## 2. Ambiente (DEV — não PROD)

| Item | Valor |
|------|-------|
| Projeto alvo | **DEV/STAGING `obskpmnphevpaexooldg`** (`.env` — mesma base usada pelos scripts `e2e_*` como DEV) |
| PROD (não tocado) | `ypkulvbllxgkjzhpzemf` (`.env.production`) — verificação read-only §11 |
| Mecanismo | `scripts/migrate.py` (runner oficial; Management API `/v1/projects/{ref}/database/query`; transação + advisory lock; registro em `public.schema_migrations`) |
| Aplicação | `python scripts/migrate.py` (dry-run confirmou só `044` pendente; aplicou; histórico passou a conter `044`) |

## 3. Policies ANTES × DEPOIS (DEV real via `pg_policies`)

| Policy | ANTES | DEPOIS |
|--------|-------|--------|
| `profiles_select` | `USING (true)` | `(id = auth.uid()) OR is_super_admin() OR profile_visible_to_me(id)` |
| `workspaces_select` | `USING (true)` | `is_super_admin() OR user_belongs_to_workspace(id)` |
| `workspaces_insert` | `WITH CHECK (is_super_admin())` (já-028 em DEV) | `WITH CHECK (is_super_admin())` (reafirmada) |
| `workspaces_update` | `USING (is_super_admin())` | `USING (is_super_admin())` (reafirmada) |
| `workspaces_delete` | `USING (is_super_admin())` | `USING (is_super_admin())` (reafirmada) |
| `profiles_insert/update/delete` | próprias (028-era) | **inalteradas** |
| `admin_abs_edit/delete_profiles` | `is_super_admin()` | **inalteradas** |

> **Divergência registrada:** DEV já estava na era 028 (registro individual `028` no histórico), enquanto
> PROD está na era 009 (`role='admin'`). A 044 é **idempotente** para os dois estados e será o ponto de
> consolidação da PROD quando aplicada via pipeline (fora desta etapa).

## 4. Helper verificada (DEV)

- `pg_proc`: `prosecdef=true`, `provolatile=s` (STABLE), ACL `{postgres=X, authenticated=X, service_role=X}`.
- Coluna usada: `memberships.profile_id` (confirmada no schema real — **não** `user_id`). Sem divergência
  com o design → sem bloqueio (o gatilho de PARADA não disparou).
- `search_path = public`; referências qualificadas `public.*`/`auth.uid()`; sem SQL dinâmico; retorno
  booleano; fail-closed.

## 5. Grants (DEV)

| Função | ACL resultante |
|--------|----------------|
| `profile_visible_to_me(uuid)` | `authenticated`, `service_role` (sem anon/PUBLIC) |
| `is_super_admin()` | `authenticated`, `service_role` (preservado — inalterado) |
| `user_belongs_to_workspace(text/uuid)` | inalterado (grants legados preservados; sem REVOKE órfão) |

## 6. Testes estruturais

- `api/tests/test_044_rls_hardening_migration.py` (novo, padrão 041/042/043): **24/24 pass** — helper
  (definer/stable/search_path/fail-closed/profile_id/overlap active), grants (revoke anon+PUBLIC, grant
  authenticated+service_role), policies (profiles_select/workspaces_select sem `USING(true)`,
  workspaces insert/update/delete `is_super_admin()`), escopo mínimo (só as 5 policies esperadas; zero
  `CREATE TABLE`/`ALTER TABLE`).
- Pós-aplicação (Management API): sem views em `public`; **zero policies SELECT** com `USING(true)` em
  `profiles`/`workspaces`; `history`: `044` registrada.

## 7. Matriz adversarial — 30/30 PASS (cliente autenticado real, sem service key)

Script `scripts/e2e_rls_044.py` (login GoTrue + REST com anon key/token do usuário, mesmo caminho do
frontend). Fixtures criadas no DEV via `scripts/e2e_db.py` e removidas ao final (§12).

**Profiles — P1–P12:** próprio ALLOW (P1); co-membro ativo ALLOW (P2); outro ws DENY (P3); multi-ws ALLOW
(P4); sem membership DENY (P5); membership `pending` DENY (P6); workspace inexistente DENY (P7);
usuário inexistente DENY (P8); super admin vê todos ALLOW (P9); super admin bypass ALLOW (P10);
update próprio ALLOW (P11); update em outro não-super DENY → 0 linhas (P12).

**Workspaces — W1–W10:** próprio ws ALLOW (W1); outro ws DENY (W2); lista multi-ws = exatamente meus
ws ALLOW (W3); sem membership → lista vazia DENY (W4); super admin vê todos ALLOW (W5); UUID conhecido
de outro ws DENY (W6); INSERT não-super 403 DENY (W7); INSERT super 201 ALLOW (W8); DELETE não-super 0
linhas DENY (W9); UPDATE super ALLOW (W10).

**Ataques — A1–A10:** uuid manipulation DENY (A1); email cross-ws DENY (A2); memberships cross-ws não
vazam (A3: `ws visíveis = ['1111…A']` para membro de A; B/C não aparecem); RPC booleano sem vazamento
(A4: `status=200 body=false`); **A5 views:** nenhuma view em `public` (confirmado via
`information_schema.views`); client `select('*')` de profiles não-super retorna só próprio+co-membros
(A6: `visíveis p/ a1 = [a1, a2]`); sem capability → só próprio (A7); super admin RBAC2 (flag) bypass
ALLOW mesmo sem membership (A8); poll pending próprio ALLOW (A10). **A9 (realtime):** coberto pela
restrição de SELECT (P3/P6/A6) — canal continua operacional sem erro 42501 (nenhum SELECT dos testes
produziu 42501; o Realtime filtra por legibilidade RLS, contrato preservado).

## 8. Acesso direto via Supabase client (autenticado)

Validado em §7 de ponta a ponta: todas as consultas usaram anon key + Bearer do usuário autenticado
via GoTrue — **nenhuma** usou service key. `defaultDb.from('profiles').select('*')` devolve apenas
linhas legíveis (P3/P6/A7/A10).

## 9. Joins/bypasses testados

- `profiles`/`memberships`/`workspaces` via REST autenticado (A2/A3): nenhum vazamento cross-ws.
- RPC/funções: `profile_visible_to_me` retorna apenas bool (A4).
- Views: nenhuma existe em `public` (A5).
- Endpoints backend (Flask, service-key): **imunes por design** (todas as rotas de `profiles`/`workspaces`
  no backend usam service key — mapa 3.2/4.2 do discovery); nenhuma rota roda select client com token de
  usuário no backend.

## 10. Regressão (DEV)

| Suíte | Resultado |
|-------|-----------|
| `pytest api/tests` (backend completo, 633 testes) | **633/633 pass** |
| `pytest scripts/tests` (runner de migrations) | **16/16 pass** |
| Vitest — fluxos afetados (auth/workspaces/admin/Login/TV/sync; 20 arquivos) | **187/187 pass** |
| Vitest — suíte completa | **1668 pass, 1 skipped, 1 flake** (`BatchCreateModal` — estoque, não relacionado à RLS; passa isolado 3/3; flakiness de timing de `userEvent`) |
| `tsc -b` (typecheck) | **exit 0** |
| `npx oxlint` | **exit 0** (só warnings pré-existentes) |
| RBAC2 / isolamento / fail-closed | verdes (parte do 633) |

Nenhuma rigressão funcional de Admin, WorkspaceContext, TV SetupFlow ou login detectada.

## 11. Evidência de não-ação em PROD (read-only)

| Verificação | Resultado |
|-------------|-----------|
| PROD `schema_migrations` | ainda `035..043` — **sem `044`** |
| PROD `profiles_select`/`workspaces_select` | ainda `USING (true)` — migration não vazou |

## 12. Limpeza de fixtures (DEV)

Criadas: workspaces `e2e-ws-a/b/c`, users `*@e2e-rls.example.com` (8), memberships (6) e um workspace
temporário do teste W8. Removidos ao final: estado DEV **zeroado** (auth_users=0, profiles=0,
memberships=0, workspaces=0). As políticas/helper/044 permanecem aplicadas (são DDL, não dados).

## 13. Conclusão e divergências

- **`USING(true)` eliminado** nas leituras de `profiles`/`workspaces` no DEV; matriz ALLOW/DENY 30/30;
  helper correta (definer, search_path, fail-closed, grants); regressão completa verde; PROD intocado.
- **Divergência design→implementação:** apenas a constatação de que DEV já-028 era idempotente para
  workspaces (registrada §3); **nenhuma** mudança ao design foi necessária → design doc não requer
  atualização de diferenças.
- **Riscos residuais** (já documentados no design): drift `workspace_ids`↔`memberships` (Open Q1);
  `select('*')` segue expondo todas as colunas de linhas legíveis (fase 2 = selects explícitos, fora da
  044); superfície de coluna não é reduzida (RLS é por linha).

**Pare aqui.** A migration 044 está validada em DEV. Próximos passos (fora deste escopo, exigem
aprovação explícita): STAGING → PR/merge → pipeline `Migrations` (PROD) → auditoria pós-aplicação →
fechamento da Issue #158 após confirmação em PROD.

`git status` final (sem commit/push/PR):

```text
 M docs/architecture/rbac2.0-etapa7-activation.md          (da etapa anterior da auditoria)
?? api/tests/test_044_rls_hardening_migration.py           (ESTA etapa)
?? scripts/e2e_rls_044.py                                  (ESTA etapa)
?? supabase/migrations/044_rls_hardening_profiles_workspaces.sql  (ESTA etapa)
?? docs/audits/architecture/rbac2.0-rls-hardening-044-discovery.md
?? docs/audits/architecture/rbac2.0-rls-hardening-044-design.md
?? docs/audits/architecture/rbac2.0-rls-hardening-044-dev-validation.md   (ESTE documento)
?? docs/audits/architecture/rbac2.0-prod-audit-2026-09.md  (da auditoria pós-produção)
?? screenshots/ · scripts/...                              (pré-existentes)
```