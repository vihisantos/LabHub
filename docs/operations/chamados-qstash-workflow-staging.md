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
- O bypass da Preview é anexado como query parameter **apenas à URL interna**
  usada pelo QStash/SDK (`x-vercel-protection-bypass`). Ele não vem de Host,
  parâmetro de request, browser, resposta ou log da aplicação.

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
LABHUB_CHAMADOS_WORKFLOW_DISPATCH_ENABLED=true
LABHUB_CHAMADOS_WORKFLOW_DISPATCH_URL=https://<preview>/api/chamados/workflow/outbox/dispatch
```

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
orienta passar o bypass na chamada inicial **e** configurá-lo para as etapas
seguintes. O SDK Python `upstash-workflow==2.0.0` remove headers `x-vercel-*`
das etapas seguintes (`_recreate_user_headers`), e a SDK QStash Python 3.4.0
não tem opção de headers padrão no cliente. Por isso usamos o mecanismo
suportado pela Vercel para integrações que não conseguem enviar headers
customizados: o **query parameter** `x-vercel-protection-bypass` na URL
interna do workflow. Ele é montado no servidor a partir da variável de sistema
`VERCEL_AUTOMATION_BYPASS_SECRET`, preservado pelo SDK em todas as retomadas
após `context.sleep()`, e não altera a verificação de assinatura do `Receiver`
(a assinatura cobre o corpo da mensagem). Nenhuma proteção é desligada e o
segredo não aparece em frontend, URLs compartilháveis, respostas ou logs locais.
Recomenda-se rotacionar o bypass ao encerrar o experimento. **Não habilitar a
flag em Production.**

## Procedimento de validação

1. Rodar as migrations 115/116 **somente em Staging** via
   `scripts/apply_staging_migration.py` (dry-run primeiro) ou pelo workflow
   manual `staging-reminders-integration.yml` com
   `apply_workflow_outbox_migration=true`. Depois aplicar 117/118 com
   `apply_reconcile_migration=true`. Nada em Production.
2. Rodar `python -m pytest api/tests/test_chamados_qstash_workflow.py
   api/tests/test_chamados_workflow_real_sdk.py
   api/tests/test_116_chamados_workflow_outbox_contract.py
   api/tests/test_118_chamados_workflow_outbox_reconcile_contract.py -q` com as
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

## Evidências da validação (21/11/2026)

- PR #491, branch `feat/chamados-qstash-workflow-staging`. Todos os checks do
  GitHub passaram no SHA final: Analyze JS/Python, Lint, Build, CodeQL,
  Migration runner tests, Python API tests, Test, validação de migrations em
  PostgreSQL efêmero e Vercel Preview.
- A suíte local de APIs terminou em **2378 passed, 7 skipped, 2 failed**; as
  duas falhas (`test_patch_troca_foto_destroi_antiga_no_cloudinary` e
  `test_patch_mesma_foto_nao_destroi`) são pré-existentes no HEAD limpo e não
  foram introduzidas por esta PR.
- Testes específicos desta correção: 50 passed com as dependências reais
  instaladas (`test_116_chamados_workflow_outbox_contract.py`,
  `test_118_chamados_workflow_outbox_reconcile_contract.py`,
  `test_chamados_qstash_workflow.py`, `test_chamados_workflow_real_sdk.py`),
  incluindo SDK real `upstash-workflow==2.0.0` com transporte substituído.
- Migrations 115/116 aplicadas **somente em Staging**
  (`pgmetdqsdjotdcifjivu`) pelo workflow manual
  `staging-reminders-integration.yml` (run `44870468268`), com preflight
  fail-closed e dry-run prévio. Nenhuma migration foi aplicada em produção.
- Smoke do dispatcher no Preview gerenciado pelo GitHub (run `44871907378`):
  `HTTP 200` com `{"claimed":0,"dead":0,"enabled":true,"error":null,
  "published":0,"retried":0,"status":"ok"}`. O `enabled:true` confirma que a
  flag e as credenciais chegaram ao deploy correto da branch; `claimed:0`
  indica que a fila estava vazia no momento do teste.
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

**Limitação conhecida:** o smoke acima provou o endpoint, a autenticação, o
bypass do Preview e a leitura da outbox, mas a fila estava vazia — portanto
ainda não houve publicação real no QStash nem execução de um Workflow completo
em Staging. Isso depende de um chamado de teste criado no formulário público de
um workspace de teste, seguido de nova chamada ao dispatcher.

**Consumo planejado vs. medido:** por ciclo elegível, a estimativa é 1 mensagem
QStash (publicação inicial, `retries=0`) + até 3 steps do Workflow (ondas de
2/4/6 min). Retentivas e backoff ficam no PostgreSQL, não no QStash. Nenhum
número medido de QStash está disponível até o primeiro smoke com chamado real;
não apresentar estimativa como medição.

## Rollback

Desligar `LABHUB_CHAMADOS_WORKFLOW_ENABLED` e
`LABHUB_CHAMADOS_WORKFLOW_DISPATCH_ENABLED`, fazer deploy do mesmo código e
parar o smoke. As tabelas 115/116 e o estado de reconciliação 117/118 podem
permanecer vazios/inofensivos; a remoção é opcional e deve seguir o runner
oficial. Nenhuma alteração no
mecanismo de Push, RBAC ou histórico; o cron existente continua como estava.
Inspecione/cancele runs já disparados no painel Upstash antes de desligar
inteiramente o experimento.
