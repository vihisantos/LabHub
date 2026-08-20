# Assets — Module Overview

> Global Asset Registry for tracking physical IT assets.

**Route:** `/assets` (admin only)
**Color:** `#8b5cf6` (violet)

## Purpose

The Assets module provides a unified view of all physical IT assets across campuses. Unlike PCare (computers) or Stock (materials), the Global Asset Registry is a single table that can track any type of equipment.

## Key Features

- Centralized asset registry across all workspaces
- Asset tagging with patrimony numbers
- Status lifecycle: draft → active → maintenance → retired
- Workspace-scoped via RLS
- Extensible metadata via JSONB

## Data Source

- **Supabase:** `public.assets` table with full RLS
- **Local cache:** IndexedDB via `core/assets/global-repository.ts`
- **No sync engine** — direct Supabase access with authenticated client

## Security

RLS ensures workspace isolation:
```sql
workspace_id IN (
  SELECT unnest(workspace_ids)
  FROM profiles WHERE id = auth.uid()
)
```

## Related

- [Concepts: Assets](../../concepts/assets.md)
- [Architecture: Data Layer](../../architecture/data-layer.md)
