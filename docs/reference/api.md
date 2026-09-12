# Referência da API

> Endpoints do backend Flask do LabHub.

## URL base

```text
Produção:  https://lab-hub-pi.vercel.app/api
Desenvolvimento local:  http://localhost:5173/api (ou porta 5000 ao rodar o Flask direto)
```

## Autenticação

A maior parte dos endpoints usa `service_role` do Supabase (somente backend). Endpoints públicos estão marcados como tal. Endpoints de cron exigem `Authorization: Bearer ${CRON_SECRET}`.

## Chamados

### POST /api/chamados

Abre um chamado (público, sem autenticação).

**Corpo:**

```json
{
  "workspace_id": "uuid (obrigatório)",
  "roomName": "texto (obrigatório)",
  "roomId": "texto (opcional)",
  "reportedBy": "texto (obrigatório)",
  "reportedByEmail": "texto (opcional)",
  "problemCategory": "texto (obrigatório)",
  "problemArea": "administrativa | academica (obrigatório)",
  "problemDescription": "texto (obrigatório)",
  "priority": "baixa | normal | alta | urgente (obrigatório)",
  "photos": "base64 ou URL do Cloudinary (opcional)"
}
```

**Resposta:** `200`

```json
{
  "ticket": {
    "id": "uuid",
    "ticketNumber": 42,
    "status": "aberto",
    "createdAt": "timestamp ISO",
    "...": "..."
  }
}
```

**Erros:**

- `400` — campos obrigatórios ausentes
- `403` — aplicação desabilitada no workspace (`MODULE_DISABLED`)
- `503` — backend não configurado

### GET /api/chamados

Lista chamados.

**Parâmetros:** `workspace_id`, `status`, `reportedBy`.

### GET /api/chamados/:id

Busca um chamado pelo identificador.

### PATCH /api/chamados/:id

Atualiza o chamado. Corpo com objeto parcial do chamado.

### POST /api/chamados/:id/feedback

Registra a avaliação do professor (público, sem autenticação).

```json
{
  "rating": 4,
  "comment": "Comentário opcional (máximo de 500 caracteres)"
}
```

**Resposta:** `200 { ticket: { feedbackRating, feedbackComment, feedbackAt } }`

**Erros:**

- `400` — avaliação fora de 1 a 5, chamado não resolvido ou já avaliado
- `404` — chamado não encontrado

### GET /api/chamados/reports

Retorna os dados agregados do relatório.

### POST /api/chamados/workspaces

Lista os campi disponíveis para o formulário público.

### POST /api/chamados/reports/weekly-email

Envia por e-mail o resumo semanal dos chamados (últimos 7 dias). Exige usuário autenticado (Bearer do Supabase) e usa o Resend (`RESEND_API_KEY`).

```json
{
  "workspace_id": "uuid do campus (obrigatório)",
  "to": "destinatario@email.com (opcional — usa REPORT_EMAIL_TO quando omitido)"
}
```

**Resposta:** `200 { ok: true, total: 12, sent_to: "destinatario@email.com" }`

## Notificações push

### POST /api/push/subscribe

