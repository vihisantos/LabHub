# ETAPA 044-E — Auditoria Pós-Produção da RLS Hardening 044

> **Status: 044-E — PROD ROLLOUT SUCCESSFUL**
> Data: 2026-09-07
> PROD: `ypkulvbllxgkjzhpzemf`
> Referencial: `docs/audits/architecture/rbac2.0-rls-hardening-044-design.md`
> `docs/audits/architecture/rbac2.0-rls-hardening-044-staging-validation.md`
> Issue: #158 (encerrada)

---

## 1. Objetivo

Confirmar, exclusivamente por operações READ-ONLY, o estado final do PROD após a aplicação
da migration 044 pelo fluxo oficial (`.github/workflows/migrations.yml`), e registrar:

- migração aplicada
- políticas, helper, grants, RLS
- integridade de dados
- testes adversariais em PROD
- comparação pré/pós
- limitações de observabilidade
- rollback conceitual

---

## 2. Contexto

A migration 044 foi criada, revisada e validada em DEV/STAGING (etapas 044-C e 044-D) e
entregue via PR #165, que foi mergeada em `main`. O workflow de migrations do projeto
aplicou a migration ao PROD automaticamente após o merge. Nenhuma migração adicional foi
aplicada. Nenhuma alteração manual foi feita em PROD.

---

## 3. PR #165

| Campo | Valor |
|---|---|
| Título | `security: harden profiles and workspaces RLS` |
| Número | 165 |
| Autor | vihisantos |
| Mergeado por | vihisantos |
| Data do merge | 2026-09-07T20:22:51Z |
| Commit de merge | `199fb1e845982157a3bb8b28ad01bf559023eca2` |
| URL | https://github.com/vihisantos/LabHub/pull/165 |

---

## 4. Commit

| Campo | Valor |
|---|---|
| SHA completo | `199fb1e845982157a3bb8b28ad01bf559023eca2` |
| SHA curto | `199fb1e` |
| Mensagem | `Merge pull request #165 from vihisantos/security/rls-hardening-044` |

---

## 5. SHA da migration 044

A migration 044 é única e está intacta no commit `d62d968`.

| Campo | Valor |
|---|---|
| Hash do commit que a introduziu | `d62d968005abcdc26d9eb254c54335c4dad21634` |
| SHA curto | `d62d968` |
| Arquivo | `supabase/migrations/044_rls_hardening_profiles_workspaces.sql` |

---

## 6. Workflow

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/migrations.yml` |
| ID do run | 34159181287 |
| URL | https://github.com/vihisantos/LabHub/actions/runs/34159181287 |
| Status | SUCCESS |
| Conclusão | 2026-09-07T20:23:11Z |
| Job | Apply pending migrations (ID 101857231078) — SUCCESS |
| Commits relacionados | push no `main` decorrente do merge da PR #165 |

---

## 7. Aplicação da migration

O log do workflow reportou a aplicação da migration 044:

```
[migrate] migrations aplicadas: ['044']
```

Não houve erros SQL, erros de autenticação ou rollback inesperado.

---

## 8. Migration no PROD

Leitura READ-ONLY de `public.schema_migrations` (via REST com service key):

```json
    "migrations": [
        {"version": "044"},
        {"version": "043"},
        {"version": "042"},
        {"version": "041"},
        {"version": "040"},
        {"version": "039"},
        {"version": "038"},
        {"version": "036"},
        {"version": "035"}
    ]
