# Experimento: Chamados por evento com QStash + Workflow (Staging)

**Estado:** experimental, desabilitado por padrão. O cron de Push, o worker
centralizado e as PRs #487/#489 continuam inalterados. Nenhum envio depende
deste experimento enquanto a flag estiver desligada.

## Arquitetura durável (revisão da PR #491)

A versão anterior publicava no QStash **dentro da requisição HTTP** que abria
ou reabria o chamado. Isso fazia o professor depender de uma chamada externa e
perdia o agendamento silenciosamente se o QStash falhasse. A correção usa o
PostgreSQL como fonte de verdade:

1. A criação/reabertura grava um pedido na outbox **dedicada**
   `public.chamados_workflow_outbox` (migrations **115/116**). Essa tabela não
   é a `notification_outbox` das PRs #489 — nenhum evento de Push é lido ou
   escrito aqui. A chave de dedup é `ticket_id + ciclo`; a primeira gravação
   vence.
2. Antes de reclamar, o dispatcher executa uma **reconciliação durável** das
   gravações perdidas (migrations **117/118**): um tick atômico limita a
   varredura a uma janela indexada (padrão: 24 h, no máximo 20 linhas a cada
   15 min), e a mesma RPC de enqueue faz dedup por chamado+ciclo. Assim, uma
   falha temporária do Supabase no INSERT do chamado não perde o agendamento.
   A migration **119** corrige a seleção: índice parcial em `updatedAt`,
   comparação do `cycle_key` exato já presente na outbox (hash SHA-256 idêntico
   ao da aplicação) e lotes limitados em ordem FIFO (`updatedAt` ASC). Ciclos
   já agendados não ocupam os 20 slots de todas as varreduras, e um chamado
   criado depois do início de uma varredura não fica preso atrás de cursor
   antigo. A contraparte somente leitura é a migration **120**.
   **Limite operacional:** a reconciliação continua varrendo no máximo
   **20 candidatos por tick**, a cada 15 min, dentro de uma janela de
   **24 h** (teto configurável de 7 dias). Em volume excepcional, um chamado
   elegível pode envelhecer além da janela antes de ser recuperado. Monitorar
   a fila: comparar o total de chamados `aberto` sem responsável com
   `now() - "updatedAt" > interval '24 hours'` contra as linhas da outbox,
   além de `status='dead'`, tentativas esgotadas e `last_error` dos jobs.
   Esse backlog é uma métrica de alerta; a flag continua desligada até que o
   experimento seja validado.
3. Um dispatcher protegido por `CRON_SECRET` reclama um lote pequeno
   (`FOR UPDATE SKIP LOCKED`), publica no QStash com `deduplication_id`
   estável por job e confirma a linha. Falhas voltam para `pending` com backoff
   exponencial limitado (15 s, 30 s, 60 s, 120 s, 300 s); após 5 tentativas a
   linha vira `dead`, sem apagar nada. Nenhuma chamada externa acontece no
   request do professor.
4. O Workflow recebe **somente UUIDs** (`ticket_id`, `workspace_id`, `job_id`)
   e revalida o ciclo vigente no PostgreSQL a cada onda. Um job antigo (ex.:
   Workflow de antes de uma reabertura/troca de responsável) termina sem
   lock, marcação ou Push.
5. A checagem de erro do `process_one()` acontece **dentro** da função
   executada por `context.run()`. Validar depois gravaria a etapa com erro
   como sucesso na SDK oficial (comprovado com `upstash-workflow==2.0.0`).

O MVP continua com **3 checagens** (2, 4 e 6 minutos após o disparo). Isso
**não substitui as 10 ondas legadas** e o cron atual não é removido.

## Escopo técnico

- Criação pública após o INSERT bem-sucedido: enfileirar se `aberto` e sem
  `assignedToUserId`.
- PATCH que realmente reabre o chamado ou remove seu responsável: enfileirar
  quando resultar em `aberto` sem responsável.
- Payload QStash: somente os três UUIDs canônicos acima. Nenhum token de
  acompanhamento, nome, e-mail, descrição ou segredo. Corpo marcado com
  `redact={"body": True}` na publicação.
