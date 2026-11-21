# Experimento: Chamados por evento com QStash + Workflow (Staging)

**Estado:** experimental, desabilitado por padrão. O cron de Push e o worker
centralizado continuam inalterados. Nenhum envio depende deste experimento
enquanto a flag estiver desligada.

## Por que

O agendamento de lembretes não deve consultar o conjunto inteiro de Chamados
quando um único ticket acabou de abrir. O Workflow agenda até **3 checagens**
individuais (2, 4 e 6 minutos após o disparo) usando o mesmo motor de locks
e deduplicação PostgreSQL que já existe. Esses três checks são um MVP; **não
substituem o limite legado de 10 ondas**, nem devem ser usados para desligar
o cron enquanto não houver comparação de comportamento e volume.

O `/api/push/check-all` existente cuida de outros subsistemas
(Reservas/PCare/Estoque/Tablets) e **não deve ser desativado**. O endpoint
`/api/chamados/reminders/check` continua disponível, protegido por CRON_SECRET.
O worker `/api/notifications/worker` mantém seu agendamento atual.

## Escopo técnico

- Criação pública após o INSERT bem-sucedido: agendar se `aberto` e sem
  `assignedToUserId`.
- PATCH que realmente reabre o chamado ou remove seu responsável: agendar
  quando resultar em `aberto` sem responsável.
- Payload QStash: somente `ticket_id` e `workspace_id`, ambos UUIDs
  canônicos. Nenhum token de acompanhamento, nome, email ou descrição.
- O destino é exclusivamente `LABHUB_CHAMADOS_WORKFLOW_URL`, definido no
  servidor e validado como HTTPS; nada vem do Host ou da requisição do cliente.
- Endpoint `/api/chamados/reminders/workflow`: registrado somente se a flag
  e as credenciais estiverem presentes, com assinatura QStash verificada
  por `Receiver` (chaves atual e próxima).
- A cada onda: consulta de somente **um ticket do workspace esperado**;
  reaproveita histórico, autorização de destinatários, locks, marcação e
  dedup existentes do PostgreSQL.
- Se o ticket for assumido, fechado ou removido, a consulta retorna zero
  candidatos e o Workflow encerra. No caso de falha transitória, a etapa
  sinaliza erro para as retentativas controladas do Workflow.
- Falha ao agendar não falha a criação/PATCH do chamado: o log contém somente
  a classe da exceção (nenhum segredo).

## Configuração exclusiva de Preview/Staging

No projeto Vercel **Preview**, para a branch
`feat/chamados-qstash-workflow-staging`, configurar no servidor:

```text
LABHUB_CHAMADOS_WORKFLOW_ENABLED=true
LABHUB_CHAMADOS_WORKFLOW_URL=https://<preview-público>/api/chamados/reminders/workflow
QSTASH_TOKEN=<token de QStash US ou EU>
QSTASH_CURRENT_SIGNING_KEY=<chave atual do mesmo QStash>
QSTASH_NEXT_SIGNING_KEY=<próxima chave do mesmo QStash>
```

Use apenas o **Supabase Staging** na Preview. O endpoint precisa ser acessível
ao QStash; em previews com Deployment Protection, configure um bypass
restrito/validado antes do smoke real, nunca expondo o token de bypass em
requisições de navegador. **Não habilitar a flag em Production.**

Aproveitar a conta Upstash gratuita conectada, preferindo a região mais
adequada ao Staging; não criar filas, schedules ou planos pagos para esta fase.
A criação de mensagens ocorrerá apenas quando o usuário criar ou reabrir um
ticket no Staging após ativação explícita.

## Procedimento de validação

1. Rodar `python -m pytest api/tests/test_chamados_qstash_workflow.py -q`
   e a suíte de API (sem chaves reais).
2. Conferir em Preview: endpoint ausente/desligado com flag OFF;
   assinatura ausente/ruim rejeitada com flag ON.
3. Em Staging, criar um chamado de teste em workspace isolado e confirmar
   um Workflow no painel Upstash; não executar no banco de produção.
4. Confirmar as 3 checagens `ticket_id + workspace_id`, os intervalos
   e a deduplicação com o motor de lembretes existente; depois assumir o
   chamado e confirmar encerramento antecipado.
5. Medir por 24 h: número de mensagens e steps Upstash, latência por evento,
   chamadas PostgREST por chamado, ausência de duplicidade e falhas no DLQ.
6. **Não desligar o cron nem ativar em Production** sem comparar custo,
   quantidade e comportamento dos lembretes. Meta: redução mensurável de
   listagens globais do Supabase; não assumir economia sem medição.

## Rollback

Desligar `LABHUB_CHAMADOS_WORKFLOW_ENABLED` e fazer deploy do mesmo código.
Não há migration SQL, nem alterações no mecanismo de Push, RBAC ou histórico.
O cron existente continua como estava; a flag OFF não agenda novas tarefas.
Executar/inspecionar runs já disparados no painel Upstash antes de desligar
inteiramente o experimento.
