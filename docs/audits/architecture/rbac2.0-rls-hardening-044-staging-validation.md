# ETAPA 044-D — Validação em STAGING da Migration 044 (RLS Hardening `profiles` + `workspaces`)

> **Status: CONCLUÍDA — VERDICT: STAGING READY FOR REVIEW.** Nenhuma alteração em PROD; nenhum
> commit/push/PR/merge; Issue #158 permanece aberta; nenhuma migration reversa criada.
>
> Base: Discovery `rbac2.0-rls-hardening-044-discovery.md` + Design `rbac2.0-rls-hardening-044-design.md`
> + validação DEV `rbac2.0-rls-hardening-044-dev-validation.md`. Repo `main@b8da015`. Data: 2026-09-07.

---

## 1. Ambiente

Conforme a configuração atual do projeto, **DEV e STAGING compartilham o MESMO Supabase** (projeto
"LabHub Staging"):

- **DEV/STAGING = `obskpmnphevpaexooldg`** — `.env` local (linha 2: "AMBIENTE DEV/TEST (Supabase:
  LabHub Staging)") e `scripts/fix_preview_env.py` (assert "valores de staging devem ser obsk";
  `STAGING = dotenv_values(".env")`; preview do Vercel aponta para este ref).
- **PROD = `ypkulvbllxgkjzhpzemf`** — `.env.production`; NÃO tocado (verificação read-only §15).
- Não existe um terceiro projeto STAGING distinto em nenhum arquivo do repositório (verificado via
  `git grep`, env files, `vercel.json`, workflows). Confirmado com o usuário antes de executar qualquer SQL.

## 2. Project ref

