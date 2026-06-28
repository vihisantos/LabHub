import { type ReactElement } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../lib/ThemeContext'
import type { PC } from '../apps/pcare/types'
import type { Part } from '../apps/pcare/types/part'
import type { ScheduledMaintenance } from '../apps/pcare/types/maintenance'
import type { ActionLog } from '../apps/pcare/types/actionLog'


function Providers({ children, initialEntries }: { children: React.ReactNode; initialEntries?: string[] }) {
  return (
    <ThemeProvider>
      <MemoryRouter initialEntries={initialEntries ?? ['/']}>
        {children}
      </MemoryRouter>
    </ThemeProvider>
  )
}

export function renderWithProviders(
  ui: ReactElement,
  options?: { initialEntries?: string[] } & Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: ({ children }) => <Providers initialEntries={options?.initialEntries}>{children}</Providers>, ...options })
}

const now = Math.floor(Date.now() / 1000)

export function seedLocalStorage(key: string, data: unknown) {
  localStorage.setItem(`labhub_${key}`, JSON.stringify(data))
}

export function makePC(overrides: Partial<PC> = {}): PC {
  return {
    id: crypto.randomUUID(),
    labName: 'Lab A',
    pcNumber: 'PC-001',
    assetTag: 'TAG-001',
    roomLocation: 'Sala 101',
    specs: { cpu: 'i5', ram: '8GB', storage: '256GB', os: 'Windows 11' },
    cleaningStatus: 'pending',
    restorationStatus: 'pending',
    softwareInstalled: ['Chrome'],
    partsReplaced: [],
    observations: '',
    photos: [],
    lastIntervention: null,
    createdAt: { seconds: now, nanoseconds: 0 } as any,
    updatedAt: { seconds: now, nanoseconds: 0 } as any,
    ...overrides,
  }
}

export function makePart(overrides: Partial<Part> = {}): Part {
  return {
    id: crypto.randomUUID(),
    name: 'Teclado',
    category: 'periferico',
    quantity: 10,
    minQuantity: 2,
    notes: '',
    createdAt: { seconds: now, nanoseconds: 0 } as any,
    updatedAt: { seconds: now, nanoseconds: 0 } as any,
    ...overrides,
  }
}

export function makeMaintenance(overrides: Partial<ScheduledMaintenance> = {}): ScheduledMaintenance {
  return {
    id: crypto.randomUUID(),
    pcId: 'pc-1',
    labName: 'Lab A',
    pcNumber: 'PC-001',
    type: 'cleaning',
    scheduledDate: { seconds: now + 86400, nanoseconds: 0 } as any,
    notes: '',
    completed: false,
    completedAt: null,
    createdAt: { seconds: now, nanoseconds: 0 } as any,
    updatedAt: { seconds: now, nanoseconds: 0 } as any,
    ...overrides,
  }
}

export function makeActionLog(overrides: Partial<ActionLog> = {}): ActionLog {
  return {
    id: crypto.randomUUID(),
    pcId: 'pc-1',
    type: 'pc_created',
    description: 'PC criado',
    timestamp: { seconds: now, nanoseconds: 0 } as any,
    ...overrides,
  }
}


