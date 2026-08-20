# ADR-001 — Offline-first Architecture with localStorage

## Status

Accepted

## Context

University IT labs often have unreliable network connectivity. Technicians need to create tickets, check inventory, and update records even when offline. The app must never block on network availability.

## Decision

Use localStorage as the primary data store with background synchronization to Supabase. All CRUD operations write to localStorage first (synchronous, instant), and changes sync to Supabase when connectivity is available.

## Alternatives Considered

1. **IndexedDB as primary** — More complex API, async, harder to debug. localStorage is sufficient for the data volume.
2. **Service Worker caching only** — Doesn't handle data conflicts or multi-device sync.
3. **Online-only with retry queue** — Blocks user on network failure, poor UX.

## Consequences

### Positive
- App works 100% offline
- Instant UI feedback (no loading states for writes)
- Simple implementation with `createLocalService()`
- Existing sync engine handles merge conflicts

### Negative
- Data limited by localStorage quota (~5MB)
- No real-time multi-device sync (eventual consistency)
- Binary data (photos) must use IndexedDB separately

## Related

- `src/lib/storage.ts` — localStorage layer
- `src/lib/sync.ts` — Sync engine
- [Offline-first](../concepts/offline-first.md)
