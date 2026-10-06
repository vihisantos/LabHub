# Supabase Migrations — LabHub

Fonte única de verdade do schema do banco. **Toda mudança de schema entra aqui**
como `NNN_nome.sql` (numeração sequencial, nunca reutilizar números).

## Como as migrations são aplicadas hoje (automatizado)

`migrations.yml` é a **cadeia única**: em Pull Request roda só a validação
efêmera; em `main` a mesma cadeia valida e **só então** aplica em produção via
GitHub Actions → Supabase Management API → PostgreSQL. Não há mais aplicação
manual via SQL Editor para migrations novas.

Fluxo do runner (`scripts/migrate.py`):

1. Verifica (read-only) se `public.schema_migrations` existe e a cria se preciso.
2. **Audita a identidade** de tudo que já está aplicado: cada versão precisa
   ainda existir no repositório com o **mesmo filename**. Renumeração aborta
   (ver "Renumeração").
3. Lê as versões já aplicadas.
4. Resolve o **baseline** (ver abaixo) — fail-closed em produção.
5. Aplica cada migration pendente em ordem numérica, dentro de uma transação com
   `pg_advisory_xact_lock` (serializa execuções concorrentes). Só registra em
   `schema_migrations` depois que o SQL roda sem erro.

### Baseline (por que o runner não reaplica o histórico)

O banco de produção **já teve migrations aplicadas manualmente, sem a tabela
`schema_migrations`**. Se o runner assumisse "tabela vazia = banco vazio",
tentaria reaplicar todo o histórico e quebraria produção. Por isso o baseline
representa "**tudo até aqui já está no banco** por decisão do operador":

- `BASELINE_VERSION` (GitHub Secret) = versão cuja aplicação já está garantida no
  banco; o runner aplica só o que está acima dela.
- **Em produção ela é obrigatória.** Sem ela (e com a tabela vazia) o runner
  **aborta** em vez de assumir a maior versão do repositório. O fallback seria um
  no-op que reporta sucesso: nada é aplicado, o processo termina com 0, e o
  schema congela sem ninguém perceber. Fail-closed é a escolha deliberada.
- **Local/dev** mantém o fallback para a maior versão do repositório, para não
  quebrar o fluxo de desenvolvimento. Banco novo/efêmero usa `--from-scratch`.

> **Qual é o valor de `BASELINE_VERSION` da produção hoje: INDETERMINADO.**
> Este repositório não tem como provar o conteúdo real de `schema_migrations` nem
> qual versão está garantida no banco de produção, e as respostas divergem entre
> "000-035 aplicadas manualmente" e a renumeração de 079/080/081 (commit
> `5394940`). **Não assuma um valor e não rode a aplicação** para descobrir:
> consulte `select version, filename from public.schema_migrations order by
> version;` no banco, reconcilie o histórico, e então defina o secret. O runner
> vai recusar a execução até isso ser feito — é o comportamento esperado.

A linha de baseline fica gravada em `schema_migrations` com `filename =
'__baseline__'`.

### Renumeração é um erro, não uma migration nova

Se uma migration já aplicada for renumerada (o arquivo `080_x.sql` virar
`083_x.sql`), a linha antiga em `schema_migrations` continuaria lá e a nova
entraria na fila de pendentes — o runner reexecutaria DDL sobre um banco que já
contém aquele schema. O resultado seria falha opaca de constraint ou, pior, um
segundo efeito idempotente silencioso.

Por isso o runner confere versão **e** filename de cada linha aplicada e aborta
antes de qualquer escrita, indicando o que divergiu. **Gaps de numeração são
legítimos** (o repositório não usa 037, 080, 081) e não são reportados.

Se a renumeração foi intencional, a reconciliação é do operador e explícita
(ajustar o histórico no banco). O runner não edita migrations nem reescreve
histórico.

### Destino da execução (fail-closed)

`--target production` (implícito em `MIGRATE_TARGET=production`) exige
configuração explícita do destino e é validado **antes de qualquer requisição
HTTP**:

- `SUPABASE_ALLOWED_PROJECT_REFS` (**variável de repositório**, não secret — um
  project ref não é credencial) precisa estar configurada; sem ela a execução
  aborta. É o que impede um secret trocado apontar para outro projeto.
- `SUPABASE_PROJECT_REF` precisa ter formato válido **e** estar na allowlist.
- Um `--target` desconhecido (ex.: `staging`) é rejeitado.

