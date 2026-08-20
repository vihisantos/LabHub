# Assets — Reference

> Technical reference for the Global Asset Registry.

## API

All access is via Supabase client with RLS. No Flask API endpoints.

## Database Table: `public.assets`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | Auto-generated |
| `workspace_id` | uuid FK | Campus ownership |
| `asset_tag` | text | Patrimony number (unique per workspace) |
| `serial_number` | text | Manufacturer serial |
| `equipment_type` | text | Desktop, Notebook, Monitor, etc. |
| `manufacturer` | text | Manufacturer name |
| `model` | text | Model name/number |
| `name` | text | Human-readable name |
| `location_id` | uuid | Placeholder for future Location Registry |
| `status` | text | draft, active, maintenance, retired |
| `notes` | text | Free-form notes |
| `metadata` | jsonb | Module-specific extensions |
| `created_by` | uuid | User who created it |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |

## Indexes

- `idx_assets_workspace_id` — workspace filtering
- `idx_assets_asset_tag` — patrimony lookup
- `idx_assets_serial_number` — serial lookup
- `idx_assets_status` — status filtering
- `idx_assets_equipment_type` — type filtering
- `idx_assets_workspace_asset_tag` — unique asset_tag per workspace (partial)

## Related

- [Overview](overview.md)
- [Architecture](architecture.md)