- Destino exclusivo: `LABHUB_CHAMADOS_WORKFLOW_URL` (HTTPS, caminho exato) ou,
  em Preview, `VERCEL_URL` fornecida pela plataforma. Nunca Host/headers do
  cliente.
- Endpoint `/api/chamados/reminders/workflow`: registrado somente se a flag e
  as credenciais estiverem presentes, com assinatura verificada pelo `Receiver`
  real (chaves atual e próxima).
- Endpoint `/api/chamados/workflow/outbox/dispatch`: `POST`, protegido por
  `CRON_SECRET`, habilitado somente com a flag. Nunca recebe workspace ou URL
  do chamador.
- A cada onda: consulta de **um** ticket do workspace esperado; reaproveita
  histórico (`ticket_events`), autorização de destinatários, locks, marcas e
  dedup do PostgreSQL. Estado atual e histórico são a autoridade para
  assumidos, encerrados/indeferidos, em espera, reabertos e remoção de
  responsável.
- Falha ao enfileirar não desfaz a criação/PATCH do chamado. O log registra
  apenas a classe da exceção (nunca segredos) e a reconciliação recupera a
  linha no próximo tick do dispatcher. O `updatedAt` é normalizado para UTC
  antes do hash, de modo que criação e reconciliação geram o **mesmo** ciclo.
- O bypass da Preview é injetado como header **no cliente QStash usado pelo
  servidor** (`Upstash-Forward-x-vercel-protection-bypass`), nunca na URL. Ele
  não vem de Host, parâmetro de request, browser, resposta ou log da aplicação.
  Um filtro de logging redobra o valor caso alguma biblioteca o inclua em uma
  exceção. O header é injetado em **dois níveis**: na chamada à API QStash
  (publicação individual) e dentro de **cada mensagem** de `/v2/batch`. O
  QStash não replica headers do nível da requisição para o lote; sem isso, a
  retomada de `context.sleep()` ficava sem o bypass e nunca chegava à rota
  assinada (falha encontrada e corrigida nesta rodada).

## Configuração exclusiva de Preview/Staging

No projeto Vercel **Preview**, para a branch
`feat/chamados-qstash-workflow-staging`, configurar no servidor:

```text
LABHUB_CHAMADOS_WORKFLOW_ENABLED=true
# Opcional na Vercel Preview: URL deduzida de VERCEL_URL da plataforma.
# LABHUB_CHAMADOS_WORKFLOW_URL=https://<preview>/api/chamados/reminders/workflow
QSTASH_TOKEN=<token de QStash US ou EU>
QSTASH_CURRENT_SIGNING_KEY=<chave atual do mesmo QStash>
QSTASH_NEXT_SIGNING_KEY=<próxima chave do mesmo QStash>
# VERCEL_AUTOMATION_BYPASS_SECRET é fornecida automaticamente pela Vercel
# aos deployments; não criar variável manual nem expor ao browser.
```

No GitHub (variáveis de repositório, **não** segredos novos):

```text
LABHUB_CHAMADOS_WORKFLOW_DISPATCH_ENABLED=false
```

O dispatcher **não** é acionado pelo `push-cron.yml`: a etapa opt-in foi
removida, então o agendamento que roda na `main` nunca alcança uma Preview.
O único gatilho é o workflow manual `staging-reminders-integration.yml`, que
usa `preview_dispatch_url` (um input, não variável global) e exige `confirm=STAGING`.

O Supabase usado na Preview deve ser **Staging**
(`pgmetdqsdjotdcifjivu`). Confirme isso antes de qualquer teste real. URLs de
outros projetos são rejeitadas pelo script de smoke. Gere uma **nova Preview**
depois de cadastrar os segredos: Previews antigas não os recebem.

Com Deployment Protection ligado, o cron e o smoke (GitHub -> Preview) enviam
`x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET` como **header**,
conforme a documentação da Vercel para automação. O valor é um
*Protection Bypass for Automation* do projeto Vercel (32 caracteres
alfanuméricos), mantido apenas no secret do repositório; nunca é variável
manual, parâmetro de URL compartilhável, resposta ou log da aplicação.

