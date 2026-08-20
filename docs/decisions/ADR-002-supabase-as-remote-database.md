# ADR-002 — Supabase as Remote Database

## Status

Accepted

## Context

LabHub needs a hosted PostgreSQL database with authentication, realtime subscriptions, and row-level security. The team needs a managed service that reduces backend overhead.

## Decision

Use Supabase (hosted PostgreSQL) as the remote database. Leverage Supabase features:
- PostgreSQL with multiple schemas (public, pcare, stock)
- Row Level Security (RLS) for workspace isolation
- Realtime subscriptions for live updates
- Auth for user management
- PostgREST API for direct client access

## Alternatives Considered

1. **Custom PostgreSQL + Express API** — More control but higher maintenance burden
2. **Firebase Firestore** — NoSQL, doesn't fit relational data model
3. **PlanetScale** — No RLS, requires custom API layer

## Consequences

### Positive
- Built-in RLS eliminates custom authorization logic
- Realtime subscriptions without WebSocket management
- Auth integration with minimal setup
- Managed infrastructure (no DBA needed)

### Negative
- Vendor lock-in to Supabase ecosystem
- RLS policies can be complex to debug
- Service role key management adds security surface

## Related

- `src/lib/supabase.ts` — Client setup
- `supabase/migrations/` — Schema migrations
- [Architecture: Data Layer](../architecture/data-layer.md)
