# Chamados — Referência

> Referência técnica de tipos, endpoints, configuração, componentes e camada de serviços.

## Tipos

```typescript
interface Ticket {
  id: string
  workspace_id: string
  roomId: string
  roomName: string
  assetId: string
  assetSource: 'stock' | 'pcare'
  assetName: string
  assetPatrimony: string
  problemCategory: string
  problemArea: 'administrativa' | 'academica'
  problemDescription: string
  status: TicketStatus
  priority: TicketPriority
  reportedBy: string
  reportedByEmail: string
  assignedTo: string
  assignedToUserId: string
  ticketNumber: number
  photos: string[]
  feedbackRating: number | null
  feedbackComment: string
  feedbackAt: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  closedAt: string | null
  closedBy: string
  statusNote: string
  archived: boolean
}

type TicketStatus = 'aberto' | 'a_caminho' | 'em_atendimento' | 'resolvido' | 'fechado'
type TicketPriority = 'baixa' | 'normal' | 'alta' | 'urgente'
```

### Rótulos e cores de status

```typescript
const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  aberto: 'Aberto',
  a_caminho: 'A Caminho',
  em_atendimento: 'Em Atendimento',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
}

const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  aberto: 'bg-amber-500',
  a_caminho: 'bg-blue-500',
  em_atendimento: 'bg-indigo-500',
  resolvido: 'bg-emerald-500',
  fechado: 'bg-zinc-500',
}
```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/chamados` | Abrir chamado (formulário público, sem autenticação) |
| GET | `/api/chamados` | Listar chamados |
| GET | `/api/chamados/:id` | Buscar chamado por identificador |
| PATCH | `/api/chamados/:id` | Atualizar campos do chamado |
| POST | `/api/public/chamados/:tracking_token/feedback` | Registrar avaliação (público) |
| POST | `/api/chamados/:id/events` | Adicionar comentário |
| GET | `/api/chamados/:id/events` | Histórico do chamado |
| GET | `/api/chamados/reports` | Relatório agregado |
| POST | `/api/chamados/reports/weekly-email` | Enviar resumo semanal por e-mail |
| POST | `/api/chamados/workspaces` | Listar campi disponíveis para o formulário público |

### POST /api/chamados

```json
{
  "workspace_id": "uuid-do-campus",
  "roomName": "Sala 201",
  "roomId": "opcional",
  "reportedBy": "Nome do professor",
  "reportedByEmail": "opcional",
  "problemCategory": "hardware",
  "problemArea": "administrativa",
  "problemDescription": "O computador não liga",
  "priority": "normal",
  "photos": "base64 ou URL do Cloudinary"
}
```

**Resposta:** `200 { ticket: Ticket }` com o `ticketNumber` gerado sequencialmente.

**Erros:**

- `400` — campos obrigatórios ausentes
- `403` — aplicação desabilitada no workspace (`MODULE_DISABLED`); nenhum chamado é criado e nenhum push é disparado
- `503` — backend não configurado

### GET /api/chamados

Parâmetros de consulta opcionais: `workspace_id`, `status`, `reportedBy`.

### PATCH /api/chamados/:id

Corpo com o objeto parcial do chamado: status, responsável, prioridade, arquivamento, fotos e `statusNote`.

### POST /api/public/chamados/:tracking_token/feedback

```json
{
  "rating": 4,
  "comment": "Atendimento rápido e eficiente"
}
```

- `rating` — inteiro de 1 a 5 (obrigatório)
- `comment` — texto de até 500 caracteres (opcional)

**Regras:** o chamado deve estar `resolvido` ou `fechado` e não pode ter avaliação prévia. Cada violação retorna `400` com a mensagem correspondente.

**Resposta:** `{ "ticket": { ...campos atualizados com feedbackRating, feedbackComment, feedbackAt } }`

### GET /api/chamados/reports

Relatório agregado no servidor com:

- total e distribuição por status, prioridade, categoria, área e sala
- por técnico: chamados abertos, resolvidos, tempo médio de resolução e avaliação média
- quantidade de avaliações e média

### POST /api/chamados/workspaces

Lista os campi disponíveis para o formulário público.

## Configuração de SLA

| Prioridade | Prazo de resposta | Prazo de resolução |
|------------|-------------------|--------------------|
| `urgente` | 30 minutos | 4 horas |
| `alta` | 2 horas | 8 horas |
| `normal` | 4 horas | 24 horas |
| `baixa` | 8 horas | 48 horas |

Os prazos são configuráveis na coleção `sla_configs`.

## Chaves locais

| Chave | Conteúdo |
|-------|----------|
| `labhub_chamados` | Cache local de chamados (não usado para escrita remota) |

## Componentes

| Componente | Propósito |
|------------|-----------|
| `Stars` | Avaliação por estrelas (1 a 5), interativa ou somente leitura |
| `TicketCard` | Card de chamado com status e ações rápidas |
| `TicketForm` | Formulário de abertura e edição (público ou TI) |
| `StatusBadge` | Indicador colorido de status |
| `PriorityBadge` | Indicador de prioridade |
| `AssignmentBadge` | Indicador de técnico responsável |
| `SLAStatus` | Indicador de cumprimento de SLA |
| `CommentItem` | Item do histórico de comentários |
| `AttachmentPreview` | Pré-visualização das fotos anexadas |
| `BatchActionBar` | Barra de ações em lote |
| `ReportExporter` | Exportação em CSV, XLSX e PDF |

## Hooks

| Hook | Propósito |
|------|-----------|
| `useTickets` | CRUD e estado dos chamados |
| `useTicket` | Dados de um chamado específico |
| `useTicketForm` | Estado do formulário de chamado |
| `useSLAConfig` | Configuração de prazos por prioridade |
| `useNotifications` | Estado da inscrição e do envio de push |
| `useAdminUsers` | Estado da página de gestão de usuários |

## Serviços

| Serviço | Propósito |
|---------|-----------|
| `ticketService` | CRUD e comunicação com a API de chamados |
| `notificationService` | Gestão de inscrições de push e envios |
| `adminService` | Aprovação e gestão de usuários |
| `reportService` | Geração de relatórios e exportações |

## Relacionados

- [Visão geral](README.md)
- [Arquitetura](architecture.md)
- [Fluxos](workflows.md)
- [Referência da API](../../reference/api.md)
- [Referência do banco](../../reference/database.md)
