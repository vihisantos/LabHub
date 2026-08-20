# ADR-005 — Module Isolation Pattern

## Status

Accepted

## Context

As LabHub grew from 4 modules to 5+, cross-module dependencies became a risk. Importing from other modules creates hidden coupling, increases bundle size, and makes modules hard to enable/disable independently.

## Decision

Enforce strict module isolation:
- Modules must NOT import from other modules (`src/apps/other-module/`)
- Shared code goes through `core/` or `lib/`
- Each module has its own theme, routes, services, and types
- A workspace can have any subset of modules enabled

The Chamados module was the first to implement full isolation. Other modules follow the same pattern.

## Alternatives Considered

1. **Shared module libraries** — Would create coupling and shared bundle dependencies
2. **Monolithic single app** — Doesn't support selective module enable/disable
3. **Micro-frontends (Module Federation)** — Overkill for this project size

## Consequences

### Positive
- Each module can be enabled/disabled independently
- Clear ownership boundaries
- Smaller per-module bundles via lazy loading
- Easier to test modules in isolation

### Negative
- Some code duplication across modules (acceptable tradeoff)
- Shared types need to live in `core/` or `lib/`

## Related

- `src/apps/` — Module directories
- [Concepts: Modules](../concepts/modules.md)
