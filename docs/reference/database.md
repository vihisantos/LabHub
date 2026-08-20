# Database Reference

> Supabase PostgreSQL schema reference.

## Schemas

| Schema | Purpose | Access |
|--------|---------|--------|
| `public` | Core tables (workspaces, profiles, assets, tickets, TV) | RLS + service_role |
| `pcare` | PCare data (pcs, parts, maintenance) | Sync engine |
| `stock` | Stock data (items, movements, kits, inventory) | Sync engine |

## Tables

### public.workspaces

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | Auto-generated |
| `name` | text | Campus name |
| `slug` | text UK | URL-friendly identifier |
| `location` | text | Physical location |
| `spreadsheet_url` | text | ReservaLab SharePoint URL |
| `lab_count` | smallint | Number of labs (default 2) |
| `color` | text | Display color |
| `disabled_apps` | jsonb | Array of disabled module IDs |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |

### public.profiles

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | = auth.users.id |
| `email` | text | User email |
| `name` | text | Display name |
| `role` | text | viewer, technician, admin |
| `status` | text | active, pending |
| `is_super_admin` | boolean | Super admin flag |
| `workspace_ids` | uuid[] | Workspace memberships |
| `app_access` | jsonb | Per-module access overrides |
| `notify_settings` | jsonb | Notification preferences |
| `avatar` | text | Avatar URL |
| `banner` | text | Banner URL |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |

### public.assets (Global Asset Registry)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | Auto-generated |
| `workspace_id` | uuid FK | Campus ownership |
| `asset_tag` | text | Patrimony number (unique per workspace) |
| `serial_number` | text | Manufacturer serial |
| `equipment_type` | text | Desktop, Notebook, etc. |
| `manufacturer` | text | Manufacturer name |
| `model` | text | Model name |
| `name` | text | Human-readable name |
| `status` | text | draft, active, maintenance, retired |
| `metadata` | jsonb | Module-specific extensions |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |

### public.chamados_tickets

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | Auto-generated |
| `workspace_id` | uuid FK | Campus |
| `roomName` | text | Location |
| `ticketNumber` | int | Sequential per workspace |
| `status` | text | aberto, a_caminho, em_atendimento, resolvido, fechado |
| `priority` | text | baixa, normal, alta, urgente |
| `reportedBy` | text | Reporter name |
| `assignedTo` | text | Assigned technician |
| `problemCategory` | text | Problem category |
| `problemDescription` | text | Description |
| `feedbackRating` | int | 1-5 stars |
| `feedbackComment` | text | Feedback text |
| `feedbackAt` | timestamptz | Feedback timestamp |
| `archived` | boolean | Archive flag |
| `createdAt` | timestamptz | Creation timestamp |
| `updatedAt` | timestamptz | Last update timestamp |

### TV Tables

Tables in `public` schema:
- `tv_events` — Corporate events
- `tv_playlists` — Video/music playlists
- `tv_music_queues` — Music queue
- `tv_music_tracks` — Tracks in queue
- `tv_announcements` — Text announcements
- `tv_galleries` — Photo galleries
- `tv_gallery_photos` — Photos in gallery
- `tv_calendar_cache` — Calendar data cache
- `tv_urgent_announcements` — Emergency messages
- `tv_devices` — Registered TV devices
- `tv_activation_codes` — Device activation
- `tv_music_requests` — Music requests

### pcare Schema

- `pcs` — Computer inventory
- `parts` — Available parts
- `part_usage` — Parts usage history
- `maintenance` — Maintenance records
- `checklist_templates` — Checklist templates
- `pc_checklists` — Executed checklists
- `action_logs` — Action history

### stock Schema

- `stock_items` — Inventory items
- `stock_movements` — Movement history
- `stock_kits` — Item kits
- `stock_maintenance` — Preventive maintenance
- `stock_inventory_cycles` — Inventory count cycles
- `stock_inventory_counts` — Individual counts
- `notifications` — System notifications

## RLS Policies

All stock/pcare tables use workspace-based RLS with per-operation policies:

```sql
-- Helper function (migration 027)
CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT ws_id IS NULL OR ws_id = ''
      OR ws_id IN (
        SELECT unnest(workspace_ids)::text
        FROM public.profiles WHERE id = auth.uid()
      )
$$;
-- Also has a uuid overload for FK-typed workspace_id columns

-- Per-table policy pattern:
CREATE POLICY "{table}_select" ON schema.table FOR SELECT
  USING (is_super_admin() OR user_belongs_to_workspace(workspace_id));
-- Same for INSERT, UPDATE (with WITH CHECK), DELETE
```

Exceptions:
- `chamados_tickets` has `REVOKE ALL FROM anon, authenticated` — only service_role access.
- `pg_sql()` function is `REVOKE`d from anon/authenticated/PUBLIC (migration 025).

### Security Migrations

| Migration | Description |
|-----------|-------------|
| 025 | Revoke `pg_sql()` from anon/authenticated/PUBLIC |
| 026 | Revoke anon from stock/pcare schemas, move notification creation to DB trigger |
| 027 | Replace permissive RLS with workspace-scoped policies, create `user_belongs_to_workspace()` |

## Related

- [Architecture: Data Layer](../architecture/data-layer.md)
- [Guides: Database Migrations](../guides/database-migrations.md)