Registra uma inscrição de push.

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": { "p256dh": "...", "auth": "..." },
  "user": { "id": "uuid", "name": "Nome", "role": "admin" }
}
```

O campo `user` identifica o dono do dispositivo e permite envio segmentado por cargo. Inscrições com o mesmo `endpoint` são deduplicadas.

### GET /api/push/test

Envia uma notificação de teste para todos os inscritos.

### POST /api/push/send

Envia uma notificação segmentada.

```json
{
  "title": "Novo usuário pendente",
  "body": "Maria (maria@x.com) aguarda aprovação",
  "url": "/admin/users",
  "role": "admin",
  "userId": "uuid-do-usuario-pendente",
  "module": "stock",
  "workspace_id": "uuid-do-workspace",
  "actions": [
    { "action": "approve", "title": "Aprovar" },
    { "action": "reject", "title": "Recusar" }
  ]
}
```

- `module` — envia apenas para inscrições com acesso à aplicação. Inscrições legadas, sem `apps`, continuam recebendo de todos os módulos
- `workspace_id` — envia apenas para inscrições do workspace (super admins recebem de todos). Omitido, envia para todos
- `role` — envia apenas para inscrições com esse cargo. Omitido, envia para todos
- `notify_settings` é respeitada: `muted` bloqueia tudo e o canal `push` desligado por aplicação bloqueia aquele módulo
- `actions` — botões exibidos na notificação (o Web Push suporta no máximo 2, apenas no Chrome para Android e no desktop)
- `userId` — usado pelo service worker ao tratar a ação

**Resposta:** `{ "sent": 2, "total": 3 }`

### POST /api/push/action

Aprova ou recusa um usuário pendente a partir da ação da notificação.

```json
{
  "action": "approve",
  "userId": "uuid-do-usuario-pendente",
  "role": "viewer",
  "app_access": {}
}
```

- `action` — `approve` ou `reject`
- `role` e `app_access` — opcionais, apenas no approve. Padrões: `viewer` e `{}`

Exige `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` no backend; sem elas, responde 503.

**Resposta:** `{ "status": "approved", "role": "viewer" }`

### Endpoints de cron

| Endpoint | Propósito |
|----------|-----------|
| `GET /api/push/check` | Reservas próximas |
| `GET /api/push/check-overdue` | Empréstimos vencendo |
| `GET /api/push/check-pcare` | Estoque baixo e manutenções |
| `GET /api/push/tablets/cleanup` | Limpeza de reservas de tablet canceladas |
| `GET /api/push/check-all` | Todos os checks em uma chamada |

**Autenticação:** `Authorization: Bearer ${CRON_SECRET}`. Com a variável configurada, os endpoints exigem o cabeçalho e devolvem `401` em qualquer outro acesso. Sem a variável, permanecem abertos, com aviso no log.

**`/api/push/check`:** busca as reservas do dia, verifica as que começam nos próximos minutos, envia push para os inscritos e deduplica por MD5 com TTL de 2 horas. Também verifica as reservas de tablet no Supabase.

**`/api/push/check-overdue`:** verifica empréstimos com devolução prevista nas próximas 12 horas.

**`/api/push/check-all`:** executa todos os checks — reservas, devoluções vencendo, PC Care, usuários pendentes e validade de itens. É o endpoint chamado pelo cron do GitHub Actions a cada 5 minutos.

## ReservaLab

### GET /api/reservas

Reservas de laboratório a partir da planilha no SharePoint.

**Parâmetros:** `workspace_slug`.

**Resposta:**

```json
{
  "lab1_reservas": [],
  "lab2_reservas": [],
  "reservas_semana": [],
  "data": "01 de Julho de 2026",
  "cache_info": { "timestamp": 1688169600 }
}
```

Cache de 60 segundos, por workspace. Detalhes em [ReservaLab — Arquitetura](../apps/reservalab/architecture.md).

### GET /api/health

Status do servidor e do cache.

```json
{
  "status": "ok",
  "cache": { "ativo": true, "ttl": 60, "timestamp": 1688169600 },
  "url_configurada": true
}
```

## TV

| Método | Rota | Propósito |
|--------|------|-----------|
| POST | `/api/tv/youtube/fetch` | Buscar metadados de vídeos e playlists do YouTube |
| POST | `/api/tv/youtube/search` | Pesquisar vídeos no YouTube |
| POST | `/api/tv/calendar/extract` | Extrair eventos de calendário |
| POST | `/api/tv/source/fetch` | Buscar a fonte externa de eventos |
| GET | `/api/tv/youtube/live` | Status de transmissão ao vivo |
| POST | `/api/tv/cloudinary/delete` | Excluir uma imagem da TV (protegido por `tv.content.manage`) |
| GET | `/api/tv/health` | Status do servidor |
| POST | `/api/tv/activation/create` | Criar código de ativação de dispositivo |
| POST | `/api/tv/activation/redeem` | Resgatar código de ativação |
| POST | `/api/tv/devices/provision` | Provisionar dispositivo |
| GET | `/api/tv/chamados/display` | Projeção segura de chamados para a TV |

### GET /api/tv/chamados/display

Retorna um recorte seguro dos chamados do workspace para exibição em tela de TV.

**Autenticação:** somente dispositivo. Exige o JWT de uma sessão de kiosk provisionada; o workspace é resolvido no servidor a partir do vínculo `tv_devices.user_id → workspace_id`. Sessões humanas de admin são rejeitadas (403), e parâmetros do cliente nunca influenciam o escopo.

**Projeção (allowlist, no servidor):** `ticketNumber`, `roomName`, `problemArea`, `problemCategory`, `priority`, `status`, `createdAt`, `resolvedAt`. Nunca retorna identidade ou e-mail do solicitante, descrição livre, patrimônio, fotos, comentários, texto de avaliação, identificadores internos ou linhas brutas. É uma projeção de leitura, sem acesso administrativo e sem escrita.

**Resposta:** `{ generatedAt, summary: { total, open, inProgress, highPriority, avgResolutionHours, satisfaction }, tickets: [...] }`

**Escopo e limites:** apenas chamados ativos (`aberto`, `a_caminho`, `em_atendimento`), não arquivados, no máximo 100 itens; métricas agregadas em janela explícita de 30 dias.

**Polling:** consultas a cada 30 a 60 segundos; limite de 240 requisições por hora por IP (acima disso, `429`).

## Rotas públicas

| Método | Rota | Propósito |
|--------|------|-----------|
| GET | `/api/public/chamados/:tracking_token` | Consulta pública do chamado |
| GET | `/api/public/chamados/:tracking_token/events` | Histórico público do chamado |
| POST | `/api/public/chamados/:tracking_token/feedback` | Avaliação pública |
| POST | `/api/public/chamados/:tracking_token/subscribe` | Inscrição pública em push |

O `tracking_token` é o identificador de acompanhamento do chamado e substitui o UUID interno no acesso público.

## Dependências Python

`flask`, `flask-cors`, `openpyxl` (leitura de planilhas), `requests`, `python-dotenv`, `upstash_redis`, `pywebpush`, `resend` (e-mails).

## Relacionados

- [Arquitetura de backend](../platform/architecture/backend.md)
- [Referência do banco](database.md)
- [Referência de eventos](events.md)
- [Referência de configuração](configuration.md)
