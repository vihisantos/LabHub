# Testing Guide

> How to write and run tests in LabHub.

## Test Stack

- **Vitest** — test runner
- **Testing Library** — component testing utilities
- **jsdom** — browser environment simulation

## Running Tests

```bash
npm test                 # Watch mode
npm run test:run         # Single run
npm run test:coverage    # With coverage report
```

## Test Structure

Tests live in `__tests__/` directories near the code they test:

```
src/apps/chamados/pages/
├── TicketDetail.tsx
└── __tests__/
    ├── TicketDetail.test.tsx
    └── TicketDetailRealtime.test.tsx
```

## Writing Tests

### Basic Component Test

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MyComponent } from '../MyComponent'

// Mock dependencies
vi.mock('../../hooks/useData', () => ({
  useData: () => ({
    data: mockData,
    loading: false,
  }),
}))

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />)
    expect(screen.getByText('Expected text')).toBeDefined()
  })
})
```

### Mocking Patterns

```typescript
// Mock a hook
vi.mock('../../hooks/useTickets', () => ({
  useTickets: () => ({
    tickets: [TICKET],
    update: mockUpdate,
    updateStatus: mockUpdateStatus,
  }),
}))

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'ticket-1' }),
  useNavigate: () => mockNavigate,
}))

// Mock Supabase
vi.mock('../../../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))
```

### Testing Async Behavior

```typescript
import { waitFor } from '@testing-library/react'

it('loads data', async () => {
  render(<MyComponent />)
  await waitFor(() => {
    expect(screen.getByText('Loaded content')).toBeDefined()
  })
})
```

## Test Helpers

Located in `src/test/`:

- `helpers.tsx` — Custom render with providers
- `mocks.ts` — Shared mock data
- `setup.ts` — Test environment setup

## Backend Tests (Python)

```bash
cd api && python -m pytest tests/ -q
```

Tests for the Flask API endpoints.

## Related

- [Development Guide](development.md)
- [Setup Guide](setup.md)
