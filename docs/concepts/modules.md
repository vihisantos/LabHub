# Modules

> What are modules and how is the system organized?

## What

A Module (or sub-app) is an independent functional unit within LabHub. Each module owns its own routes, services, components, theme, and data access pattern.

## Why

Modularity allows:
- Independent development and deployment
- Selective feature availability per workspace
- Clear separation of concerns
- Smaller bundle sizes via lazy loading

## Current Modules

| Module | Purpose | Data Source |
|--------|---------|-------------|
| **Chamados** | Support tickets and service orders | API Flask (`/api/chamados`) |
| **PCare** | Computer inventory and maintenance | localStorage + Supabase sync |
| **Stock** | Materials and supplies management | localStorage + Supabase sync |
| **ReservaLab** | Lab and tablet reservations | SharePoint Excel + Supabase (tablets) |
| **TV** | Digital signage and corporate channel | Supabase direct (no local sync) |

## Module Structure

Each module follows this convention:

```
src/apps/<module>/
├── index.tsx          # Route definitions
├── layouts/           # Layout with navigation
├── pages/             # Page components
├── components/        # Module-specific components
├── hooks/             # Custom hooks
├── services/          # Data access layer
├── types/             # TypeScript definitions
├── utils/             # Utility functions
└── api/               # (ReservaLab/TV only) Backend Python
```

## Isolation Rules

- Modules must NOT import from other modules
- Shared dependencies go through `core/` or `lib/`
- Each module can be independently enabled/disabled per workspace
- The Chamados module was the first to implement full isolation

## Adding a Module

See [Adding a Module](../guides/adding-module.md) for the step-by-step guide.

## Related

- [Workspaces](workspaces.md) — How modules are scoped
- [System Overview](system-overview.md) — High-level architecture
