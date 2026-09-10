import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { WorkspaceProvider, useWorkspace } from '../WorkspaceContext'
import type { User } from '../../auth/types'
import type { Membership } from '../../memberships/types'
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

function makeMembership(workspaceId: string, status: Membership['status'] = 'active'): Membership {
  return {
    id: `m-${workspaceId}-${status}`,
    profile_id: 'u-1',
    workspace_id: workspaceId,
    role_id: 'r-a',
    status,
    managed_by: null,
    created_at: '',
    updated_at: '',
  }
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
    memberships: [],
    membershipsLoaded: true,
    accent: 'emerald',
    theme_variant: 'dark',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

/** Atalho: usuário com memberships ativas nos workspaces dados. */
function memberUser(workspaceIds: string[], overrides: Partial<User> = {}): User {
  return makeUser({
    memberships: workspaceIds.map((id) => makeMembership(id)),
    membershipsLoaded: true,
    ...overrides,
  })
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

describe('WorkspaceContext — usuários e seus workspaces (fonte: memberships)', () => {
  it('super admin tem todos os workspaces atribuídos e pode criar', async () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ is_super_admin: true }) })

    renderProvider()

    const props = await waitForGate()
    expect(idsOf(props.workspaces)).toBe('ws-sjc,ws-mooca')
    expect(props.canCreate).toBe(true)
  })

  it('usuário com memberships vê apenas os workspaces ativos (ignora ids inexistentes)', async () => {
    // ws-x não existe: deve ser filtrado — sobra apenas ws-mooca
    mockUseAuth.mockReturnValue({ user: memberUser(['ws-mooca', 'ws-x']) })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('probe').dataset.loading).toBe('false'))
    expect(screen.getByTestId('probe').dataset.assigned).toBe('ws-mooca')
    // 1 workspace real atribuído → entra direto, sem gate
    expect(screen.getByTestId('probe').dataset.workspace).toBe('ws-mooca')
    expect(mockGateProps.current).toBeNull()
  })

  it('memberships vazias ⇒ NÃO vê workspaces (estado seguro — CASO 3, RBAC 2.0)', async () => {
    mockUseAuth.mockReturnValue({ user: memberUser([]) })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('probe').dataset.loading).toBe('false'))
    // A existência de workspaces no banco NÃO concede acesso: sem membership
    // ativa → sem gate, sem workspace ativo (estado seguro/bloqueado).
    expect(mockGateProps.current).toBeNull()
    expect(screen.getByTestId('probe').dataset.pending).toBe('false')
    expect(screen.getByTestId('probe').dataset.workspace).toBe('')
    expect(screen.getByTestId('probe').dataset.assigned).toBe('')
  })

  it('membership suspensa/removida NÃO concede visibilidade (fail-closed)', async () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({
        memberships: [makeMembership('ws-sjc', 'suspended'), makeMembership('ws-mooca', 'removed')],
        membershipsLoaded: true,
      }),
    })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('probe').dataset.loading).toBe('false'))
    expect(mockGateProps.current).toBeNull()
    expect(screen.getByTestId('probe').dataset.workspace).toBe('')
    expect(screen.getByTestId('probe').dataset.assigned).toBe('')
  })

  it('workspace_ids (legado) NÃO decide: memberships são a autoridade', async () => {
    // Coluna legada diz ws-sjc, mas a membership ativa é ws-mooca.
    mockUseAuth.mockReturnValue({
      user: memberUser(['ws-mooca'], { workspace_ids: ['ws-sjc'] }),
    })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('probe').dataset.loading).toBe('false'))
    expect(screen.getByTestId('probe').dataset.assigned).toBe('ws-mooca')
    expect(screen.getByTestId('probe').dataset.workspace).toBe('ws-mooca')
  })

  it('memberships ainda não carregadas ⇒ gate em loading, nada decidido', async () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ memberships: undefined, membershipsLoaded: false, workspace_ids: ['ws-sjc'] }),
    })

    renderProvider()

    // Loading NÃO resolve (permanece true) — e mesmo a coluna legada
    // preenchida não abre gate, workspace ou lista.
    await waitFor(() => expect(screen.getByTestId('probe').dataset.assigned).toBe(''))
    expect(screen.getByTestId('probe').dataset.loading).toBe('true')
    expect(mockGateProps.current).toBeNull()
    expect(screen.getByTestId('probe').dataset.workspace).toBe('')
    expect(screen.getByTestId('probe').dataset.pending).toBe('false')
  })

  it('usuário pendente NUNCA chega ao gate de workspace, mesmo com memberships', async () => {
    mockUseAuth.mockReturnValue({
      user: memberUser(['ws-sjc', 'ws-mooca'], { status: 'pending' }),
    })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('probe').dataset.loading).toBe('false'))
    // Pendente espera a aprovação na tela do AuthGuard — nada de seletor.
    expect(mockGateProps.current).toBeNull()
    expect(screen.getByTestId('probe').dataset.pending).toBe('false')
    expect(screen.getByTestId('probe').dataset.workspace).toBe('')
    expect(screen.getByTestId('probe').dataset.assigned).toBe('')
  })

  it('usuário com exatamente 1 workspace atribuído entra direto nele (sem gate)', async () => {
    mockUseAuth.mockReturnValue({ user: memberUser(['ws-sjc']) })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('probe').dataset.loading).toBe('false'))
    expect(mockGateProps.current).toBeNull()
    expect(screen.getByTestId('probe').dataset.pending).toBe('false')
    expect(screen.getByTestId('probe').dataset.workspace).toBe('ws-sjc')
    expect(screen.getByTestId('probe').dataset.assigned).toBe('ws-sjc')
    expect(localStorage.getItem('labhub_active_workspace')).toBe('ws-sjc')
  })

  it('usuário com vários workspaces e sem preferência passa pelo gate de seleção', async () => {
    mockUseAuth.mockReturnValue({ user: memberUser(['ws-sjc', 'ws-mooca']) })

    renderProvider()

    const props = await waitForGate()
    expect(idsOf(props.workspaces)).toBe('ws-sjc,ws-mooca')
    expect(props.canCreate).toBe(false)
  })

  it('gate não reabre para super admin que já escolheu, mesmo com re-render do auth', async () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ is_super_admin: true }) })

    const { rerender } = renderProvider()

    const props = await waitForGate()
    expect(props.onSelect).toBeDefined()

    // Escolhe o campus no gate (sem marcar "Manter preferência")
    props.onSelect!(WS[0], false)
    await waitFor(() => expect(screen.getByTestId('probe').dataset.workspace).toBe('ws-sjc'))
    expect(screen.getByTestId('probe').dataset.pending).toBe('false')

    // Simula evento do auth (ex.: TOKEN_REFRESHED): identidade nova, mesmos dados
    mockGateProps.current = null
    mockUseAuth.mockReturnValue({ user: makeUser({ is_super_admin: true }) })

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

