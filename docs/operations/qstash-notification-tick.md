# LabHub — agendamento confiável de notificações via QStash

## Incidente de 2026-11-23

O `push-cron.yml` estava configurado a cada 5 minutos, mas o último
`schedule` observado em 2026-11-23 ocorreu às 11:02 UTC. A
`notification_outbox` e a `chamados_workflow_outbox` acumularam entradas
`pending` com zero tentativas. O envio é assíncrono e a criação do chamado
não executa Push diretamente.

### Arquitetura

- `POST /api/notifications/qstash/tick` recebe um tick assinado pelo QStash
  a cada **5 minutos**, com corpo **exatamente**
  `{"job":"labhub-notifications","version":1}`.
- A rota é **somente Production**. Valida `Upstash-Signature` usando as chaves
  atuais e próximas de Production e a URL absoluta fixa
  `https://lab-hub-pi.vercel.app/api/notifications/qstash/tick`.
  `Host`, query string, variáveis de Preview, URL fornecida pelo cliente
  e `CRON_SECRET` no endereço não autorizam chamadas.
- Cada tick processa até **5 eventos** do worker PostgreSQL/Redis e despacha
  até **5 jobs** QStash de Chamados. Se um subsistema falha, o outro ainda roda;
  um HTTP 503 permite retentativa. Os locks/dedup existentes evitam dupla
  entrega conhecida quando coincidir com o fallback no GitHub Actions.
- O `push-cron.yml` do GitHub **permanece** como fallback/manual de operação
  e para demais módulos (ReservaLab/estoque/PCare). Não criar outro GitHub
  Actions job nem retirar a proteção atual por `CRON_SECRET`.
- Nenhuma cobrança é disparada apenas pelo tick: ela pertence ao Workflow
  individual de Chamados, revalidado pelo PostgreSQL.

### Destinatários e momento de envio

1. Novo chamado: um evento `chamados-created` na outbox, para inscrições do
   **campus do chamado** que tenham a Action ativa `ticket.claim`.
2. Após 2 minutos sem atribuição (ou reabertura elegível), até 10 cobranças
   separadas por ao menos 2 minutos: cada tentativa revalida o chamado, ciclo,
   workspace, RBAC, preferências e dedup antes do Web Push.
3. Se qualquer técnico assumir, se o chamado for indeferido ou encerrado, ou
   se mudar o ciclo, as cobranças **param**; não há aviso a cada 5 minutos
   para técnicos se não existe chamado pendente.
4. Super admins sem membership ativa no campus não recebem os alertas de
   `min_level=claim`; outros envios administrativos não são alterados.
5. Assinaturas browser inválidas, preferências de push desabilitadas ou
   dispositivos offline podem impedir a **exibição**. HTTP 2xx do push indica
   aceite pelo serviço, não prova que o celular exibiu.

### Consumo do plano Free

- Cron de cinco minutos: `24*60/5 = 288` *mensagens QStash de trigger por
  dia*, independentemente de haver chamado.
- **288 não são notificações de técnicos**. Mensagens/steps dos Workflows por
  chamado, eventuais retentativas e outros projetos usam a mesma franquia e
  precisam ser monitorados. Não assumir que 288 é o consumo total.
- Não criar um schedule por técnico nem por chamado. O Workflow existe por
  ciclo elegível; a execução só envia se ainda estiver sem responsável.
- Escalar ou encurtar o intervalo somente após medir `QStash usage`, outbox,
  logs e tempo de entrega real.

## Ativação segura

1. Fazer merge da PR **após** CI e testes de autorização/assinatura. Confirmar
   que Production contém as mesmas chaves `QSTASH_CURRENT_SIGNING_KEY` e
   `QSTASH_NEXT_SIGNING_KEY` do QStash US, e que está habilitado
   `LABHUB_CHAMADOS_WORKFLOW_ENABLED=true`. Não revelar os valores em logs.
2. Antes do schedule, tentar `POST` sem assinatura (deve retornar 401) e
   tentar `POST` no Preview (404). Garantir deployment Production `READY`.
3. Criar **um único** schedule em `QStash US`:
   - destination: `https://lab-hub-pi.vercel.app/api/notifications/qstash/tick`
   - cron: `*/5 * * * *` (UTC)
   - body, UTF-8 sem espaços adicionais:
     `{"job":"labhub-notifications","version":1}`
   - method: POST (padrão QStash)
4. Verificar nas execuções reais: HTTP 200 e `status=ok`, `published`,
   `processed`, `chamados.published` e `chamados.reconciled`.
   Acompanhar o DLQ, retries, `notification_outbox` e
   `chamados_workflow_outbox` por 24 h.
5. Testar chamado **real controlado**, no campus autorizado, com técnico inscrito:
   avisar novo chamado uma vez, confirmar cobrança **somente se não assumir**,
   assumir e confirmar interrupção. Não gerar lote artificial em Production.
6. Inspecionar `push-cron.yml`: quando executar simultaneamente, dedup e locks
   precisam prevenir duplicidade. Se não, pausar o schedule e investigar.

## Rollback

Pausar ou deletar **apenas** o schedule QStash criado nesta implantação.
O GitHub Actions e os endpoints protegidos por `CRON_SECRET` continuam
disponíveis como fallback; não mexer em chaves, bancos, filas ou migrations
e nunca apagar tickets reais para resolver incidente.

**Segurança:** nunca colocar `CRON_SECRET`, `QSTASH_TOKEN` ou outras
credenciais na URL do QStash; sempre usar `Upstash-Signature` verificada.
