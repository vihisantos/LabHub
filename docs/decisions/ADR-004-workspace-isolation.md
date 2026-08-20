# ADR-004 — Workspace Isolation Model

## Status

Accepted

## Context

LabHub serves multiple university campuses. Each campus needs its own data (assets, tickets, reservations) without visibility into other campuses' data. Users can belong to multiple campuses.

## Decision

Implement workspace isolation at three levels:
1. **Database (RLS)** — `workspace_id IN (SELECT unnest(workspace_ids) FROM profiles WHERE id = auth.uid())`
2. **Frontend (filter)** — `workspaceStore.filter()` on local collections
3. **Backend (API)** — `require_module()` checks workspace configuration

Users have `workspace_ids: UUID[]` in their profile. Active workspace is selected in the UI.

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
- `src/core/workspaces/store.ts`
- [Concepts: Workspaces](../concepts/workspaces.md)