As mensagens de erro dizem *que* regra quebrou, nunca o valor do ref nem token.

### GitHub Secrets e variáveis (Settings → Secrets and variables → Actions)

| Nome | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| `SUPABASE_PROJECT_REF` | secret | sim | project ref de produção |
| `SUPABASE_ACCESS_TOKEN` | secret | sim | PAT da Supabase (Management API) — prefira a PAT a expor a service role key de longa duração no CI |
| `BASELINE_VERSION` | secret | **sim em produção** | versão já garantida no banco. Sem ela o runner aborta |
| `SUPABASE_ALLOWED_PROJECT_REFS` | **variável** | **sim em produção** | allowlist de destinos permitidos, separada por vírgula |

### Rodar localmente

```sh
python -m pip install requests python-dotenv

# local (fallback de baseline preservado para desenvolvimento)
python scripts/migrate.py --dry-run        # plan/print SÓ (leitura); nunca escreve
                                                           # CREATE TABLE, INSERT de
                                                           # baseline nem migrations

# produção: exige os dois valores de configuração acima
SUPABASE_PROJECT_REF=... SUPABASE_ACCESS_TOKEN=... \
BASELINE_VERSION=<confirmado no banco> \
SUPABASE_ALLOWED_PROJECT_REFS=<project ref de produção> \
  python scripts/migrate.py --target production --dry-run
```

### Banco novo vs produção (separação de conceitos)

O runner tem DUAS interpretações de "tabela vazia", e elas NÃO devem ser misturadas:

- **Produção** (tabela vazia + sem `BASELINE_VERSION`): **aborta**. O baseline
  implícito foi removido do caminho de produção justamente por ser um no-op que
  reporta sucesso.
- **Local/dev** (tabela vazia + sem `BASELINE_VERSION`): baseline implícito =
  **maior versão do repositório**. Nada é reaplicado; só o que vier depois.
- **Banco novo/efêmero** (CI, staging zerado): use `--from-scratch` (ou env
  `MIGRATE_FROM_SCRATCH=1`) — aplica **TODAS** as migrations, `000` em diante,
  sem gravar linha de baseline. Nunca rode `--from-scratch` numa unidade real; é
  voltado ao PostgreSQL descartável do CI.

### Transação embutida na 000 (normalização no runner)

A `000_bootstrap_baseline.sql` contém `BEGIN;`/`COMMIT;` de nível de arquivo
(baselined em produção, nunca aplicada pelo runner). Como o runner é o dono da
transação (wrapper advisory lock + registro + commit), o corpo passou por
`strip_inner_transaction` no momento de executar — remove UM `BEGIN;` top-level
inicial e UM `COMMIT;` final, se existirem — o que torna a `000` aplicável numa
cadeia completa de banco novo sem quebrar a atomicidade do registro.

São 12 migrations com esse par (`000`, `029`, `030`, `032`, `034`, `038`, `039`,
`055`, `056`, `057`, `058`, `061`), não só a `000`.

### Validação em CI (PR) — nunca toca DEV/PROD

`.github/workflows/migrations.yml` roda em Pull Request (path-filtered) e cria um
**PostgreSQL 16 descartável** (`services: postgres`) no próprio job:

1. roda a suíte unitária do runner (`scripts/tests/test_migrations.py`, mocks);
2. roda o teste estático da migration 039 de TV;
3. prova que `scripts/migrate.py --dry-run` é **read-only** (nem a tabela
   `schema_migrations` é criada — ver `scripts/ci/ci_dry_run_smoke.py`);
4. aplica a cadeia **completa** via runner com `--from-scratch` (exercita a cadeia
   real) e verifica idempotência (rerun não duplica) e consistência de
   `schema_migrations`;
5. roda todos os `supabase/migrations/tests/*.sql` (estruturais + behavioral);
6. roda o behavioral da **072** (`scripts/ci/behavioral_072.py`, 13 pontos).

Em `main` o job `migrate` roda **apenas se `validate` passou** (`needs: validate`)
e faz um dry-run read-only em produção antes de aplicar. Os jobs de produção
usam `environment: production` e `concurrency` com `cancel-in-progress: false`
(aplicações em produção não podem se cancelar no meio). O job de validação é o
único com `cancel-in-progress: true`. O workflow de PR não conhece nenhum
segredo de DEV/PROD — só a `DATABASE_URL` do próprio banco efêmero.

