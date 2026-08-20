# ADR-007 — Supabase Realtime for Ticket Updates

## Status

Accepted

## Context

Ticket status changes need to propagate to professors instantly. The 15-second polling fallback introduces unnecessary delay for time-sensitive updates (e.g., "technician is on the way").

## Decision

Use Supabase Realtime (WebSocket) for instant ticket status updates. Subscribe to `chamados_tickets` changes and merge into local state via `useRealtimeSubscription`.

Polling (15s) remains as a fallback for environments where WebSocket is unavailable.

## Alternatives Considered

1. **Polling only (5s)** — Higher server load, still has latency
2. **Socket.io** — Additional infrastructure, Supabase already provides WebSocket
3. **Server-Sent Events** — One-way, doesn't fit bidirectional needs

## Consequences

### Positive
- Sub-second latency for status updates
- No additional infrastructure (Supabase includes Realtime)
- Graceful fallback to polling
- Works across browser tabs via broadcast channels

### Negative
- WebSocket connections consume Supabase plan resources
- Requires careful channel scoping to avoid connection limits
- Offline scenarios fall back to polling

## Related

- `src/lib/useRealtimeSubscription.ts`
- `src/apps/chamados/contexts/TicketsContext.tsx`
- [Architecture: Realtime](../architecture/realtime.md)
