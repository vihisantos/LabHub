# Workspaces

> What are workspaces and why does multi-tenancy matter?

## What

A Workspace represents a campus or organizational unit. It groups users, enabled modules, and all data. Every piece of data in LabHub belongs to a workspace.

## Why

University IT departments manage multiple campuses. A workspace isolates data per campus so each location only sees its own assets, tickets, and reservations.

## How It Works

Each workspace has:
- **name** and **slug** (e.g., "Anhembi Morumbi" → `anhembimorumbi`)
- **disabled_apps** — array of module IDs that are turned off for this campus
- **spreadsheet_url** — SharePoint link for ReservaLab
- **lab_count** — number of labs (default 2)

Users belong to workspaces via `profiles.workspace_ids` (UUID array).

## Data Isolation

Data isolation happens at three levels:

1. **Database (RLS)** — Supabase Row Level Security policies filter rows via `user_belongs_to_workspace(workspace_id)` with `is_super_admin()` bypass (migration 027)
2. **Frontend (filter)** — `workspaceStore.filter()` applies workspace filtering on local data
3. **API (backend)** — Flask endpoints verify workspace membership before operations

## Module Availability

A workspace can enable/disable modules independently:

```typescript
// Workspaces can have specific modules disabled
workspace.disabled_apps = ['tv', 'stock']  // TV and Stock are off for this campus
```

The availability check is three-layered:
1. **Workspace level** — Is the module enabled? (disabled_apps)
2. **User level** — Does the user have permission? (app_access / roles)
3. **Access granted** — Module is available

**Important:** Workspace disabled always wins. A user with `full` access to a module cannot use it if that module is disabled at the workspace level.

## Related

- [System Overview](system-overview.md)
- [Authorization](../architecture/authorization.md)
- [Modules](modules.md)