Para o caminho inverso (QStash -> Preview), a documentação oficial da Upstash
orienta configurar o bypass **no cliente QStash** para que todas as etapas,
inclusive retomadas após `context.sleep()`, cheguem à Preview protegida. A SDK
Python `qstash==3.4.0` não expõe uma opção de headers padrão, e a
`upstash-workflow==2.0.0` remove headers `x-vercel-*` recebidos do usuário
(`_recreate_user_headers`). Por isso injetamos
`Upstash-Forward-x-vercel-protection-bypass` diretamente no `http.request` do
cliente usado tanto na publicação inicial (`_qstash_client`) quanto pelo próprio
`Serve.route(..., qstash_client=...)`. O QStash encaminha esse header ao destino
em cada mensagem; a URL continua limpa, sem query parameter. O valor vem da
variável de sistema `VERCEL_AUTOMATION_BYPASS_SECRET`, nunca de request, e não
altera a verificação do `Receiver` (a assinatura cobre o corpo da mensagem).
Nenhuma proteção é desligada e o segredo não aparece em frontend, URLs,
respostas ou logs. Recomenda-se rotacionar o bypass ao encerrar o experimento.
**Não habilitar a flag em Production.**

## Procedimento de validação

1. Rodar as migrations 115/116 **somente em Staging** via
   `scripts/apply_staging_migration.py` (dry-run primeiro) ou pelo workflow
   manual `staging-reminders-integration.yml` com
   `apply_workflow_outbox_migration=true`. Depois aplicar 117/118 com
   `apply_reconcile_migration=true` e 119/120 com
   `apply_reconcile_priority_migration=true`. Nada em Production.
2. Rodar `python -m pytest api/tests/test_chamados_qstash_workflow.py
   api/tests/test_chamados_workflow_real_sdk.py
   api/tests/test_116_chamados_workflow_outbox_contract.py
   api/tests/test_118_chamados_workflow_outbox_reconcile_contract.py
   api/tests/test_119_chamados_workflow_outbox_reconcile_priority_contract.py -q` com as
   dependências de `requirements.txt` instaladas, mais a suíte completa da API
   e o runner de migrations. Os testes com SDK real usam apenas transporte
   substituído; **não** provam integração com o QStash real. Os testes de
   `chamados_workflow.py` são simulados; os arquivos `*_real_sdk.py` e os
   testes SQL em `supabase/migrations/tests/` usam as bibliotecas e o
   PostgreSQL reais (sem chamada externa).
3. Em Preview, confirme: flag OFF não registra rota nem agenda; assinatura
   ausente/inválida é rejeitada pela SDK; URL do workflow é a do deploy e não
   a do Host enviado.
4. Faça smoke real no dispatcher (`POST .../outbox/dispatch` com
   `Authorization: Bearer $CRON_SECRET`), exigindo no JSON `enabled=true`,
   `error=null` e as chaves de reconciliação. Para a publicação real, rode o
   workflow manual com `run_workflow_e2e=true`: o script
   `scripts/ci/chamados_workflow_e2e_staging.py` cria workspace/ticket
   sintéticos, confirma a linha `published` na outbox e observa as retomadas
   por 150 s. Confirme em `vercel logs` o POST à rota assinada e o batch da
   SDK, e no painel Upstash o run com 3 etapas e os intervalos; interrompa
   assumindo o chamado e confirmando que as próximas checagens param.
5. Para a validação funcional final, rode o mesmo workflow manual com
   `run_workflow_waves_e2e=true`, `wave_scenario=both` e
   `preview_dispatch_url` apontando para a Preview atual. O script
   `scripts/ci/chamados_workflow_waves_e2e_staging.py` cria dois workspaces
   sintéticos: em `unassigned` acompanha as ondas de 2/4/6 min; em `assigned`
   atribui um técnico sintético após a primeira onda e exige que as contagens
   de estado/marcas/eventos fiquem congeladas nas ondas 2 e 3. Ele imprime
   janelas ISO por caso para correlacionar `vercel logs runtime` (linhas
   `verificação:` e `onda N concluída`) e `vercel logs requests` (POSTs do
   QStash à rota assinada) com o painel do Upstash. Use `KEEP_E2E_DATA=true`
   para inspecionar e depois limpe com `cleanup_e2e_ids` usando os
   `CLEANUP_IDS` impressos.
