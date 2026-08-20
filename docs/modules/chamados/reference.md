# Chamados — Reference

> Technical reference for types, endpoints, and configuration.

## Types

### Ticket

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

### Status Labels

```typescript
const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  aberto: 'Aberto',
  a_caminho: 'A Caminho',
  em_atendimento: 'Em Atendimento',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
}
```

### Status Colors

```typescript
const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  aberto: 'bg-amber-500',
  a_caminho: 'bg-blue-500',
  em_atendimento: 'bg-indigo-500',
  resolvido: 'bg-emerald-500',
  fechado: 'bg-zinc-500',
}
```

## API Endpoints

### POST /api/chamados
Create a ticket (public form).

**Body:**
```json
{
  "workspace_id": "uuid",
  "roomName": "Sala 201",
  "roomId": "optional",
  "reportedBy": "Prof. Name",
  "reportedByEmail": "optional",
  "problemCategory": "hardware",
  "problemArea": "administrativa",
  "problemDescription": "Description",
  "priority": "normal",
  "photos": "base64 or Cloudinary URL"
}
```

**Response:** `200 { ticket: Ticket }`

**Errors:**
- `400` — Missing required fields
- `403` — Module disabled for workspace
- `503` — Backend not configured

### GET /api/chamados
List tickets with optional filters.

**Query params:** `workspace_id`, `status`, `reportedBy`

### GET /api/chamados/:id
Get ticket by ID.

### PATCH /api/chamados/:id
Update ticket fields.

**Body:** Partial ticket object

### POST /api/chamados/:id/feedback
Submit rating (public, no auth).

**Body:**
```json
{
  "rating": 4,
  "comment": "Optional comment (max 500 chars)"
}
```

### GET /api/chamados/reports
Get aggregated report data.

### POST /api/chamados/workspaces
List available campuses for public form.

## SLA Configuration

| Priority | Response Target | Resolution Target |
|----------|----------------|-------------------|
| urgente | 30 min | 4 hours |
| alta | 2 hours | 8 hours |
| normal | 4 hours | 24 hours |
| baixa | 8 hours | 48 hours |

*Note: SLA targets are configurable in `sla_configs` collection.*

## Local Storage Keys

| Key | Content |
|-----|---------|
| `labhub_chamados` | Local ticket cache |

## Components

| Component | Purpose |
|-----------|---------|
| `Stars` | Interactive/read-only star rating (1-5) |
| `TicketCard` | Ticket summary card |
| `StatusBadge` | Colored status indicator |
| `PriorityBadge` | Priority level badge |
| `AssignmentBadge` | Assigned technician badge |
| `SLAStatus` | SLA compliance indicator |
| `CommentItem` | Timeline event item |
| `BatchActionBar` | Multi-select action bar |
| `ReportExporter` | CSV/XLSX/PDF export |

## Related

- [Overview](overview.md)
- [Architecture](architecture.md)