Para executar o mesmo fluxo fora do Actions (precisa de um PostgreSQL local ou
container): `DATABASE_URL=postgresql://... python scripts/ci/ci_migration_suite.py`.

### Troubleshooting

- **Migration falhou**: o runner sai com código ≠ 0 e **não** marca a migration
  como aplicada (a transação inteira é revertida). Corrija o SQL e reexecute.
- **Reaplicar mesmo o que já rodou**: como as migrations são idempotentes,
  reexecutar é seguro; `schema_migrations` evita trabalho repetido.
- **Sem variáveis de ambiente**: o runner falha cedo com mensagem clara (exit 2).
- **Concorrência**: `pg_advisory_xact_lock` serializa aplicações simultâneas; cada
  migration é aplicada + registrada na mesma transação.

## Ordem canônica de aplicação

Em um banco **novo** (Supabase vazio), a ordem é a numérica; sem a automatização
(ou com baseline `000`), aplicar via SQL Editor ou `psql` (não há CLI/config
local neste projeto):

```
000_bootstrap_baseline.sql   -- schemas stock/pcare + tabelas-base + TV + chamados (idempotente)
001..028                     -- histórico versionado (perfis, workspaces, RLS, revokes)
029_reconcile_legacy_policies.sql  -- remove policies permissivas legadas que 027 não cobriu
```

Para produção com o runner ativo, o baseline precisa ser **confirmado contra o
banco** (ver "Baseline" — o valor atual é INDETERMINADO e o runner recusa a
execução até ser definido). O runner cuida do `baseline+1` em diante
automaticamente.

Todas as novas migrations devem ser idempotentes (`IF NOT EXISTS`,
`DROP ... IF EXISTS`, guards `duplicate_object`) para tolerar drift entre
ambientes. A `000` é segura para rodar em produção (só cria o que falta).

## O que cada migration faz (resumo)

| # | Arquivo | Resumo |
|---|---------|--------|
| 000 | `000_bootstrap_baseline.sql` | Baseline consolidado: cria (se não existir) tudo que as 001-029 presumem: schemas `stock`/`pcare`, tabelas dos apps Stock/PCare/TV/Chamados com `workspace_id`, RLS habilitado **sem policies** (deny-by-default), grants finais pós-026 |
| 001-008 | perfis/admin | Tabela `profiles`, policies admin, colunas snake_case, accent/avatar/status |
| 009 | `009_workspace_isolation.sql` | Tabela `workspaces`, coluna `workspace_id` nas tabelas existentes, policies base |
| 010-014 | evoluções | spreadsheet_url/labs, tablet_reservations, avatar/status, app_access, banner |
| 015 | `015_fix_signup_pending.sql` | Fluxo signup pending |
| 016 | `016_notifications_stock_expiry.sql` | `stock.notifications` + defaults |
| 017-018 | home mode / grants | `home_mode`, grants stock sync |
| 019 | `019_tv_music_requests.sql` | `tv_music_requests` com policies por role |
| 020 | `020_workspace_settings.sql` | `disabled_apps` JSONB em workspaces |
| 021 | `021_workspace_delete_backup.sql` | `workspace_backups`, FKs ON DELETE CASCADE, audit log |
| 022 | `022_fix_admin_profiles.sql` | Correção admin/profiles |
| 023-025 | hardening | pg_sql helper, registry global de assets, revoke pg_sql |
| 026 | `026_security_revoke_anon_stock_pcare.sql` | Grants: anon fora de stock/pcare; authenticated DML; RLS notifications (**cria policy permissiva `notifications_all` — removida pela 029**) |
| 027 | `027_rls_workspace_isolation.sql` | Isolamento por workspace nas 15 tabelas stock/pcare/notifications + `user_belongs_to_workspace()`; **não cobre `pcare.assets` nem `tv_*`** |
| 028 | `028_authorization_consolidation.sql` | Consolidação da camada de autorização (is_super_admin etc.) |
| 029 | `029_reconcile_legacy_policies.sql` | DROP das policies permissivas legadas (`*_all`, `allow_all`, `notifications_all`) nas tabelas já cobertas pela 027 |
| 030 | `030_tv_device_identity.sql` | Identidade do kiosk TV: fecha RLS das `tv_*` (SELECT por workspace p/ device/membro/admin; escrita só admin/membro; device atualiza só a própria linha em `tv_devices`); REVOKE anon |
| 031 | `031_workspace_app_settings_and_backups.sql` | Fundação da arquitetura de apps por workspace: `workspace_app_settings` (config JSONB única por workspace+app, escrita só super admin/admin do ws) + `app_data_backups` (trilha append-only pré-purge: sem UPDATE/DELETE policies); helper `can_manage_workspace_apps()`; REVOKE anon |
| 032 | `032_tv_app_data_purge.sql` | Purga de dados TV com escopo por workspace |
| 033 | `033_workspace_isolation_hardening.sql` | Endurecimento do isolamento por workspace (zero-trust null guards) |
| 034 | `034_drop_legacy_rls_policies.sql` | DROP de 14 policies legadas que burlavam o isolamento |
| 035 | `035_tracking_token.sql` | Chamados: credencial anônima `tracking_token_hash` (acesso limitado a um chamado) + índice único |

