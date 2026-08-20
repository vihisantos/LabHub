# Adding a Module

> Step-by-step guide to creating a new module in LabHub.

## Prerequisites

- Understanding of the existing module structure
- Knowledge of the data layer (localStorage + sync)

## Step 1: Create Module Directory

```
src/apps/<module-name>/
├── index.tsx              # Route definitions
├── layouts/
│   └── <Module>Layout.tsx # Layout with navigation
├── pages/
│   ├── Dashboard.tsx      # Main dashboard
│   └── __tests__/
├── components/
├── hooks/
├── services/
├── types/
└── utils/
```

## Step 2: Define Routes

```typescript
// src/apps/<module-name>/index.tsx
import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'

const Dashboard = lazy(() => import('./pages/Dashboard'))

export function <ModuleName>App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
    </Routes>
  )
}
```

## Step 3: Create Layout

```typescript
// src/apps/<module-name>/layouts/<Module>Layout.tsx
import { ThemeProvider } from '../../../lib/ThemeContext'

export function <Module>Layout({ children }) {
  return (
    <ThemeProvider storageKey="<module>_theme" defaultTheme="dark">
      <div className="flex min-h-dvh flex-col bg-surface">
        {/* Navigation */}
        <main className="flex-1 p-4">{children}</main>
      </div>
    </ThemeProvider>
  )
}
```

## Step 4: Register in App.tsx

```typescript
// src/App.tsx
const <Module>App = lazy(() =>
  import('./apps/<module-name>').then(m => ({ default: m.<ModuleName>App }))
)

// Add route
<Route path="/<module-name>/*" element={
  <AuthGuard>
    <AppGuard module="<module-name>">
      <<Module>App />
    </AppGuard>
  </AuthGuard>
} />
```

## Step 5: Register in App Registry

```typescript
// src/appRegistry.ts
{
  id: '<module-name>',
  name: 'Module Name',
  icon: 'iconName',
  color: '#hex',
  route: '/<module-name>',
  description: 'What this module does',
}
```

## Step 6: Create Service Layer

```typescript
// src/apps/<module-name>/services/<module>Service.ts
import { createSyncService } from '../../../lib/sync'
import type { <Module>Type } from '../types'

export const <module>Service = createSyncService<<Module>Type>('<collection>')
```

## Step 7: Add to Workspace Module List

Update `src/core/workspaces/apps.ts` to include the new module in the available modules list.

## Step 8: Write Tests

Create tests in `src/apps/<module-name>/pages/__tests__/`.

## Isolation Rules

- **DO NOT** import from other modules (`src/apps/other-module/`)
- **DO** use `core/` and `lib/` for shared functionality
- **DO** use `createSyncService()` for data with remote tables
- **DO** create a ThemeProvider with a unique `storageKey`

## Related

- [Development Guide](development.md)
- [Modules Concept](../concepts/modules.md)
