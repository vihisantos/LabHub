# Assets

> What is an asset in LabHub and how is it tracked?

## What

An Asset is a physical IT asset (computer, monitor, printer, etc.) tracked in the Global Asset Registry. Each asset belongs to a workspace and has properties like asset tag, serial number, equipment type, manufacturer, and model.

## Why

Before the Global Asset Registry, asset data was scattered across PCare (computers) and Stock (peripherals) with no unified view. The registry provides a single source of truth for all physical assets across campuses.

## How It Works

### Global Asset Registry (`public.assets`)

The registry lives in Supabase with full RLS protection:

- Each asset has a unique `asset_tag` per workspace
- Status lifecycle: `draft` → `active` → `maintenance` → `retired`
- Custom metadata via JSONB for module-specific extensions
- Workspace-scoped via RLS policies

### Relationship to Legacy Modules

- **PCare** still manages detailed computer data (specs, config, parts) in its own collection
- **Stock** manages materials and peripherals in its own collection
- **Global Registry** provides the unified view across both

The coexistence is peaceful — different collections, different types, different Supabase schemas.

### Data Flow

```
User creates/updates asset
    ↓
Global Repository (core/assets/global-repository.ts)
    ↓
IndexedDB (local cache)
    ↓
Supabase sync (public.assets)
    ↓
RLS filtering by workspace_id
```

## Security

- RLS: `workspace_id IN (SELECT unnest(workspace_ids) FROM profiles WHERE id = auth.uid())`
- Sync uses authenticated client (user JWT), not service_role
- Frontend `workspaceStore.filter()` is second barrier (defense in depth)

## Related

- [Architecture: Data Layer](../architecture/data-layer.md)
- [Module: Assets](../modules/assets/overview.md)
