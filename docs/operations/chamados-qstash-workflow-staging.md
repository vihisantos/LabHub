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
2. Um dispatcher protegido por `CRON_SECRET` reclama um lote pequeno
   (`FOR UPDATE SKIP LOCKED`), publica no QStash com `deduplication_id`
   estável por job e confirma a linha. Falhas voltam para `pending` com backoff
   exponencial limitado (15 s, 30 s, 60 s, 120 s, 300 s); após 5 tentativas a
   linha vira `dead`, sem apagar nada. Nenhuma chamada externa acontece no
   request do professor.
3. O Workflow recebe **somente UUIDs** (`ticket_id`, `workspace_id`, `job_id`)
   e revalida o ciclo vigente no PostgreSQL a cada onda. Um job antigo (ex.:
   Workflow de antes de uma reabertura/troca de responsável) termina sem
   lock, marcação ou Push.
4. A checagem de erro do `process_one()` acontece **dentro** da função
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
  apenas a classe da exceção (nunca segredos).

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
```

No GitHub (variáveis de repositório, **não** segredos novos):

```text
LABHUB_CHAMADOS_WORKFLOW_DISPATCH_ENABLED=true
LABHUB_CHAMADOS_WORKFLOW_DISPATCH_URL=https://<preview>/api/chamados/workflow/outbox/dispatch
```

O Supabase usado na Preview deve ser **Staging**
(`pgmetdqsdjotdcifjivu`). Confirme isso antes de qualquer teste real. URLs de
outros projetos são rejeitadas pelo script de smoke. Gere uma **nova Preview**
depois de cadastrar os segredos: Previews antigas não os recebem.

Com Deployment Protection ligado, o cron e o smoke enviam
`x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET`. O valor vive
apenas no secret do repositório e na variável `Preview` da branch no Vercel;
nunca em browser, log ou payload do QStash. Antes de considerar o experimento
pronto, valide também o caminho inverso (QStash -> Preview): o `Receiver` da SDK
precisa continuar rejeitando assinaturas ausentes/inválidas mesmo com o bypass
ativo. **Não habilitar a flag em Production.**

## Procedimento de validação

1. Rodar as migrations 115/116 **somente em Staging** via
   `scripts/apply_staging_migration.py` (dry-run primeiro) ou pelo workflow
   manual `staging-reminders-integration.yml` com
   `apply_workflow_outbox_migration=true`.
2. Rodar `python -m pytest api/tests/test_chamados_qstash_workflow.py
   api/tests/test_chamados_workflow_real_sdk.py -q` com as dependências de
   `requirements.txt` instaladas, mais a suíte completa da API e o runner de
   migrations. Os testes com SDK real usam apenas transporte substituído;
   **não** provam integração com o QStash real.
3. Em Preview, confirme: flag OFF não registra rota nem agenda; assinatura
   ausente/inválida é rejeitada pela SDK; URL do workflow é a do deploy e não
   a do Host enviado.
4. Faça smoke real no dispatcher (`POST .../outbox/dispatch` com
   `Authorization: Bearer $CRON_SECRET`) e crie um chamado de teste em
   workspace isolado. Confirme no painel Upstash o run com 3 etapas e os
   intervalos; interrompa assumindo o chamado e confirmando que as próximas
   checagens param.
5. Simule falha temporária do QStash interrompendo a publicação e confirmando
   que a linha volta para `pending`, é republicada com o **mesmo**
   `deduplication_id` e não gera dois runs. Repita o mesmo ciclo e confirme
   uma única linha na outbox.
6. Meça por 24 h: mensagens e steps Upstash, latência por evento, chamadas
   PostgREST por chamado, ausência de duplicidade e falhas no DLQ. Separe
   **medições** de estimativas. Não desligar o cron nem ativar em Production
   sem comparar custo, quantidade e comportamento.

## Rollback

Desligar `LABHUB_CHAMADOS_WORKFLOW_ENABLED` e
`LABHUB_CHAMADOS_WORKFLOW_DISPATCH_ENABLED`, fazer deploy do mesmo código e
parar o smoke. As tabelas 115/116 podem permanecer vazias e inofensivas; a
remoção é opcional e deve seguir o runner oficial. Nenhuma alteração no
mecanismo de Push, RBAC ou histórico; o cron existente continua como estava.
Inspecione/cancele runs já disparados no painel Upstash antes de desligar
inteiramente o experimento.