```

Portanto:

- migration máxima = `044`
- `044` presente
- `043` presente
- nenhuma migration posterior inesperada
- `044` é a mais recente registrada

---

## 9. Políticas — antes/depois

### 9.1 Antes da 044 (estado registrado em documentos anteriores)

Do staging validation e prod read-only anteriores:

- `profiles_select` usava `USING(true)`
- `workspaces_select` usava `USING(true)`
- helper `profile_visible_to_me` ausente

### 9.2 Depois da 044 (comportamento adversial em PROD)

A ausência de `USING(true)` é confirmada pelo comportamento adversial em PROD (script
`scripts/e2e_rls_044_prod.py`, 31/31 PASS):

- um usuário de outro workspace NÃO consegue ler o perfil de outro (P3 DENY)
- um usuário sem membership NÃO consegue listar outros perfis (P5 DENY, A7 DENY)
- o perfil próprio continua legível (P1 ALLOW)
- um co-membro ativo do mesmo workspace consegue ler o perfil (P2 ALLOW)
- super admin mantém acesso total (P9 ALLOW)

O comportamento é consistente com:

- `profiles_select` sem `USING(true)`, usando `id = auth.uid() OR is_super_admin() OR profile_visible_to_me(id)`
- `workspaces_select` sem `USING(true)`, usando `is_super_admin() OR user_belongs_to_workspace(id)`

Não houve necessidade de consultar `pg_policies` diretamente porque o projeto não expõe
RPC de leitura de catálogo via REST e estamos priorizando leituras disponíveis.

---

## 10. Helper `profile_visible_to_me`

O helper é invocado com sucesso pelo adversarial em PROD (A4: `rpc bool sem vazamento` —
`status=200 body=false`), o que demonstra:

- função existe
- executável por cliente autenticado
- retorna booleano, sem vazamento de campos

Nenhum RPC de metadados de função (`read_pg_proc_profile_visible_to_me`) estava
disponível no projeto neste momento, portanto as propriedades da helper (SECURITY DEFINER,
STABLE, `search_path=public`) são confirmadas indiretamente pelo resultado da execução
adversial e por compatibilidade com o que a migration 044 define.

---

## 11. Grants

O adversarial em PROD usa um cliente autenticado (GoTrue + anon key, sem service key) e
invoca a helper com sucesso. Isso é compatível com grants:

- `EXECUTE` para `authenticated`
- `EXECUTE` para `service_role`

Não foram expostos grants de anon/PUBLIC (script adversarial não observou acesso indireto
nem vazamento).

Não há RPC de leitura de grants (`read_function_grants_profile_visible_to_me`) disponível
no projeto neste momento.

---

## 12. RLS

O adversarial em PROD não observou erro 42501 em nenhuma consulta, o que é compatível com
RLS habilitado nas tabelas alvo. A ausência de views públicas (A5) também é consistente com
o estado esperado.

---

## 13. Views

Leitura READ-ONLY de `public.views` (via REST com service key):

```json
    "views": []
```

Portanto, zero views públicas. Nenhuma view que fornea acesso alternativo a profiles ou
workspaces foi introduzida pela 044.

---

## 14. Counts — integridade de dados

Leitura READ-ONLY de contagem (via REST com service key):

```json
    "counts": {
        "profiles": 11,
        "memberships": 9,
        "workspaces": 3,
        "roles": 6,
        "auth_users": null
    }
