import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { WorkspaceProvider, useWorkspace } from '../WorkspaceContext'
import type { User } from '../../auth/types'
import type { Workspace } from '../types'

const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }))
const { mockSync } = vi.hoisted(() => ({ mockSync: vi.fn() }))
const { mockSyncState } = vi.hoisted(() => ({ mockSyncState: { current: [] as unknown[] } }))
const { mockGateProps } = vi.hoisted(() => ({ mockGateProps: { current: null as unknown } }))

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../service', () => ({
  workspaceService: {
    syncFromSupabase: () => mockSync(),
    getAll: () => mockSyncState.current,
  },
}))

vi.mock('../store', () => ({
  workspaceStore: { set: vi.fn() },
}))

vi.mock('../../../platform/WorkspaceGate/WorkspaceGate', () => ({
  WorkspaceGate: (props: any) => {
    mockGateProps.current = props
    return null
  },
}))

// Lê o contexto e expõe no DOM. Só renderiza quando o provider mostra os
// children (ou seja, quando NÃO há gate de seleção).
function Probe() {
  const { loading, pendingSelection, workspace, assignedWorkspaces } = useWorkspace()
  return (
    <div
      data-testid="probe"
      data-loading={String(loading)}
      data-pending={String(pendingSelection)}
      data-workspace={workspace?.id ?? ''}
      data-assigned={(assignedWorkspaces ?? []).map((w) => w.id).join(',')}
    />
  )
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'a@labhub.com',
    name: 'A',
    roleId: 'role-viewer',
    status: 'active',
    is_super_admin: false,
    workspace_ids: [],
    accent: 'emerald',
    theme_variant: 'dark',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function makeWorkspace(id: string, name = id): Workspace {
  return {
    id,
    name,
    slug: id,
    location: '',
    spreadsheet_url: '',
    color: '',
    disabled_apps: [],
    created_at: '',
    updated_at: '',
  }
}

const WS = [makeWorkspace('ws-sjc', 'Anhembi SJC'), makeWorkspace('ws-mooca', 'Anhembi Mooca')]

function idsOf(workspaces: Workspace[] | undefined): string {
  return (workspaces ?? []).map((w) => w.id).join(',')
}

function renderProvider() {
  return render(
    <MemoryRouter>
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>
    </MemoryRouter>,
  )
}

async function waitForGate() {
  await waitFor(() => expect(mockGateProps.current).not.toBeNull())
  const props = mockGateProps.current as {
    workspaces?: Workspace[]
    canCreate?: boolean
    onSelect?: (ws: Workspace, persist: boolean) => void
  }
  return props
}

beforeEach(() => {
  vi.clearAllMocks()
  // O setup global ativa fake timers — desativa para waitFor/findBy funcionarem
  vi.useRealTimers()
  localStorage.clear()
  mockGateProps.current = null
  mockSyncState.current = WS
  mockSync.mockImplementation(async () => {
    mockSyncState.current = WS
    return WS
  })
})

describe('WorkspaceContext — usuários e seus workspaces', () => {
  it('super admin tem todos os workspaces atribuídos e pode criar', async () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ is_super_admin: true, workspace_ids: [] }) })

    renderProvider()

    const props = await waitForGate()
    expect(idsOf(props.workspaces)).toBe('ws-sjc,ws-mooca')
    expect(props.canCreate).toBe(true)
  })

  it('usuário com workspace_ids vê apenas os workspaces atribuídos (ignora ids inexistentes)', async () => {
    // ws-x não existe: deve ser filtrado — sobra apenas ws-mooca
    mockUseAuth.mockReturnValue({ user: makeUser({ workspace_ids: ['ws-mooca', 'ws-x'] }) })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('probe').dataset.loading).toBe('false'))
    expect(screen.getByTestId('probe').dataset.assigned).toBe('ws-mooca')
    // 1 workspace real atribuído → entra direto, sem gate
    expect(screen.getByTestId('probe').dataset.workspace).toBe('ws-mooca')
    expect(mockGateProps.current).toBeNull()
  })

  it('usuário com workspace_ids vazio (legado) vê todos os workspaces', async () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ workspace_ids: [] }) })

    renderProvider()

    const props = await waitForGate()
    expect(idsOf(props.workspaces)).toBe('ws-sjc,ws-mooca')
    expect(props.canCreate).toBe(false)
  })

  it('usuário com exatamente 1 workspace atribuído entra direto nele (sem gate)', async () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ workspace_ids: ['ws-sjc'] }) })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('probe').dataset.loading).toBe('false'))
    expect(mockGateProps.current).toBeNull()
    expect(screen.getByTestId('probe').dataset.pending).toBe('false')
    expect(screen.getByTestId('probe').dataset.workspace).toBe('ws-sjc')
    expect(screen.getByTestId('probe').dataset.assigned).toBe('ws-sjc')
    expect(localStorage.getItem('labhub_active_workspace')).toBe('ws-sjc')
  })

  it('usuário com vários workspaces e sem preferência passa pelo gate de seleção', async () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ workspace_ids: ['ws-sjc', 'ws-mooca'] }) })

    renderProvider()

    const props = await waitForGate()
    expect(idsOf(props.workspaces)).toBe('ws-sjc,ws-mooca')
    expect(props.canCreate).toBe(false)
  })

  it('gate não reabre para super admin que já escolheu, mesmo com re-render do auth', async () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ is_super_admin: true, workspace_ids: [] }) })

    const { rerender } = renderProvider()

    const props = await waitForGate()
    expect(props.onSelect).toBeDefined()

    // Escolhe o campus no gate (sem marcar "Manter preferência")
    props.onSelect!(WS[0], false)
    await waitFor(() => expect(screen.getByTestId('probe').dataset.workspace).toBe('ws-sjc'))
    expect(screen.getByTestId('probe').dataset.pending).toBe('false')

    // Simula evento do auth (ex.: TOKEN_REFRESHED): identidade nova, mesmos dados
    mockGateProps.current = null
    mockUseAuth.mockReturnValue({ user: makeUser({ is_super_admin: true, workspace_ids: [] }) })

    rerender(
      <MemoryRouter>
        <WorkspaceProvider>
          <Probe />
        </WorkspaceProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.workspace).toBe('ws-sjc')
    })
    // O gate NÃO reaparece e o workspace escolhido é mantido
    expect(mockGateProps.current).toBeNull()
    expect(screen.getByTestId('probe').dataset.pending).toBe('false')
  })
})
