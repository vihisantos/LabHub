# ADR-004 — Workspace Isolation Model

## Status

Accepted

## Context

LabHub serves multiple university campuses. Each campus needs its own data (assets, tickets, reservations) without visibility into other campuses' data. Users can belong to multiple campuses.

## Decision

Implement workspace isolation at three levels:
1. **Database (RLS)** — Per-operation policies (SELECT/INSERT/UPDATE/DELETE) using `user_belongs_to_workspace(workspace_id)` with `is_super_admin()` bypass. Implemented in migration 027.
2. **Frontend (filter)** — `workspaceStore.filter()` on local collections
3. **Backend (API)** — `require_module()` checks workspace configuration

Users have `workspace_ids: UUID[]` in their profile. Active workspace is selected in the UI.

### Helper Function
```sql
-- Migration 027: user_belongs_to_workspace()
-- Two overloads: text (stock_items, notifications) and uuid (FK columns)
CREATE OR REPLACE FUNCTION public.user_belongs_to_workspace(ws_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT ws_id IS NULL OR ws_id = ''
      OR ws_id IN (
        SELECT unnest(workspace_ids)::text
        FROM public.profiles WHERE id = auth.uid()
      )
$$;
```

## Alternatives Considered

1. **Separate Supabase projects per campus** — Doesn't scale, can't share cross-campus data
2. **Schema per campus** — Migration nightmare, doesn't support multi-campus users
3. **Application-level filtering only** — No database-level protection

## Consequences

### Positive
- Database-level security (RLS) as primary barrier
- Supports multi-campus users seamlessly
- Module enable/disable per workspace
- Consistent pattern across all tables

### Negative
- RLS policies add query complexity
- Indexed array queries on `workspace_ids` can be slow at scale
- Workspace deletion requires cascading cleanup

## Related

- `supabase/migrations/009_workspace_isolation.sql`
- `supabase/migrations/025_security_revoke_pg_sql.sql` — revoke pg_sql from anon/authenticated
- `supabase/migrations/026_security_revoke_anon_stock_pcare.sql` — revoke anon from stock/pcare
- `supabase/migrations/027_rls_workspace_isolation.sql` — workspace-scoped RLS policies
- `src/core/workspaces/store.ts`
- [Concepts: Workspaces](../concepts/workspaces.md)
