import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockAdminService = vi.hoisted(() => ({
  listAllProfiles: vi.fn(),
  updateUserProfile: vi.fn(),
}))

vi.mock('../../../../core/auth/adminService', () => ({
  adminService: mockAdminService,
}))

vi.mock('../../../../core/permissions/usePermissions', () => ({
  useRoles: () => ({
    loading: false,
    roles: [
      { id: 'role-technician', key: 'technician', name: 'Técnico', appAccess: { chamados: 'full' }, isDefault: false },
    ],
  }),
}))

const mockWorkspaceCtx = vi.hoisted(() => ({
  workspace: null as { id: string; name: string } | null,
  workspaces: [] as { id: string; name: string }[],
}))

vi.mock('../../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({
    workspace: mockWorkspaceCtx.workspace,
    workspaces: mockWorkspaceCtx.workspaces,
  }),
}))

const mockGetByUser = vi.hoisted(() => vi.fn())

vi.mock('../../../../core/memberships/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../core/memberships/service')>()
  return {
    ...actual,
    attachMemberships: async (users: any[]) =>
      Promise.all(
        users.map(async (u) => {
          try {
            const rows = await mockGetByUser(u.id)
            return { ...u, memberships: rows, membershipsLoaded: true }
          } catch {
            return { ...u, membershipsLoaded: false }
          }
        }),
      ),
  }
})

import { NotificationRulesTab } from '../NotificationRulesTab'

function membershipRows(userId: string, wsIds: string[]) {
  return wsIds.map((ws) => ({
    id: `m-${userId}-${ws}`,
    profile_id: userId,
    workspace_id: ws,
    role_id: 'r-a',
    status: 'active',
    managed_by: null,
    created_at: '',
    updated_at: '',
  }))
}

const userA = {
  id: 'u-a', name: 'Ana', email: 'a@x.com', roleId: 'role-technician',
  status: 'active', is_super_admin: false, workspace_ids: [],
  memberships: membershipRows('u-a', ['ws-a']), membershipsLoaded: true,
  accent: 'blue', theme_variant: 'dark', created_at: '', updated_at: '',
}
const userB = {
  id: 'u-b', name: 'Beto', email: 'b@x.com', roleId: 'role-technician',
  status: 'active', is_super_admin: false, workspace_ids: [],
  memberships: membershipRows('u-b', ['ws-b']), membershipsLoaded: true,
  accent: 'blue', theme_variant: 'dark', created_at: '', updated_at: '',
}

const WORKSPACES = [
  { id: 'ws-a', name: 'Campus A' },
  { id: 'ws-b', name: 'Campus B' },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  mockWorkspaceCtx.workspace = null
  mockWorkspaceCtx.workspaces = WORKSPACES
  mockAdminService.listAllProfiles.mockResolvedValue([userA, userB])
  mockGetByUser.mockImplementation(async (userId: string) => {
    const u = [userA, userB].find((x) => x.id === userId)
    return (u?.memberships ?? []) as never[]
  })
})

afterEach(() => {
  vi.useFakeTimers()
})

async function openChamados() {
  fireEvent.click(screen.getByText('Chamados'))
  await waitFor(() => {
    expect(screen.getByText(/com acesso/)).toBeInTheDocument()
  })
}

describe('NotificationRulesTab — escopo por memberships', () => {
  it('filtra usuários pelo workspace via memberships', async () => {
    render(<NotificationRulesTab />)
    await openChamados()

    // Sem filtro: ambos
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Beto')).toBeInTheDocument()

    // Filtra ws-a: só Ana
    const selects = document.querySelectorAll('select')
    fireEvent.change(selects[0], { target: { value: 'ws-a' } })
    await waitFor(() => {
      expect(screen.queryByText('Beto')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })

  it('escopo segue memberships, não workspace_ids', async () => {
    // Ana tem ws-b na coluna legada, mas membership ativa em ws-a.
    mockGetByUser.mockImplementation(async (userId: string) => {
      if (userId === 'u-a') return membershipRows(userId, ['ws-a'])
      return membershipRows(userId, ['ws-b'])
    })

    render(<NotificationRulesTab />)
    await openChamados()

    const selects = document.querySelectorAll('select')
    fireEvent.change(selects[0], { target: { value: 'ws-a' } })
    await waitFor(() => {
      expect(screen.getByText('Ana')).toBeInTheDocument()
    })
    expect(screen.queryByText('Beto')).not.toBeInTheDocument()
  })
})
