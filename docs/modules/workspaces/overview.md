# Workspaces — Module Overview

> Multi-tenancy and campus management.

**Route:** `/admin/workspaces` (admin only)

## Purpose

Workspaces module manages campuses/organizational units. It handles creation, configuration, and lifecycle of workspaces including module enable/disable, spreadsheet URLs, and lab counts.

## Key Features

- **Workspace CRUD** — create, edit, delete campuses
- **Module control** — enable/disable modules per campus
- **Spreadsheet config** — ReservaLab spreadsheet URL per campus
- **Lab count** — number of labs per campus
- **Data backup** — export/import workspace data
- **Duplication** — clone workspace structure
- **Color customization** — workspace color in launcher

## Workspace Lifecycle

```
Created → Configured (modules, spreadsheet) → Active → ...
                                                ↓
                                           Deleted (with 2-day backup)
```

## Data Source

- **Supabase:** `workspaces` table with RLS
- **Local cache:** localStorage `labhub_workspaces`
- **Sync engine:** bidirectional sync

## Related

- [Concepts: Workspaces](../../concepts/workspaces.md)
- [Architecture: Authorization](../../architecture/authorization.md)