6. Simule falha temporária do QStash interrompendo a publicação e confirmando
   que a linha volta para `pending`, é republicada com o **mesmo**
   `deduplication_id` e não gera dois runs. Repita o mesmo ciclo e confirme
   uma única linha na outbox.
7. Meça por 24 h: mensagens e steps Upstash, latência por evento, chamadas
   PostgREST por chamado, ausência de duplicidade e falhas no DLQ. Separe
   **medições** de estimativas. Não desligar o cron nem ativar em Production
   sem comparar custo, quantidade e comportamento.

## Antes do merge na `main`

O merge acionará o **runner de migrations de produção**: mesmo com
`LABHUB_CHAMADOS_WORKFLOW_ENABLED=false` e
`LABHUB_CHAMADOS_WORKFLOW_DISPATCH_ENABLED=false`, as versões **115–120**
podem ser aplicadas em Production pelo fluxo oficial. A flag desligada evita
publicar no QStash e registrar rotas, mas **não** impede DDL, criação de
índices, funções, grants e registros em `schema_migrations`.

Antes de autorizar o merge, a validação habitual de produção é obrigatória:

- backup/restore recente do banco e janela de manutenção aprovada;
- revisão do plano de aplicação das migrations 115–120 no runner de produção;
- checagem de compatibilidade com o esquema atual (objetos já existentes,
  índice `idx_chamados_tickets_workflow_reconcile`, funções e grants);
- confirmação de que as tabelas ficarão vazias/inofensivas com a flag OFF e
  que o cron legado continua operando normalmente;
- plano de rollback documentado na seção abaixo.

Revisão estática já feita nesta branch (21/11/2026): as seis migrations usam
`CREATE TABLE/INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION` e não contêm
`DROP TABLE`/`DROP INDEX`; a assinatura de
`chamados_workflow_outbox_reconcile_candidates(integer, integer)` é preservada
entre 117 e 119. Isso reduz o risco de DDL, mas **não** substitui a checagem do
esquema real nem o backup/restore em produção, que continuam pendentes e são a
última barreira antes do merge.

O merge não deve ser interpretado como habilitação do experimento.

## Correções de revisão (21/11/2026, segunda rodada)

- Reconciliação sem *starvation*: a 117 selecionava os 20 registros mais
  recentes **mesmo quando o ciclo já estava na outbox**. A 119 passou a
  comparar o `cycle_key` exato (hash SHA-256 idêntico ao de
  `chamados_workflow.cycle_key`) e a entregar lotes limitados em ordem FIFO
  (`updatedAt` ASC), com índice parcial para chamados elegíveis. Não há cursor
  persistente, o que evita esconder chamados criados durante a varredura. O
  contrato read-only correspondente é a 120.
- Isolamento do cron: a variável
  `LABHUB_CHAMADOS_WORKFLOW_DISPATCH_ENABLED` foi confirmada como `true` no
  repositório e foi **desligada** (`false`); além disso, a etapa que chamava a
  Preview foi removida de `.github/workflows/push-cron.yml`. Mesmo uma futura
  alteração da variável não reintroduz o comportamento no agendamento da
  `main`. O único acionamento continua sendo o workflow manual de Staging.
- Limpeza controlada: os registros preservados com `KEEP_E2E_DATA=true` podem
  ser removidos com `cleanup_e2e_ids` no workflow manual ou com
  `scripts/ci/cleanup_chamados_workflow_e2e.py`. O script exige UUIDs canônicos,
  `SUPABASE_STAGING_ALLOWED_PROJECT_REFS` e slug `wf-e2e-`; nada é apagado se o
  workspace não for sintético. Os dois conjuntos preservados nos runs
  `44903817006` e `44904523055` foram removidos no run `44914443756` (2/2).
