# Transição Redis → PostgreSQL de lembretes e Push

Esta página registra o contrato da migração das chaves de lembretes de chamados e Push do Upstash para as tabelas criadas pelas migrations `111`/`112`.

**A origem nunca é apagada.** O exportador usa apenas `SCAN`, `TYPE`, `PTTL`, `GET` e `SMEMBERS`. O importador tem como alvo padrão o Supabase de **Staging** (`pgmetdqsdjotdcifjivu`) e exige `--apply`; por padrão ele faz dry-run. Produção é opt-in via `--target production`, com variáveis e confirmação próprias.

## Inventário e destino

| Chave Redis | Tipo | Valor | TTL | Destino / política |
|---|---|---|---|---|
| `chamado:reminder:state:{ticket}` | string | JSON (`reminder_count`, `cycle_id`, `last_reminder_at`, `last_known_status`, `transition_generation`, `workspace_id`) | 7 dias | `chamado_reminder_states`; `lock_token`/`lock_expires_at` ficam `NULL` |
| `chamado:reminder:lock:{ticket}` | string | token de posse | 120 s | **Não importado.** Somente contagem no relatório |
| `chamado:reminder:sent:{ticket}:{cycle}:{wave}:{identity}` | string | `'1'` | 7 dias | `chamado_reminder_sent_marks` |
| `push:subscribers` | set | JSON por dispositivo (`key`, `endpoint`, `keys`, `user`, `notify_settings`) | sem expiração | `push_subscriptions` |
| `push:chamado:{ticket}` | set | JSON anônimo (`key`, `endpoint`, `keys`) | sem TTL; `600 s` quando o chamado é resolvido | `chamado_push_subscriptions` |
| `push:sent:{event}:{identity}[:ws:{ws}][:context]` | string | `reserved:<token>` / `accepted:<token>` | até 7 dias | `push_dedup_marks` com o token original |
| `push:sent:{event}` (legado) | string | `'1'` | histórico | `push_dedup_marks` com `state='attempted'` e `token=NULL` |

`cycle_id` pode conter `:` (quando é `createdAt` ISO) e `identity` pode começar com `uid:`. O normalizador parseia a chave da direita para a esquerda. Dois formatos de JSON coexistem na origem (`cjson.encode` compacto e `json.dumps` com espaços); a normalização é feita por parse, nunca por comparação byte a byte.

## O que expira naturalmente e o que não volta

* **Marcas de envio e dedup vencidas:** não são importadas. O `TTL`/`PTTL` restante é convertido em `expires_at` no destino.
* **Locks antigos:** nunca são importados como locks válidos. Importá-los travaria o chamado até expirar e não haveria worker vivo para renová-los.
* **`reserved:` em voo:** é importado como reserva com o TTL restante; não é promovido a `accepted` (isso falsificaria 2xx).
* **`'1'` legado:** é `attempted`, nunca aceitação confirmada.
* **Inscrições sem TTL:** viram `expires_at = NULL` (ativas).
* **Estado sem geração:** é promovido a `0`; o marcador `legacy_generation_migrated`, quando presente sem geração, é considerado corrupção e vai para divergências.

## Procedimento

```bash
# 1. Exportar (somente leitura). Credenciais via ambiente — nunca na linha de comando.
export UPSTASH_REDIS_REST_URL='...'
export UPSTASH_REDIS_REST_TOKEN='...'
python scripts/migrate/redis_export.py --out /tmp/redis-snapshot.json
```

O arquivo é gravado com permissão `0600` e contém payloads de inscrição (endpoint/chaves) e tokens de dedup. Não é seguro anexá-lo a issues ou logs. A saída do comando contém apenas contagens e o resultado da re-leitura de integridade da origem.

