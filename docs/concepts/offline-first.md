# Offline-first

> How does LabHub work without internet?

## What

Offline-first means the application reads and writes data to localStorage first, treating it as the source of truth. When internet is available, changes sync to Supabase in the background.

## Why

University labs often have unreliable network connectivity. Technicians need to create tickets, check inventory, and update records even when offline. The app must never block on network availability.

## How It Works

### Write Path (Offline)

```
User action (create/update/delete)
    ↓
localStorage write (instant, synchronous)
    ↓
Collection marked as "dirty" in labhub_dirty_collections
    ↓
UI updates immediately
```

### Sync Path (Online)

```
Sync engine runs (periodic or triggered)
    ↓
For each dirty collection:
    1. Pull remote changes from Supabase
    2. Merge by timestamp (newer wins)
    3. Push local changes that are newer
    4. Clear dirty flag
    ↓
UI re-renders with merged data
```

### Key Behaviors

- **First sync is pull-only** — Mock/seed data from localStorage is never uploaded
- **Merge by timestamp** — `updatedAt` determines which version wins
- **Tombstone tracking** — Deleted IDs are stored in `labhub_deleted_ids` and propagated to remote on next sync
- **Polling fallback** — 15-second interval sync as backup to Realtime

### What Works Offline

| Feature | Offline Behavior |
|---------|-----------------|
| CRUD operations | ✅ Full functionality |
| Search and filter | ✅ Full functionality |
| Ticket creation (public) | ✅ Queued for sync |
| Push notifications | ❌ Requires online |
| Real-time updates | ❌ Falls back to polling |
| Photo upload (Cloudinary) | ❌ Requires online |

### localStorage Structure

All local data uses the `labhub_` prefix:
- `labhub_pcs` — PCare data
- `labhub_stock_items` — Stock data
- `labhub_dirty_collections` — Pending sync collections
- `labhub_deleted_ids` — Tombstones for propagation
- `labhub_sync_log` — Sync history

## Related

- [Synchronization](synchronization.md) — The sync engine details
- [Architecture: Data Layer](../architecture/data-layer.md)
