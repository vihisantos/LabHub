# Supabase Migrations — LabHub

Fonte única de verdade do schema do banco. **Toda mudança de schema entra aqui**
como `NNN_nome.sql` (numeração sequencial, nunca reutilizar números).

## Ordem canônica de aplicação

Em um banco **novo** (Supabase vazio), aplicar em ordem numérica via SQL Editor
ou `psql` (não há CLI/config local neste projeto):

```
000_bootstrap_baseline.sql   -- schemas stock/pcare + tabelas-base + TV + chamados (idempotente)
001..028                     -- histórico versionado (perfis, workspaces, RLS, revokes)
029_reconcile_legacy_policies.sql  -- remove policies permissivas legadas que 027 não cobriu
```

Em um banco **existente** (produção): aplicar apenas as migrations ainda não
aplicadas. Todas as novas migrations devem ser idempotentes (`IF NOT EXISTS`,
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

## Regras para novas migrations

1. Nome: `NNN_descricao_snake_case.sql` — próximo número livre.
2. Idempotente (produção e bancos novos devem aceitar re-execução).
3. Sempre considerar: RLS habilitado? Quem pode ler/escrever? Coluna `workspace_id`
   presente com FK `ON DELETE CASCADE`?
4. Nunca criar policy permissiva (`USING(true)`) em tabela de dados de app.
5. Ao final de mudanças de autorização, rodar a query de verificação do
   cabeçalho da `029` e conferir as exceções esperadas.

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

1. Rodar `029` em produção e validar com a query de verificação (fechar buraco
   de notificações cross-workspace aberto pela 026).
2. `pcare.assets`: criar policies restritivas e remover `assets_all`.
3. TV: identidade de kiosk → fechar RLS das `tv_*`.
4. Verificar se há outras policies permissivas fora do inventário (query da 029).