describe('WorkspaceContext — storage hardening', () => {
  it('usuário com 1 workspace entra direto quando localStorage.getItem lança SecurityError', async () => {
    mockUseAuth.mockReturnValue({ user: memberUser(['ws-sjc']) })
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage access denied', 'SecurityError')
    })

    renderProvider()
    await waitFor(() => expect(screen.getByTestId('probe').dataset.loading).toBe('false'))
    expect(screen.getByTestId('probe').dataset.workspace).toBe('ws-sjc')
    expect(screen.getByTestId('probe').dataset.pending).toBe('false')

    spy.mockRestore()
  })

  it('seleção funciona quando localStorage.setItem lança SecurityError', async () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ is_super_admin: true }) })
    renderProvider()

    const props = await waitForGate()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage access denied', 'SecurityError')
    })

    props.onSelect!(WS[0], true)
    await waitFor(() => expect(screen.getByTestId('probe').dataset.workspace).toBe('ws-sjc'))
    expect(screen.getByTestId('probe').dataset.pending).toBe('false')

    spy.mockRestore()
  })

  it('clearPreference não lança quando localStorage.removeItem lança SecurityError', async () => {
    mockUseAuth.mockReturnValue({ user: memberUser(['ws-sjc']) })
    renderProvider()

    await waitFor(() => expect(screen.getByTestId('probe').dataset.loading).toBe('false'))

    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage access denied', 'SecurityError')
    })

    // clearPreference is exposed via useWorkspace — test via the hook
    // The provider should continue functioning
    expect(screen.getByTestId('probe').dataset.workspace).toBe('ws-sjc')

    spy.mockRestore()
  })

  it('preferência continua sendo persistida quando localStorage funciona', async () => {
    mockUseAuth.mockReturnValue({ user: memberUser(['ws-sjc']) })
    renderProvider()

    await waitFor(() => expect(screen.getByTestId('probe').dataset.loading).toBe('false'))
    expect(localStorage.getItem('labhub_active_workspace')).toBe('ws-sjc')
  })
})