> `tests/036_schema_migrations_checks.sql` valida a tabela de histórico
> do runner (não é uma migration de schema).

## Regras para novas migrations

1. Nome: `NNN_descricao_snake_case.sql` — próximo número livre.
2. Idempotente (produção e bancos novos devem aceitar re-execução).
3. Sempre considerar: RLS habilitado? Quem pode ler/escrever? Coluna `workspace_id`
   presente com FK `ON DELETE CASCADE`?
4. Nunca criar policy permissiva (`USING(true)`) em tabela de dados de app.
5. Ao final de mudanças de autorização, rodar a query de verificação do
   cabeçalho da `029` e conferir as exceções esperadas.

### Testes SQL

`tests/NNN_*_checks.sql`: scripts de asserção executáveis no SQL Editor
**depois** de aplicar a migration correspondente. Cada drift relevante (tabelas,
colunas, RLS, policies, grants) dispara `RAISE EXCEPTION`; execução limpa termina
com `NOTICE OK`. Rodar em staging antes de produção. O
`tests/036_schema_migrations_checks.sql` valida a tabela de histórico do runner.

## Drift conhecido vs produção (auditado em 2026-08)

- `tv_events.show_countdown` / `has_welcome`: criadas manualmente em produção;
  inclusas na `000` com guard (usadas por `src/apps/tv/types/index.ts`).
- `pcare.assets`: ainda com policy legada `assets_all` (USING true) — dívida
  documentada; tratar em PR dedicado antes de fechar isolamento.
- Tabelas `tv_*`: RLS aberto para anon/authenticated por causa do kiosk sem
  identidade própria — primeiro PR da fase TV resolve (device identity) e então
  fecha as policies.
- `stock.notifications.workspace_id` é TEXT (legado), não UUID — a função
  `user_belongs_to_workspace(text)` da 027 existe por isso.
- Backfill legado (script `supabase-migration-workspace.sql`) não roda mais:
  produção já foi atribuída ao primeiro workspace.

## Arquivo morto

- `supabase/archive/manual-sql/` — scripts avulsos aplicados manualmente no
  Supabase antes do versionamento (origem das tabelas stock/pcare/tv/chamados).
  Mantidos como registro histórico; **não executar**.
- `src/apps/tv/supabase*.sql` — idem, com banner DEPRECATED no topo.

## Pendências de segurança rastreadas

1. ~~Rodar `029` em produção~~ **Concluída (2026-08-24)** — aplicada via Management API;
   policies legadas `USING(true)` removidas de stock/pcare/notifications.
2. `pcare.assets`: criar policies restritivas e remover `assets_all` (dívida
   documentada da 029 — requer substituto antes de remover).
3. ~~Aplicar `030` em produção~~ **Concluída (2026-08-24)** — identidade do kiosk
   ativa; TVs legadas voltam ao setup na primeira boot.
4. ~~Aplicar `031` em produção~~ **Concluída (2026-08-24)** — `workspace_app_settings`
   + `app_data_backups` criadas; checks de `tests/031_rls_checks.sql` passaram
   sem drift no banco real.
5. ~~Aplicar `032`/`033`/`034` em produção~~ **Concluída (2026-08-24/25)** —
   purga TV, endurecimento de isolamento e DROP das policies legadas aplicados.
6. ~~Aplicar `035` em produção~~ **Concluída (2026-08-27)** — `tracking_token_hash`
   + índice único; agora faz parte do baseline do runner (confirmar o valor de
     `BASELINE_VERSION` contra o banco antes de aplicar).
7. Verificar se há outras policies permissivas fora do inventário (query da 029).
