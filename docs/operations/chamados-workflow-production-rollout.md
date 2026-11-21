# Chamados Workflow — ativação em Production (#491)

## Estado e isolamento

O E2E do Workflow de Chamados foi validado em Staging e o código da PR #491
entrou na main. Migrations 115–120 foram registradas em Production pelo runner
oficial; o motor de notificações original permanece inalterado.

**Diferença essencial:** a Preview tem SSO/Deployment Protection; o domínio
oficial `https://lab-hub-pi.vercel.app` é usado publicamente pela aplicação e
não exige o segredo de bypass da Preview. O header
`x-vercel-protection-bypass` **não deve ser enviado em Production**.
A assinatura QStash continua sendo verificada pelo `Receiver` com
`QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY`.

## Configuração do projeto Vercel (Production)

Somente variáveis de servidor, nunca `VITE_*`:

```text
QSTASH_TOKEN                       = [token REST QStash us-east-1]
QSTASH_CURRENT_SIGNING_KEY          = [chave de assinatura atual]
QSTASH_NEXT_SIGNING_KEY             = [chave de assinatura seguinte]
QSTASH_URL                          = https://qstash-us-east-1.upstash.io
LABHUB_CHAMADOS_WORKFLOW_URL        = https://lab-hub-pi.vercel.app/api/chamados/reminders/workflow
LABHUB_CHAMADOS_WORKFLOW_ENABLED    = false -> true na ativação
```

O `CRON_SECRET` existente continua protegendo
`POST /api/chamados/workflow/outbox/dispatch`. Não criar bypass de
Preview no ambiente Production.

**Sequência segura sem atraso desnecessário:**

1. Instalar as variáveis e manter `LABHUB_CHAMADOS_WORKFLOW_ENABLED=false`.
2. Publicar o código desta PR. Confirmar `READY`, CI e migrations.
3. Alterar a flag de Production para `true` e criar um novo deployment
   da mesma commit `main` para incorporar as variáveis atualizadas.
4. Validar que o endpoint de dispatch responde `enabled=true`, sem erro.
5. Deixar o Push Cron de 5 minutos disparar o dispatcher (sem novo cron).
6. Medir `claimed/published/retried/dead/reconciled`, o consumo QStash e
   as requisições Supabase. O intervalo é o existente do workflow cron:
   mensagens ficam pendentes até o próximo tick.
7. Confirmar que abrir um chamado real sem responsável agenda o Workflow;
   ao atribuir, as ondas seguintes não devem enviar Push.

O cron da `main` usa URL **fixa** do domínio de Production e não lê nenhuma
URL de variável do GitHub que possa apontar para Preview. O worker das
notificações existentes permanece como etapa separada, mesmo se o dispatcher
de Chamados falhar.

## Limites e riscos

- Plano QStash Free: observar contagem de mensagens e steps; a Preview
  também pode usar a conta QStash US, com destinatários e jobs diferentes.
- Reconciliação: 20 candidatos por tick a cada 15 minutos na janela de 24 h;
  se houver fila maior que a capacidade, chamados podem sair da janela.
- Jobs antigos deixam de processar se o chamado foi assumido/fechado ou o
  ciclo mudou, conforme checagem no PostgreSQL.
- Este cron não substitui o controle legado de até 10 lembretes.
- Um erro de entrega no QStash não deve impedir a abertura do chamado;
  a outbox conserva retentativas e registra jobs `dead`.

## Rollback rápido

1. Em Vercel Production, voltar
   `LABHUB_CHAMADOS_WORKFLOW_ENABLED=false`.
2. Fazer novo deployment da `main` com a flag desligada.
3. Conferir `enabled=false` no dispatcher. O cron e o worker legado
   continuam funcionando.
4. Inspecionar/cancelar runs QStash previamente publicados que ainda possam
   executar; deixar as migrations 115–120 e suas tabelas inativas.
5. Nunca apagar dados reais de Chamados nem reverter migrations com DROP como
   ação de rollback operacional.
