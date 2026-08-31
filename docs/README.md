# LabHub Documentation

> Modular PWA for managing IT laboratory operations in university campuses.

**Version:** 2.1.0 · **Status:** Pre-release

---

## Understand the System

| Document | Description |
|----------|-------------|
| [System Overview](concepts/system-overview.md) | What LabHub is and why it exists |
| [Workspaces](concepts/workspaces.md) | Multi-tenancy and campus isolation |
| [Modules](concepts/modules.md) | How the system is organized into sub-apps |
| [Assets](concepts/assets.md) | Global Asset Registry for physical IT assets |
| [Tickets](concepts/tickets.md) | Support request lifecycle and SLA |
| [Offline-first](concepts/offline-first.md) | Local-first data strategy |
| [Synchronization](concepts/synchronization.md) | Data flow between localStorage and Supabase |
| [Glossary](glossary.md) | Quick reference for LabHub-specific terms |

## Architecture

| Document | Description |
|----------|-------------|
| [System Architecture](architecture/system.md) | High-level system design and data flow patterns |
| [Frontend](architecture/frontend.md) | React structure, components, and patterns |
| [Backend](architecture/backend.md) | Flask API, routes, and integrations |
| [Data Layer](architecture/data-layer.md) | Three-tier data architecture |
| [Realtime](architecture/realtime.md) | WebSocket subscriptions and live updates |
| [Authentication](architecture/authentication.md) | User auth flow and profile management |
| [Authorization](architecture/authorization.md) | Access control model (RBAC 2.0 + legacy) |
| [RBAC 2.0 Specification](architecture/rbac2.0-specification.md) | RBAC 2.0 technical specification |
| [RBAC 2.0 Actions Catalog](architecture/rbac2.0-actions-catalog.md) | Complete list of authorized Actions |
| [RBAC 2.0 Activation](architecture/rbac2.0-etapa7-activation.md) | Activation decisions and runbook |

## Module Documentation

| Module | Description |
|--------|-------------|
| [Chamados](modules/chamados/overview.md) | Support tickets and service orders |
| [Assets](modules/assets/overview.md) | Global Asset Registry |
| [Stock](modules/stock/overview.md) | Materials and supplies management |
| [PCare](modules/pcare/overview.md) | Computer inventory and maintenance |
| [ReservaLab](modules/reservalab/overview.md) | Lab and tablet reservations |
| [TV](modules/tv/overview.md) | Digital signage and corporate channel |
| [Workspaces](modules/workspaces/overview.md) | Campus management |

## Guides

| Guide | Description |
|-------|-------------|
| [Setup](guides/setup.md) | Development environment setup |
| [Development](guides/development.md) | Day-to-day workflow and conventions |
| [Testing](guides/testing.md) | Writing and running tests |
| [Adding a Module](guides/adding-module.md) | Step-by-step module creation |
| [Database Migrations](guides/database-migrations.md) | Creating Supabase migrations |
| [Deployment](guides/deployment.md) | CI/CD and release process |

## Technical Reference

| Reference | Description |
|-----------|-------------|
| [API](reference/api.md) | Flask endpoint reference |
| [Database](reference/database.md) | Supabase schema reference |
| [Types](reference/types.md) | TypeScript type definitions |
| [Events](reference/events.md) | Realtime events and notifications |
| [Configuration](reference/configuration.md) | Environment variables and config files |

## Engineering Decisions

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](decisions/ADR-001-offline-first-architecture.md) | Offline-first with localStorage | Accepted |
| [ADR-002](decisions/ADR-002-supabase-as-remote-database.md) | Supabase as remote database | Accepted |
| [ADR-003](decisions/ADR-003-flask-api-for-chamados.md) | Flask API for Chamados | Accepted |
| [ADR-004](decisions/ADR-004-workspace-isolation.md) | Workspace isolation model | Accepted |
| [ADR-005](decisions/ADR-005-module-isolation.md) | Module isolation pattern | Accepted |
| [ADR-006](decisions/ADR-006-global-asset-registry.md) | Global Asset Registry | Accepted |
| [ADR-007](decisions/ADR-007-realtime-for-tickets.md) | Realtime for tickets | Accepted |
| [ADR-008](decisions/ADR-008-three-layer-access-control.md) | Three-layer access control | Accepted |

## Operations

| Document | Description |
|----------|-------------|
| [Deployment](operations/deployment.md) | Deployment pipeline and rollback |
| [Monitoring](operations/monitoring.md) | Metrics and health checks |
| [Troubleshooting](operations/troubleshooting.md) | Common issues and solutions |
| [Recovery](operations/recovery.md) | Backup and disaster recovery |

## Historical

| Document | Description |
|----------|-------------|
| [Audits](audits/) | Historical analyses and legacy documentation |

---

## Contributing to Documentation

1. **One question per document** — Each doc should answer primarily one question
2. **Use the right category** — Concepts (what), Architecture (how it works), Guides (how to), Reference (details)
3. **Keep it current** — Update docs when code changes
4. **No empty files** — Only create docs with real content
5. **Use Mermaid** — Diagrams help, but don't overdo it

## License

Proprietary — All rights reserved. See [LICENSE](../LICENSE).
