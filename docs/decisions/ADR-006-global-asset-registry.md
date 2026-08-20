# ADR-006 — Global Asset Registry

## Status

Accepted

## Context

Asset data was scattered across PCare (computers in `pcare.pcs`) and Stock (materials in `stock.stock_items`). There was no unified view of all physical IT assets across a campus. Reporting required joining data from multiple sources.

## Decision

Create a Global Asset Registry in `public.assets` — a single table that tracks all physical IT assets. It has its own RLS policies, uses direct Supabase access (not the sync engine), and coexists with legacy collections.

## Alternatives Considered

1. **Extend PCare's pcs table** — Too specific to computers, can't track other asset types
2. **Extend Stock's stock_items table** — Designed for consumables, not durable assets
3. **Federate from both tables** — Complex, no single source of truth

## Consequences

### Positive
- Unified view of all assets across campus
- Clean RLS by workspace
- Extensible via `metadata` JSONB column
- Independent of legacy module schemas

### Negative
- Data duplication with PCare/Stock during migration period
- Two asset concepts to explain (legacy + global)
- Migration path needed for existing data

## Related

- `supabase/migrations/024_global_asset_registry.sql`
- `src/core/assets/global-repository.ts`
- [Concepts: Assets](../concepts/assets.md)
