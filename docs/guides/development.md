# Development Guide

> Day-to-day development workflow for LabHub.

## Project Structure

```
src/
├── apps/           # Module sub-apps (lazy-loaded)
│   ├── chamados/   # Support tickets
│   ├── pcare/      # Computer inventory
│   ├── stock/      # Materials management
│   ├── reservalab/ # Reservations
│   └── tv/         # Digital signage
├── core/           # Shared infrastructure
│   ├── auth/       # Authentication
│   ├── workspaces/ # Multi-tenancy
│   ├── assets/     # Global asset registry
│   └── ...
├── lib/            # Shared utilities and hooks
│   ├── sync.ts     # Sync engine
│   ├── storage.ts  # localStorage layer
│   └── ...
├── pages/          # Top-level pages (Launcher, Roadmap)
└── platform/       # Platform-specific code
```

## Conventions

### Module Isolation
- Modules must NOT import from other modules
- Shared code goes in `core/` or `lib/`
- Each module has its own theme, routes, and services

### Data Access Pattern
```typescript
// Use the service layer, never localStorage directly
const service = createSyncService<DataType>('collection_name')

// CRUD operations
service.getAll()
service.getById(id)
service.create(data)
service.update(id, data)
service.remove(id)
service.query(predicate)
```

### Component Pattern
- One component per file
- Co-locate tests in `__tests__/` directories
- Use TypeScript interfaces for props
- Prefer composition over configuration

### Styling
- Tailwind CSS v4 utility classes
- Theme tokens: `text-fg`, `bg-surface`, `border-line`, etc.
- Responsive: mobile-first with `sm:`, `md:`, `lg:` breakpoints

### Error Handling
- Never use `alert()` — use inline errors or toast notifications
- API errors display in the UI, not console only
- Sync failures are logged and retried automatically

## Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm run preview          # Preview production build

# Quality
npm run lint             # Run oxlint
npx tsc -b --noEmit      # Type check

# Tests
npm test                 # Run all tests
npm run test:run         # Run tests once (no watch)
```

## Adding Features

1. Check if the feature belongs to an existing module
2. If yes, add to that module's `pages/`, `components/`, `services/`
3. If it's cross-cutting, add to `core/` or `lib/`
4. If it's a new module, follow [Adding a Module](adding-module.md)

## Related

- [Setup Guide](setup.md)
- [Testing Guide](testing.md)
- [Adding a Module](adding-module.md)
