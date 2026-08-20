# Chamados — Module Overview

> Support tickets and service orders for IT labs.

**Route:** `/chamados` (TI panel) and `/chamados-publico` (public form)
**Color:** `#f59e0b` (amber)

## Purpose

The Chamados module centralizes all IT support requests and service orders. It connects professors who report problems with technicians who resolve them, providing full lifecycle tracking and SLA monitoring.

## Key Features

- **Public ticket creation** — Professors submit via QR code or link, no login required
- **TI management panel** — Filter, assign, update, and resolve tickets
- **SLA tracking** — Priority-based response/resolution targets
- **Real-time updates** — Status changes propagate instantly via WebSocket
- **Feedback system** — 1-5 star rating after resolution
- **Push notifications** — Automatic alerts for new tickets and status changes
- **Photo attachments** — Upload via Cloudinary
- **Reports** — CSV, XLSX, PDF export with technician aggregation

## Actors

| Actor | Access Level | Can Do |
|-------|-------------|--------|
| Professor (public) | Unauthenticated | Create ticket, track status, rate service |
| Technician | `technician` or `admin` | View/update tickets, add comments, resolve |
| Admin | `admin` or `super_admin` | All above + assign technicians, manage SLA |

## Dependencies

- **Core:** auth, permissions, workspaces, notifications
- **Lib:** icons, charts, hooks (useRealtimeSubscription)
- **API:** Flask backend (`/api/chamados*`)
- **External:** Cloudinary (photos), Supabase (Realtime)

**No imports from other modules** (PCare, Stock, ReservaLab, TV).

## Module Isolation

Chamados is fully independent. It can run without any other module enabled:
- Tickets without `assetId`/`assetSource` work normally
- Room data comes from local `rooms` collection
- Problem categories from local `problem_templates`
- SLA config from local `sla_configs`

## Related

- [Architecture](architecture.md) — Component and service details
- [Workflows](workflows.md) — Step-by-step user flows
- [Reference](reference.md) — Types, endpoints, events
