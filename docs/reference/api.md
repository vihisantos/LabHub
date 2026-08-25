# API Reference

> Complete API endpoint reference for the Flask backend.

## Base URL

```
Production: https://lab-hub-pi.vercel.app/api
Development: http://localhost:5173/api
```

## Authentication

Most endpoints use Supabase service_role (backend only). Public endpoints are noted.

## Chamados Endpoints

### POST /api/chamados
Create a ticket (public, no auth).

**Request:**
```json
{
  "workspace_id": "uuid (required)",
  "roomName": "string (required)",
  "roomId": "string (optional)",
  "reportedBy": "string (required)",
  "reportedByEmail": "string (optional)",
  "problemCategory": "string (required)",
  "problemArea": "administrativa | academica (required)",
  "problemDescription": "string (required)",
  "priority": "baixa | normal | alta | urgente (required)",
  "photos": "base64 string or Cloudinary URL (optional)"
}
```

**Response:** `200`
```json
{
  "ticket": {
    "id": "uuid",
    "ticketNumber": 42,
    "status": "aberto",
    "createdAt": "ISO timestamp",
    ...
  }
}
```

**Errors:**
- `400` — Missing required fields
- `403` — Module disabled for workspace (`MODULE_DISABLED`)
- `503` — Backend not configured

### GET /api/chamados
List tickets.

**Query params:**
- `workspace_id` — Filter by workspace
- `status` — Filter by status
- `reportedBy` — Filter by reporter name

### GET /api/chamados/:id
Get ticket by ID.

### PATCH /api/chamados/:id
Update ticket.

**Body:** Partial ticket object with fields to update.

### POST /api/chamados/:id/feedback
Submit rating (public, no auth).

**Request:**
```json
{
  "rating": 4,
  "comment": "Optional comment (max 500 chars)"
}
```

**Response:** `200`
```json
{
  "ticket": {
    "feedbackRating": 4,
    "feedbackComment": "...",
    "feedbackAt": "ISO timestamp"
  }
}
```

**Errors:**
- `400` — Invalid rating (must be 1-5) or ticket already rated
- `404` — Ticket not found

### GET /api/chamados/reports
Get aggregated report data.

### POST /api/chamados/workspaces
List available campuses.

## Push Notification Endpoints

### POST /api/push/subscribe
Register push subscription.

### GET /api/push/test
Send test notification.

### POST /api/push/send
Send segmented push notification.

**Body:**
```json
{
  "title": "string",
  "body": "string",
  "url": "string (optional)",
  "module": "string (optional)",
  "workspace_id": "uuid (optional)",
  "role": "string (optional)",
  "userId": "uuid (optional)",
  "actions": [{"action": "...", "title": "..."}]
}
```

### POST /api/push/action
Handle notification actions (approve/reject user).

### Cron Endpoints (protected by CRON_SECRET)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/push/check` | Check upcoming reservations |
| `GET /api/push/check-overdue` | Check overdue loans |
| `GET /api/push/check-pcare` | Check PCare alerts |
| `GET /api/push/check-all` | All checks aggregated |

**Auth:** `Authorization: Bearer ${CRON_SECRET}`

## ReservaLab Endpoints

### GET /api/reservas
Get lab reservations from SharePoint.

**Query params:**
- `workspace_slug` — Campus slug

**Response:**
```json
{
  "lab1_reservas": [...],
  "lab2_reservas": [...],
  "reservas_semana": [...],
  "cache_info": { "timestamp": 1234567890 }
}
```

### GET /api/health
Server status.

## TV Endpoints

### POST /api/tv/youtube/fetch
Fetch YouTube video/playlist metadata.

### GET /api/tv/health
Server status.

### GET /api/tv/chamados/display
TV-safe snapshot of the workspace's tickets for the future CallsDashboardScreen kiosk screen.

**Auth:** device-only. `Bearer` JWT of a provisioned kiosk session; the workspace is
resolved server-side from the persisted `tv_devices.user_id → workspace_id` link.
Human/admin sessions are rejected (403). Client parameters never influence scope.

**Projection (allowlist, server-side):** `ticketNumber`, `roomName`, `problemArea`,
`problemCategory`, `priority`, `status`, `createdAt`, `resolvedAt`. Never returns:
reporter identity/e-mail, free-text description, asset patrimony, photos, comments,
feedback text, internal IDs or raw rows. This endpoint does NOT provide administrative
access to chamados (read-only projection, no writes).

**Response:** `{ generatedAt, summary: { total, open, inProgress, highPriority,
avgResolutionHours, satisfaction }, tickets: [...] }`

**Scope/limits:** active tickets only (`aberto/a_caminho/em_atendimento`, not archived),
max 100 items; metrics aggregated over an explicit 30-day window.

**Polling/rate limit:** poll every 30–60 s; limit 240 requests/hour per IP (429 beyond).

## Related

- [Architecture: Backend](../architecture/backend.md)
- [Reference: Database](database.md)
