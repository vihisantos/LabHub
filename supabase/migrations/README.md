# Supabase Migrations — LabHub

Fonte única de verdade do schema do banco. **Toda mudança de schema entra aqui**
como `NNN_nome.sql` (numeração sequencial, nunca reutilizar números).

## Como as migrations são aplicadas hoje (automatizado)

Desde `migrations.yml`/`scripts/migrate.py`, as migrations **pendentes** são
aplicadas **automaticamente após merge em `main`** via GitHub Actions →
Supabase Management API → PostgreSQL. Não há mais aplicação manual via SQL Editor
para migrations novas.

Fluxo do runner (`scripts/migrate.py`):

1. Garante a existência de `public.schema_migrations` (histórico de aplicação).
2. Lê as versões já aplicadas.
3. Resolve o **baseline** (ver abaixo).
4. Aplica cada migration pendente em ordem numérica, dentro de uma transação com
   `pg_advisory_xact_lock` (serializa execuções concorrentes). Só registra em
   `schema_migrations` depois que o SQL roda sem erro.

### Baseline (por que o runner não reaplica o histórico)

O banco de produção **já tem migrations 000-035 aplicadas manualmente, sem a
tabela `schema_migrations`**. Se o runner assumisse "tabela vazia = banco vazio",
tentaria reaplicar todo o histórico e quebraria produção. Por isso o baseline
representa "**tudo até aqui já está no banco** por decisão do operador":

- Configure `BASELINE_VERSION` (GitHub Secret) para **`035`** em produção —
  significa que 000-035 já estão aplicadas e o runner passa a aplicar apenas
  `036+`.
- Sem `BASELINE_VERSION` e com a tabela vazia, o runner usa como baseline a
  **maior versão do repositório** (não reaplica nada; só aplica o que vier
  depois). Seguro, mas em um banco **novo** prefira definir o baseline explícito
  e aplicar o histórico uma vez (ver "Ordem canônica").

A linha de baseline fica gravada em `schema_migrations` com `filename =
'__baseline__'`.

### GitHub Secrets (Settings → Secrets and variables → Actions)

| Secret | Obrigatório | Descrição |
|--------|-------------|-----------|
| `SUPABASE_PROJECT_REF` | sim | ex. `ypkulvbllxgkjzhpzemf` |
| `SUPABASE_ACCESS_TOKEN` | sim | PAT da Supabase (Management API) — prefira a PAT a expor a service role key de longa duração no CI |
| `BASELINE_VERSION` | não | `035` para produção (tudo até 035 já aplicado) |

### Rodar localmente

```sh
python -m pip install requests python-dotenv
SUPABASE_PROJECT_REF=... SUPABASE_ACCESS_TOKEN=... BASELINE_VERSION=035 python scripts/migrate.py
python scripts/migrate.py --dry-run        # só lista pendentes, não executa
```

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

Para produção com o runner ativo, **defina o baseline `035`**; o runner cuida de
`036+` automaticamente.

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
   + índice único; agora faz parte do baseline do runner (definir `BASELINE_VERSION=035`).
7. Verificar se há outras policies permissivas fora do inventário (query da 029).
