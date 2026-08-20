# Data Layer

> How does LabHub manage data across local and remote storage?

## Three-tier Architecture

```mermaid
flowchart TB
    subgraph REMOTE["Supabase (PostgreSQL)"]
        PUBLIC["Schema: public\nworkspaces, profiles, assets,\nchamados_tickets, tv_*"]
        PCARE_S["Schema: pcare\npcs, parts, maintenance,\nchecklists, logs"]
        STOCK_S["Schema: stock\nstock_items, movements,\nkits, inventory, notifications"]
    end

    subgraph SYNC["Sync Engine (sync.ts)"]
        DIRTY["Dirty Tracking"]
        MERGE["Timestamp Merge"]
        TOMB["Tombstone Propagation"]
    end

    subgraph LOCAL["localStorage"]
        LS_DATA["labhub_* collections\nCRUD via createLocalService()"]
    end

    LS_DATA <--> SYNC
    SYNC <--> REMOTE
```

## localStorage (Local Source of Truth)

### Structure
- Prefix: `labhub_`
- Each collection is a JSON array stored as a string
- Access via `getCol<T>(collection)` / `setCol(collection, items)`

### Service Layer
```typescript
createLocalService<T>(collection) → {
  getAll(), getById(), create(), update(), remove(), query()
}
```

### Sync-aware Service Layer
```typescript
createSyncService<T>(collection) → {
  // Same API as createLocalService
  // Plus: marks collections dirty on write
  // Plus: tracks deletions for remote propagation
}
```

## Supabase (Remote Database)

### Schemas
| Schema | Tables | Access Pattern |
|--------|--------|---------------|
| `public` | workspaces, profiles, assets, chamados_tickets, tv_*, tablet_reservations | RLS + service_role |
| `pcare` | pcs, parts, part_usage, maintenance, checklists, logs | Sync engine |
| `stock` | stock_items, movements, kits, inventory, notifications | Sync engine |

### Row Level Security (RLS)
All stock/pcare tables have RLS with per-operation policies (SELECT/INSERT/UPDATE/DELETE). Policies use the helper function `user_belongs_to_workspace()`:

```sql
-- Function with text/uuid overloads (migration 027)
CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT ws_id IS NULL OR ws_id = ''
      OR ws_id IN (
        SELECT unnest(workspace_ids)::text
        FROM public.profiles WHERE id = auth.uid()
      )
$$;
-- uuid overload also exists for FK-typed workspace_id columns
```

Policy pattern:
```sql
CREATE POLICY "{table}_select" ON schema.table FOR SELECT
  USING (is_super_admin() OR user_belongs_to_workspace(workspace_id));
```

Key behaviors:
- **Super admin** (`is_super_admin()`) bypasses all policies
- **NULL workspace_id** (legacy records) → visible to everyone
- **service_role** → bypasses RLS entirely (used by triggers, Flask API)

### Exceptions
- `chamados_tickets` has `REVOKE ALL FROM anon, authenticated` — only the Flask API (service_role) can access it.
- `pg_sql()` function is `REVOKE`d from anon/authenticated/PUBLIC — only service_role can call it (migration 025).

## Data Access Patterns

### Pattern 1: Direct Supabase (Global Assets)
```
Component → useAssets() → global-repository.ts → Supabase (RLS)
```

### Pattern 2: Sync Engine (PCare, Stock)
```
Component → pcService → createSyncService → localStorage + dirty flag
                                                   ↓
                                          syncAll() → Supabase
```

### Pattern 3: Flask API (Chamados)
```
Component → ticketService → fetch('/api/chamados') → Flask → Supabase
```

### Pattern 4: External Source (ReservaLab)
```
Component → fetch('/api/reservas') → Flask → SharePoint Excel
```

## Local-only Collections

These collections have no remote table and exist only in localStorage:
- `assets` (legacy PCare assets)
- `chamados` (local cache, not used for writes)
- `rooms`, `problem_templates`, `sla_configs`
- `audit_logs`, `user_profiles`, `roles`

## Related

- [Synchronization](../concepts/synchronization.md)
- [Offline-first](../concepts/offline-first.md)
- [Reference: Database](../reference/database.md)
