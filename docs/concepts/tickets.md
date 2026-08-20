# Tickets

> What is a ticket and how does the support workflow function?

## What

A Ticket is a support request or service order created through the Chamados module. It represents a problem reported by a professor or staff member that needs attention from the IT team.

## Why

University IT labs need a structured way to handle support requests — from reporting to resolution and feedback. Tickets provide accountability, SLA tracking, and a complete audit trail.

## Lifecycle

```
Created (aberto)
    ↓  Technician dispatched
En route (a_caminho)
    ↓  Technician arrives
In service (em_atendimento)
    ↓  Problem fixed
Resolved (resolvido)
    ↓  Admin confirms
Closed (fechado)
```

A ticket can also be **archived** (moved out of active view) without changing its status.

## Key Properties

| Property | Description |
|----------|-------------|
| `ticketNumber` | Sequential number per workspace (e.g., #42) |
| `priority` | `baixa`, `normal`, `alta`, `urgente` — determines SLA targets |
| `workspace_id` | Campus that owns the ticket |
| `roomName` | Location of the problem |
| `problemCategory` | Category (hardware, software, network, etc.) |
| `reportedBy` | Name of the person who reported |
| `assignedTo` | Technician handling the ticket |
| `feedbackRating` | 1-5 star rating after resolution |

## Access Points

1. **Public form** (`/chamados-publico`) — Professors create tickets via QR code or link, no login required
2. **TI panel** (`/chamados`) — Technicians manage, assign, and resolve tickets
3. **Public tracking** (`/chamados-publico/track`) — Professors check ticket status by name
4. **Feedback** (`/chamados-publico/feedback/:id`) — Professors rate the service after resolution

## Ticket Events

Every change to a ticket generates an event in its history:
- Status changes
- Comments (with optional photo attachments)
- Assignments
- Priority changes

Events are immutable and form a complete audit trail.

## SLA

Each priority level has target response and resolution times (configurable in `sla_configs`). The Dashboard shows overdue and near-deadline tickets.

## Data Flow

```
Professor submits form (public)
    ↓
API Flask validates + generates ticketNumber
    ↓
Supabase (chamados_tickets)
    ↓
Push notification to TI team
    ↓
Technician picks up ticket
    ↓
Status updates sync to professor in real-time
    ↓
Professor rates service (1-5 stars)
```

## Related

- [Module: Chamados](../modules/chamados/overview.md)
- [Synchronization](synchronization.md)
- [Realtime](../architecture/realtime.md)