- As migrations 119/120 foram aplicadas **somente em Staging** no run
  `44914826872`, com dry-run prévio e preflight fail-closed. A variável
  `LABHUB_CHAMADOS_WORKFLOW_DISPATCH_ENABLED` foi confirmada como `false`.

## Evidências da validação (21/11/2026)

- PR #491, branch `feat/chamados-qstash-workflow-staging`, SHA do código
  validado em Staging `b10369a0930b26142e547bd12ed6c3c326d28c47`. Todos os
  checks passaram nesse SHA:
  Analyze JS/Python, Lint, Build, CodeQL, Migration runner tests, Python API
  tests, Test, validação de migrations em PostgreSQL efêmero e Vercel Preview.
- A suíte local de APIs terminou em **2398 passed, 7 skipped, 2 failed**; as
  duas falhas (`test_patch_troca_foto_destroi_antiga_no_cloudinary` e
  `test_patch_mesma_foto_nao_destroi`) são pré-existentes no HEAD limpo e não
  foram introduzidas por esta PR.
- Testes específicos desta correção: **53 passed** com as dependências reais
  instaladas (`test_116_chamados_workflow_outbox_contract.py`,
  `test_118_chamados_workflow_outbox_reconcile_contract.py`,
  `test_chamados_qstash_workflow.py`, `test_chamados_workflow_real_sdk.py`),
  incluindo SDK real `upstash-workflow==2.0.0` com transporte substituído. Há
  teste específico provando que o header de bypass chega dentro da mensagem de
  `context.sleep()` (caminho que falhou na primeira tentativa real) e que um
  corpo de batch inesperado falha fechado.
- Migrations 115/116 aplicadas **somente em Staging**
  (`pgmetdqsdjotdcifjivu`) pelo workflow manual
  `staging-reminders-integration.yml` (run `44870468268`), e 117/118 nos runs
  `44902835870` e `44904523055`, sempre com preflight fail-closed e dry-run
  prévio. Nenhuma migration foi aplicada em produção.
- O smoke reforçado no run `44904523055` validou o JSON do dispatcher, não só
  o status: `enabled=true`, `error=null`, `reconciled=1`,
  `reconcile_error=None`, `claimed/published/retried/dead` presentes. O
  `reconciled=1` mostra que a reconciliação durável efetivamente varreu a
  janela no Staging.
- **E2E real no mesmo run** (`scripts/ci/chamados_workflow_e2e_staging.py`,
  opt-in): workspace e ticket sintéticos isolados
  (`00bd93b6-47a5-445d-a4a7-8df5c039ed49` /
  `9cf83c40-0ae1-4a2d-89c8-166948b2fdb3`), outbox reclamada com
  `claimed=1, published=1, attempts=1` e `published_at=2026-11-21T12:34:13Z`.
  O QStash respondeu `201 Created` em `/v2/publish/...`; a rota assinada da
  Preview protegida respondeu `200` ao chamado inicial (12:34:13) e à
  **retomada após `context.sleep(120)`** (12:36:21). Não houve 401/403 e a
  string `x-vercel-protection-bypass=` não aparece em nenhum log. O protocolo
  da SDK gerou dois POSTs por etapa, mas apenas uma verificação da aplicação
  (`[chamados-reminder] verificação: 1 checados, 0 enviados, 0 confirmados,
  0 ambíguos`) — sem Push duplicado.
- Testes reais PostgreSQL contra Staging (`test_postgres_reminders_integration.py`)
  passaram no mesmo run.
- A comprovação pedida das duas falhas de `api/tests/test_chamados.py` foi
  refeita com o mesmo ambiente e dependências: os mesmos
  `400 != 200` aparecem em uma cópia limpa de `main` (`d8cfe1d3`) e na branch
  da PR, antes de qualquer alteração desta rodada. Portanto não são regressão
  da PR #491 e os testes não foram alterados para forçar verde.
- Testes adicionais desta rodada cobrem: falha de gravação da outbox e
  recuperação pela reconciliação, idempotência por ciclo, reabertura com
  Workflow anterior ativo, chamado assumido antes da próxima onda, concorrência
  entre dispatchers, assinatura ausente/incorreta/válida, e preservação do
  bypass em todas as etapas com a SDK real (que remove headers `x-vercel-*`).