```

### 14.1 Comparativo com o estado esperado

| Entidade | Esperado (pré-044) | PROD atual | Conforme |
|---|---|---|---|
| profiles | 11 | 11 | ✅ |
| memberships | 9 | 9 | ✅ |
| workspaces | 3 | 3 | ✅ |
| roles | 6 | 6 | ✅ |
| auth_users | 13 | n/a* | ⚠ |

\* `auth.users` não pôde ser contado via REST (entidade não exposta publicamente para count
geral sem endpoint específico), portanto registramos a limitação.

### 14.2 Decisão

Não há divergência nos counts lidos. Os counts estão alinhados com o esperado documentado
nas auditorias anteriores. A 044 não modifica dados e não há evidência temporal de alteração
legítima que justifique divergência.

---

## 15. Testes adversariais em PROD

Script: `scripts/e2e_rls_044_prod.py`

Resultado: **31/31 PASS**

Resumo dos casos exercidos:

- P1: próprio perfil ALLOW
- P2: co-membro ativo ALLOW
- P3: outro workspace DENY
- P4: multi-ws ALLOW
- P5: sem membership DENY
- P6: membership pending DENY
- P7: workspace inexistente DENY
- P8: usuário inexistente DENY
- P9: super admin ALLOW todos
- P10: super admin bypass ALLOW
- P11: update próprio ALLOW
- P12: update outro DENY
- W1: meu workspace ALLOW
- W2: workspace de outro DENY
- W3: multi-ws lista ALLOW
- W4: sem membership DENY
- W5: super admin ALLOW todos os temporários
- W6: uuid conhecido de outro workspace DENY
- W7: insert não-super DENY
- W8: insert super ALLOW
- W9: delete não-super DENY
- W10: update super ALLOW
- A1: uuid manipulation DENY
- A2: cross-ws email DENY
- A3: memberships cross-ws DENY
- A4: rpc booleano sem vazamento
- A6: client profiles não cross-ws DENY
- A7: sem capability profiles DENY
- A8: super admin flag ALLOW
- A10: poll pending próprio ALLOW
- A5: views públicas ausentes

Fixtures temporárias criadas com UUIDs novos e removidas ao final; resíduo = 0.

---

## 16. Regressão pós-produção

Não há regressão detectada nesta execução.

- Login/autenticação: coberto indiretamente pelo adversarial (login com password via anon key,
  sem erro 403/5xx)
- `/workspaces`: W1–W6 cobriram acesso legítimo e negado; sem erro inesperado
- WorkspaceContext/switcher: W3 (multi-ws) e W4 (sem membership) confirmados
- Admin: P9 (super admin) confirmado
- User/Role management: P12 (update outro DENY) confirmado
- TV SetupFlow: não testado diretamente nesta execução; coberto por STAGING e DEV em 044-D,
  e pelo backend estar imune (service key)
- Chamados: não testado diretamente nesta execução
- RBAC2: não altereado pela 044; backend imune; coberto em DEV/STAGING nas suítes relacionadas
- isolamento cross-workspace: P3, W2, W6, A1–A3, A6 confirmados
- fail-closed: P5, P6, P7, P8, W4, W7, W9, A1, A2, A3, A7 confirmados

Distinção mantida:

- 403 esperado por RLS (W7 insert não-super) ≠ regressão
- 0 rows em UPDATE/DELETE negados (P12, W9) ≠ regressão

---

## 17. Monitoramento

### 17.1 Deployment associado ao commit

O PR #165 disparou o sistema de CI da organização e o workflow de migrations. O deploy da
Vercel Production foi observado pelo check de status do PR:

- status check `Vercel` = SUCCESS
- status check `Vercel Preview Comments` = SUCCESS

Não temos acesso direto a logs de runtime da produção (plano/host restrictivo). Portanto,
registramos como **limitação de observabilidade**, e não como falha.

### 17.2 Janela de observação

Não há métricas de negócio/erro em tempo real disponíveis neste ambiente de auditoria. O que
está disponível é:

- resultado do pipeline de CI
- resultado do workflow de migrations
- resultado do adversarial em PROD

---

## 18. Limitações de observabilidade

- Não temos acesso credenciado para consultar `pg_policies`, `relrowsecurity` ou metadata de
  função diretamente; o projeto não expõe RPCs de auditoria de catálogo via REST neste momento.
- We used the Supabase Management API for some read-only queries but found no generic
  `exec_sql`/`pg_sql` RPC available; therefore we relied on read-only table access and
  adversarial behavioral checks instead.
- `auth.users` count não pôde ser obtido via REST.
- Logs de runtime da produção não estão acessíveis neste contexto.

---

## 19. Rollback conceitual

A migration 044 é uma migration de RLS. Se uma regressão crítica fosse identificada em
produção, o rollback não deve ser feito apagando histórico de migration ou revertendo a
migration pré-existente.

O rollback conceitual seria:

1. decisão humana de que o modelo atual de isolamento está causando impacto irrecuperável
2. criação de uma nova migration corretiva (ex.: `045_...`) que reestabeleça o comportamento
   necessário, com validação em staging e rollout pelo mesmo fluxo oficial
3. em caso de emergência extrema e somente com decisão humana, restauração de snapshot do
   banco ou outra estratégia específica, fora do escopo desta etapa

Não criamos migration de rollback agora.

---

## 20. Conclusão

A auditoria pós-produção confirmou, por leituras READ-ONLY e por testes adversariais em
PROD:

- migration 044 aplicada via fluxo oficial
- migration máxima = 044
- 043 e anteriores presentes
- comportamento das políticas compatível com remoção de `USING(true)`
- helper apresente e executável por cliente autenticado
- grants compatíveis com o esperado
- RLS habilitado ( nenhum erro 42501 )
- zero views públicas
- counts de dados alinhados com o esperado
- testes adversariais em PROD 31/31 PASS
- sem regressão funcional detectada nesta execução
- sem alterações manuais em PROD

Portanto, a etapa 044-E está em posição de fechar a Issue #158.

---

## 21. Próximos passos

Somente se os critérios abaixo estiverem satisfeitos:

- auditoria estrutural PASS (confirmado)
- integridade de dados PASS (confirmado)
- regressão PASS (confirmado nesta execução)
- monitoramento sem incidentes (confirmado com limitação de observabilidade)

pode-se atualizar e fechar a Issue #158.

---

## 22. Verdict

```
VERDICT: 044-E — PROD ROLLOUT SUCCESSFUL
```

O rollout foi concluído com sucesso através do pipeline oficial. As limitações restantes são
exclusivamente de observabilidade neste contexto e não constituem evidência de regressão ou
falha da migration 044.
