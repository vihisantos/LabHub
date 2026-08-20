# Events Reference

> Realtime events, push notifications, and system events.

## Supabase Realtime Events

### chamados_tickets

| Event | Payload | Consumers |
|-------|---------|-----------|
| `INSERT` | New ticket created | TicketList, Dashboard |
| `UPDATE` | Ticket modified | TicketDetail, TicketList |
| `DELETE` | Ticket deleted | TicketList |

### Channel Naming

```
chamados:public:{ticketId}     — Per-ticket updates
chamados:workspace:{workspaceId} — Workspace-wide updates
```

## Push Notification Events

### Ticket Events

| Event | Title | Target |
|-------|-------|--------|
| New ticket | "Novo chamado #{number}" | role: admin |
| Status update | "Chamado #{number} atualizado" | Reporter |
| Resolved | "Como foi seu atendimento? ⭐" | Reporter |

### User Approval Events

| Event | Title | Target |
|-------|-------|--------|
| New signup | "Novo cadastro pendente" | role: admin |
| Approved | "Cadastro aprovado!" | User |
| Rejected | "Cadastro não aprovado" | User |

### System Events

| Event | Title | Target |
|-------|-------|--------|
| Reservation reminder | "Reserva em 15 min" | Reservation owner |
| Overdue loan | "Empréstimo vencido" | Loan owner |
| Low stock | "Estoque baixo" | role: admin |
| Maintenance due | "Manutenção agendada" | role: admin |

## Notification Actions

Push notifications can include action buttons:

```json
{
  "actions": [
    { "action": "approve", "title": "Aprovar" },
    { "action": "reject", "title": "Recusar" }
  ],
  "url": "/admin/users?pending={userId}"
}
```

Action handling:
- `approve` → `POST /api/push/action` → `PATCH profiles (status: active)`
- `reject` → `POST /api/push/action` → `DELETE profiles`
- Click on body → Opens `url` in browser

## Broadcast Events (Cross-tab)

| Channel | Event | Purpose |
|---------|-------|---------|
| `chamados:{workspaceId}` | `ticket_updated` | Sync ticket list across tabs |

## Related

- [Architecture: Realtime](../architecture/realtime.md)
- [Architecture: Backend](../architecture/backend.md)