**Consumo planejado vs. medido:** a estimativa é 1 mensagem QStash por ciclo
elegível (publicação inicial, `retries=0`) + até 3 ondas com sleep; retentivas
e backoff ficam no PostgreSQL, não no QStash. **Medido** no E2E acima: 1
chamada a `/v2/publish`, 4 chamadas a `/v2/batch` e 4 POSTs do QStash à
Preview (todos 200) para um único ciclo observado por ~150 s — o dobro do
número lógico de etapas porque a SDK emite um POST adicional por etapa; a
aplicação executou uma única verificação e não enviou Push duplicado. As três
ondas completas foram medidas na validação abaixo; a flag continua restrita a
esta Preview e o cron legado permanece ativo.

## Validação funcional das três ondas (21/11/2026)

Run `44918925820` (sucesso), Shas `2c43869` e `98f886c`, Preview
`lab-hub-git-feat-chamados-qstash-workfl-019c03-deltaf59592-3090.vercel.app`
(deploy `dpl_nKw6V8wPWAjCDnAz5knsjLFipvjD`). Dispatcher validado com
`enabled=true`, `error=null`, `reconciled=0`, `reconcile_error=None`.

- **Cenário não assumido** — ticket `918358`, publicado às 15:23:56Z com
  `claimed=1, published=1, attempts=1`. Ocorreram três verificações reais da
  aplicação em `15:26:04Z`, `15:28:13Z` e `15:30:21Z`, todas com `1 checados,
  0 enviados, 0 confirmados, 0 ambíguos` (sem assinatura Push no workspace
  sintético, logo nenhum envio). Os snapshots PostgreSQL das ondas 1/2/3
  mantiveram `current_job` estável, `outbox_status=published`, `ticket_status=
  aberto`, `assignee` vazio, `state_rows=1` e `reminder_count/sent_marks/
  ticket_events/push_subscriptions=0`.
- **Cenário assumido após a primeira onda** — ticket `947220`, publicado às
  15:30:47Z. A primeira verificação (15:32:54Z) encontrou `1 checados`; a
  atribuição ao técnico sintético foi aplicada às 15:33:36Z; a verificação
  seguinte (15:34:58Z) já registrou `0 checados` e encerrou o run. As ondas 2/3
  não alteraram nenhum contador (`state_rows=1`, `reminder_count=0`,
  `sent_marks=0`, `mark_waves=[]`, `ticket_events=0`, `push_subscriptions=0`) e o
  responsável permaneceu o mesmo UUID até o fim.
- **Consumo real do QStash medido em `vercel logs runtime/requests`:** 14 POSTs
  QStash→Preview na rota assinada, **todos HTTP 200** (2 na publicação inicial
  de cada caso + 2 por onda: um para o `context.sleep`, outro para o
  `context.run`), 12 chamadas a `/v2/batch` com `201 Created` e 2 limpezas de
  run (`/v2/workflows/runs/...`). Nenhum 401/403, nenhuma string
  `x-vercel-protection-bypass=` em logs e nenhum Push duplicado. Custo por
  ciclo de três ondas: 8 POSTs, contra 6 no ciclo interrompido no início.
- Limpeza controlada no run `44920500824`: os dois conjuntos preservados com
  `KEEP_E2E_DATA=true` foram removidos (`2/2`) usando os UUIDs canônicos
  impressos pelo E2E.

## Rollback

Desligar `LABHUB_CHAMADOS_WORKFLOW_ENABLED` e
`LABHUB_CHAMADOS_WORKFLOW_DISPATCH_ENABLED`, fazer deploy do mesmo código e
parar o smoke. As tabelas 115/116 e o estado de reconciliação 117/118 podem
permanecer vazios/inofensivos; a remoção é opcional e deve seguir o runner
oficial. Nenhuma alteração no
mecanismo de Push, RBAC ou histórico; o cron existente continua como estava.
Inspecione/cancele runs já disparados no painel Upstash antes de desligar
inteiramente o experimento.
