# ADR-008 — Three-Layer Access Control

## Status

Accepted

## Context

LabHub needs to control module access at multiple levels:
- A campus might not use all modules (e.g., no TV module)
- A user might have different permissions per module
- Both layers need to be enforced consistently

## Decision

Implement three-layer access control, checked in order:
1. **Workspace level** — Is the module enabled? (`disabled_apps`)
2. **User level** — Does the user have permission? (`app_access` / `role`)
3. **Access granted** — Module is available

**Workspace disabled always wins.** A user with `full` access cannot use a module disabled at the workspace level.

Backend enforcement: `require_module()` in Flask endpoints.
Frontend enforcement: `isModuleAvailable()` + `AppGuard` component.

## Alternatives Considered

1. **Role-only access** — Doesn't handle workspace-level module availability
2. **Workspace-only access** — Doesn't handle per-user permissions
3. **Single combined check** — Harder to debug which layer denied access

## Consequences

### Positive
- Clear, auditable access control
- Workspace admin controls module availability
- Granular per-user overrides possible
- Consistent enforcement frontend + backend

### Negative
- Three layers add complexity to permission debugging
- `disabled_apps` and `app_access` must be kept in sync conceptually

## Related

- `src/core/auth/AppGuard.tsx`
- `src/core/workspaces/apps.ts`
- `src/core/permissions/service.ts`
- [Architecture: Authorization](../architecture/authorization.md)