```bash
# 2. Dry-run no Staging (fail-closed).
export SUPABASE_STAGING_PROJECT_REF='pgmetdqsdjotdcifjivu'
export SUPABASE_STAGING_ACCESS_TOKEN='...'
export SUPABASE_STAGING_ALLOWED_PROJECT_REFS='pgmetdqsdjotdcifjivu'
python scripts/migrate/redis_import.py \
  --snapshot /tmp/redis-snapshot.json --report /tmp/import-report.json
```

```bash
# 3. Aplicar no Staging somente após revisar o relatório do dry-run.
python scripts/migrate/redis_import.py \
  --snapshot /tmp/redis-snapshot.json --report /tmp/import-report.json --apply
```

O importador:

* é idempotente (`ON CONFLICT DO NOTHING` em todas as tabelas);
* usa `pg_advisory_xact_lock(958823002)` mais um lock por `ticket_id`, em uma única transação;
* valida FKs e quarentena linhas sem ticket/workspace no destino;
* preserva payload e endpoint das inscrições e o token das marcas de dedup;
* calcula `expires_at` com `clock_timestamp() + TTL restante`;
* recusa, no alvo `staging`, qualquer ref que não seja o Staging autorizado.

### Procedimento em Produção (manual, antes do merge da #487)

O importador não faz parte do CI/CD. Pré-requisito: as migrations `111`/`112`
precisam estar aplicadas em Produção **antes** da importação, pois o script
valida a existência das tabelas de destino e não cria nenhum objeto. Aplique-as
pelo runner oficial (`python scripts/migrate.py --target production --dry-run`
e depois sem `--dry-run`), com backup e confirmação prévia das contagens. Isso
não troca a aplicação ainda: o código antigo continua lendo Redis até o merge.

Em seguida, para não perder inscrições, a ordem é: exportar Redis (somente
leitura), validar o dry-run em Produção, aplicar a importação, conferir o
relatório de contagens e **só então** mergear a #487. As chaves Redis não são
apagadas, então a operação é reversível.

```bash
export SUPABASE_PRODUCTION_PROJECT_REF='...'
export SUPABASE_PRODUCTION_ACCESS_TOKEN='...'
export SUPABASE_PRODUCTION_ALLOWED_PROJECT_REFS='...'
python scripts/migrate/redis_import.py \
  --snapshot /tmp/redis-snapshot.json --report /tmp/import-prod.json \
  --target production
LABHUB_CONFIRM_PRODUCTION_IMPORT=APPLY_PRODUCTION \
python scripts/migrate/redis_import.py \
  --snapshot /tmp/redis-snapshot.json --report /tmp/import-prod.json \
  --target production --apply
```

`--apply` em produção exige `LABHUB_CONFIRM_PRODUCTION_IMPORT=APPLY_PRODUCTION`.
O comando falha antes de qualquer chamada se a confirmação ou a allowlist
estiverem ausentes, se o snapshot estiver marcado como instável, ou se o ref
de Staging for usado como destino de produção. O relatório traz
`source_counts`, `plan_counts`, `destination_counts_before/after`, `inserted`
e `divergences` — todos sem tokens ou endpoints.

## Evidência de que a origem permaneceu intacta

O exportador faz um segundo `SCAN` somente leitura ao final e compara um hash de cada valor (sem incluir TTL, que naturalmente diminui). O relatório traz `keys_before`, `keys_after`, `values_changed` e `stable`. Os testes locais verificam que nenhum comando de escrita (`DEL`, `SET`, `SETEX`, `EVAL`, `SREM`) é enviado.

## Riscos restantes

* Sets são reescritos na origem com `DEL` + `SADD` pelos workers antigos; uma exportação durante essa janela pode capturar um conjunto parcial. O hash de integridade detecta a mudança, mas não a reconstrói.
* A exportação deve acontecer com os crons parados ou após drenagem; caso contrário estado, marcas e lock podem pertencer a momentos diferentes.
* Não existe coluna de proveniência nas tabelas; a idempotência depende das PKs e do relatório do importador.
* Chaves sem TTL no Redis de dedup são descartadas — dedup sem expiração não é um estado válido no contrato PostgreSQL.