| Papel | Ref | Origem |
|-------|-----|--------|
| STAGING (alvo) | `obskpmnphevpaexooldg` | `.env` (`SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) |
| PROD (intocado) | `ypkulvbllxgkjzhpzemf` | `.env.production` |

## 3. Migration aplicada

- Arquivo: `supabase/migrations/044_rls_hardening_profiles_workspaces.sql`.
- **Identidade confirmada no pré-flight**: `git diff` do arquivo = 0 linhas; SHA-256 =
  `B78629E3 0ED9A5C9 C753A8BF 397A0A26 96CBCABE C562F102 007B1E07 C13B3866` — idêntico ao validado em DEV.
- Já registrada no STAGING (aplicada na etapa 044-C no banco compartilhado DEV/STAGING); aplicação
  `scripts/migrate.py` é idempotente e nenhuma migration pendente existe além de `044` já aplicada.
- Runner oficial confirmado funcional: `python -m pytest scripts/tests` → **16/16 PASS**.

## 4. Versão anterior
`043` (max version em STAGING antes do ciclo DEV/STAGING).

## 5. Versão posterior
`044` registrada em `public.schema_migrations` em STAGING (`..., 043, 044`).

## 6. Validação estrutural (STAGING, read-only via Management API)

### Profiles
- `profiles_select` = `((id = auth.uid()) OR is_super_admin() OR profile_visible_to_me(id))` — **sem `USING(true)`**.
- Helper `profile_visible_to_me(uuid)`: `SECURITY DEFINER` (`prosecdef=true`), `STABLE`
  (`provolatile='s'`), `search_path = public` (`proconfig`), assinatura `target_user uuid`.
- Usa a coluna real `memberships.profile_id` (schema 036-verificado; `signup-state`/`memberships` dos
  fixtures confirmaram overlap ativo); fail-closed (`target_user IS NOT NULL` no SQL).

### Workspaces
- `workspaces_select` = `(is_super_admin() OR user_belongs_to_workspace(id))` — **sem `USING(true)`**.
- `workspaces_insert` = `WITH CHECK (is_super_admin())`.
- `workspaces_update`/`workspaces_delete` = `USING (is_super_admin())`.
- Super Admin preservado (bypass via `is_super_admin()` em leitura e escrita).

### Grants
- `profile_visible_to_me(uuid)` ACL = `{postgres=X/postgres, authenticated=X/postgres,
  service_role=X/postgres}` — **exatamente** os grants do Design 044-B (sem anon/PUBLIC).
- `is_super_admin()` / `user_belongs_to_workspace(text|uuid)`: inalterados (grants legados preservados,
  sem REVOKE órfão).
- Views públicas: **0** em STAGING (A5).

Testes estáticos: `python -m pytest api/tests/test_044_rls_hardening_migration.py` → **24/24 PASS**.

## 7. Adversarial tests (STAGING, cliente autenticado real)

`scripts/e2e_rls_044.py` — GoTrue login + REST com anon key (sem service key), mesmas fixtures do DEV
(recriadas com novos UUIDs, removidas ao final §14).

**Resultado: 30/30 PASS**

- **P1–P12** (profiles): próprio ALLOW; co-membro ativo ALLOW; outro ws DENY; multi-ws ALLOW; sem
  membership DENY; membership `pending` DENY; workspace inexistente DENY; usuário inexistente DENY;
  super admin vê todos ALLOW; super admin bypass ALLOW; update próprio ALLOW; update outro não-super
  DENY (0 linhas).
- **W1–W10** (workspaces): meu ws ALLOW; ws de outro DENY; multi-ws = exatamente meus ws ALLOW; sem
  membership lista vazia; super admin vê todos (`[A,B,C]`); uuid conhecido de outro ws DENY; INSERT
  não-super 403; INSERT super 201; DELETE não-super 0 linhas; UPDATE super ALLOW.
- **A1–A10** (ataques): uuid manipulation DENY; cross-ws por email DENY; memberships cross-ws DENY
  (`ws visíveis=['A']` para membro de A); RPC booleano sem vazamento (`false`); client profiles não
  cross-ws (`['a1','a2']`); sem capability → só próprio; super admin flag bypass ALLOW; poll pending
  próprio ALLOW. A9 (realtime) coberto indiretamente: nenhum SELECT gerou 42501; RLS filtra o canal.

Obrigatórios da etapa confirmados: próprio perfil, co-membro, cross-workspace, múltiplos workspaces,
pending, sem membership, workspace inexistente, Super Admin, workspace próprio, workspace de terceiros,
UUID conhecido, manipulação de identificadores, joins/bypass (profiles × memberships × workspaces, RPC).

## 8. Regressão (backend)

| Suíte | STAGING (obsk) |
|-------|----------------|
| `pytest api/tests` (backend completo) | **633/633 PASS** |
| `pytest scripts/tests` (runner migrations) | **16/16 PASS** |

Inclui RBAC2 (`test_rbac*.py`), isolamento de workspace (`test_workspace_isolation.py`) e fail-closed
(`test_auth_layer.py`).

## 9. Frontend (Vitest)

| Subconjunto | Resultado |
|-------------|-----------|
| `src/core/auth` + `src/core/workspaces` + `src/tv-desktop` | **104/104 PASS** (12 files) |
| `src/apps/admin` + `src/apps/auth` + `src/apps/shell` | **39/39 PASS** (5 files) |
| Suíte completa (`vitest run`) | **1668 PASS, 1 skipped, 1 failed** |
| Falha isolada | `RoomTicketForm.test.tsx "remove a foto antes de enviar"` — **test timeout 5000ms**; rerun isolado **3/3 PASS**; arquivo não modificado (`git diff` vazio); área chamados-público, sem relação com RLS → **flake** (mesmo padrão do `BatchCreateModal` na etapa 044-C) |
| Fluxos de Admin/WorkspaceContext/TV SetupFlow | verdes (ver seção 9 com detalhe: listagem Admin, WorkspaceContext load/select/troca/multi-ws, TV SetupFlow mantêm funcionamento — cobertos pelas suítes de componentes acima e pela matriz adversarial) |

## 10. Administração / WorkspaceContext / TV SetupFlow (cobertura comportamental)

- **Admin listagem de usuários**: super admin mantém acesso total via `is_super_admin()` (P9, matriz);
  não-super não recebe usuários de outros workspaces (A6: `visíveis=['a1','a2']` para `a1`).
- **WorkspaceContext**: load/select/troca/multi-ws — W3/W4/W5 (lista filtrada, vazio para sem membership,
  tudo para super) + suítes de componentes verdes.
- **TV SetupFlow**: continua considerando apenas os campi do usuário (filtro por RLS de workspaces);
  suítes `src/tv-desktop` verdes.

## 11. Backend
Ver §8 (633/633). Nenhuma rota sofreu alteração; backend roda com service key (imune ao RLS).

## 12. TypeScript
`npx tsc -b --pretty false` → **exit 0**.

## 13. Lint
`npx oxlint --ignore-pattern src/apps/reservalab/api/frontend --ignore-pattern desktop` → **exit 0**
(apenas warnings pré-existentes: no-unused-vars, exhaustive-deps, only-export-components; nenhum erro).

## 14. Monitoramento (pós-aplicação em STAGING)

Não há tráfego real no banco STAGING (DEV vazio, sem usuários reais — fixture-only). Observações durante
a execução:

- **403/400 observados**: apenas os **esperados por RLS** na matriz adversarial (W7 insert não-super
  403; DENY retornam 0 linhas/200 com corpo vazio; P12 200 com 0 rows). **Nenhum 403 inesperado** nas
  suítes de regressão.
- **5xx**: nenhum nas suítes backend/RPC (A4 `status=200 body=false`).
- **Erros de frontend/backend**: nenhuma falha de teste funcional (apenas flake de timeout em chamados-público
  e em BatchCreateModal — ambos passam isolados; não relacionados à RLS).
- **Realtime**: sem erro 42501 em nenhum SELECT da matriz (A9).

## 15. Fixtures (criadas e removidas)

Criadas em STAGING para a matriz (mesmo conjunto da etapa 044-C):
- Workspaces: `e2e-ws-a`/`e2e-ws-b`/`e2e-ws-c` (UUIDs `1111...`/`2222...`/`3333...`).
- Usuários `*@e2e-rls.example.com`: `sa` (super admin, sem memberships), `a1` (vis WS-A), `a2` (vis WS-A+WS-C),
  `b1` (vis WS-B), `c1` (vis WS-C), `ap1` (vis WS-A, membership `pending`), `nosm` (sem membership),
  `wnx` (workspace ghost `4444...`, sem membership). Senha `E2eDefault#2026x!`.
- Membroships criadas pela trigger 041 (6) + ajuste manual `ap1=pending`.

Removidas ao final (DELETE auth.users com sufixo `@e2e-rls.example.com` em cascata + workspaces `e2e-ws-%`):
**resíduo confirmado = 0** (profiles=0, memberships=0, workspaces=0, auth_users=0, leftover_ws=0).
Nenhuma fixture permaneceu. Nenhum usuário/role/membership real foi alterado (STAGING é banco vazio).

## 16. Validação de PROD read-only (nada modificado)

| Verificação | PROD (`ypkulvbllxgkjzhpzemf`) |
|-------------|-------------------------------|
| `max(schema_migrations.version)` | **043** |
| `bool_or(version='044')` | **false** (`044` NÃO aplicada) |
| `profiles_select.qual` | **`true`** (`USING(true)` ainda presente) |
| `workspaces_select.qual` | **`true`** (`USING(true)` ainda presente) |

Isolamento DEV/STAGING ⇄ PROD confirmado.

## 17. Critério de aprovação (resumo)

| Critério | Resultado |
|----------|-----------|
| Structural tests | PASS (24/24 estáticos + pg_policies/pg_proc read-only) |
| Adversarial tests | PASS (30/30) |
| Backend regression | PASS (633/633) |
| Frontend regression | PASS (194 fluxos-afetados; suíte completa 1668 pass + 1 skipped + 1 flake isolada) |
| RBAC2 regression | PASS (dentro do 633; test_rbac* verdes) |
| TypeScript | PASS (exit 0) |
| Lint | PASS (exit 0) |
| Cross-workspace | PASS (P3/P4/W2/W3/A2/A3/A6) |
| Fail-closed | PASS (P5-P8, W4, W7, W9, A1-A3, A7) |
| PROD untouched | CONFIRMED (read-only §16) |

**Sem nenhuma falha de isolamento. Sem nenhuma falha funcional relevante. Sem workaround necessário.**

---

## 18. Git (final)

Nenhum commit/push/PR/merge foi executado. O único diff do arquivo de migration é vazio (identidade
comprovada). Artefatos desta etapa permanecem em working tree (untracked) para a Etapa 044-E.

```text
 M docs/architecture/rbac2.0-etapa7-activation.md          (pré-existente, etapa anterior)
?? api/tests/test_044_rls_hardening_migration.py           (etapa 044-C)
?? scripts/e2e_rls_044.py                                  (etapa 044-C; UUIDs atualizados p/ STAGING)
?? scripts/e2e_db.py                                       (etapa 044-C, fixture helper)
?? supabase/migrations/044_rls_hardening_profiles_workspaces.sql (etapa 044-C)
?? docs/audits/architecture/rbac2.0-rls-hardening-044-discovery.md
?? docs/audits/architecture/rbac2.0-rls-hardening-044-design.md
?? docs/audits/architecture/rbac2.0-rls-hardening-044-dev-validation.md
?? docs/audits/architecture/rbac2.0-rls-hardening-044-staging-validation.md  (ESTE documento)
?? docs/audits/architecture/rbac2.0-prod-audit-2026-09.md  (auditoria pós-produção anterior)
?? screenshots/ · scripts/...                              (pré-existentes)
```

---

## VERDICT

```text
VERDICT: STAGING READY FOR REVIEW
```

Próxima etapa (separada, requer revisão humana): **044-E — preparação da PR e rollout para produção.**
Nada foi aplicado em PROD; a 044 continua restrita ao STAGING compartilhado (DEV) até aprovação.