# Database Migrations

> How to create and manage Supabase migrations.

## Migration Location

All migrations are in `supabase/migrations/`:

```
supabase/migrations/
├── 001_create_profiles.sql
├── 002_seed_admin.sql
├── ...
├── 024_global_asset_registry.sql
└── supa/              # Supabase CLI managed
```

## Naming Convention

```
NNN_description_in_snake_case.sql
```

Examples:
- `025_add_ticket_notes.sql`
- `026_create_location_registry.sql`

## Creating a Migration

1. **Write the SQL** in a new file with the next sequence number
2. **Test in Supabase SQL Editor** before committing
3. **Include rollback** in a comment at the top

```sql
-- ============================================================
-- 025: Add ticket notes column
--
-- Adds a notes field to chamados_tickets for internal comments.
-- Rollback: ALTER TABLE public.chamados_tickets DROP COLUMN IF EXISTS notes;
-- ============================================================

ALTER TABLE public.chamados_tickets
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
```

## Best Practices

### Always Use IF NOT EXISTS
```sql
-- ✅ Safe to re-run
CREATE TABLE IF NOT EXISTS public.my_table (...);
ALTER TABLE public.my_table ADD COLUMN IF NOT EXISTS my_col TEXT;

-- ❌ Will fail on re-run
CREATE TABLE public.my_table (...);
ALTER TABLE public.my_table ADD COLUMN my_col TEXT;
```

### Always Include Rollback
```sql
-- Rollback: DROP TABLE IF EXISTS public.my_table;
```

### RLS Policies
```sql
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "my_table_select" ON public.my_table
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR workspace_id IN (
      SELECT unnest(workspace_ids)
      FROM public.profiles WHERE id = auth.uid()
    )
  );
```

### Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_my_table_workspace
  ON public.my_table(workspace_id);
```

## Schema Organization

| Schema | Purpose |
|--------|---------|
| `public` | Core tables: workspaces, profiles, assets, tickets, TV |
| `pcare` | PCare-specific: pcs, parts, maintenance, checklists |
| `stock` | Stock-specific: items, movements, kits, inventory, notifications |

## Testing Migrations

1. Run in Supabase SQL Editor
2. Verify with `SELECT` queries
3. Check RLS with different user roles
4. Test with the app (create/read/update/delete)

## Related

- [Reference: Database](../reference/database.md)
- [Architecture: Data Layer](../architecture/data-layer.md)
