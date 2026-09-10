import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockAdminService = vi.hoisted(() => ({
  listAllProfiles: vi.fn(),
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
}))

let currentSearchParams = new URLSearchParams()
const mockSetSearchParams = vi.hoisted(() =>
  vi.fn((next: URLSearchParams | Record<string, string>) => {
    currentSearchParams = next instanceof URLSearchParams ? next : new URLSearchParams()
  }),
)

const mockNavigate = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [currentSearchParams, mockSetSearchParams],
  }
})

vi.mock('../../../../core/auth/adminService', () => ({
  adminService: mockAdminService,
}))

vi.mock('../../../../core/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'me',
      name: 'Admin',
      email: 'admin@labhub.com',
      roleId: 'role-technician',
      is_super_admin: true,
      status: 'active',
      workspace_ids: [],
      accent: 'emerald',
      theme_variant: 'dark',
      created_at: '',
      updated_at: '',
    },
  }),
}))

const mockWorkspaceService = vi.hoisted(() => ({
  syncFromSupabase: vi.fn(),
}))

vi.mock('../../../../core/workspaces/service', () => ({
  workspaceService: mockWorkspaceService,
}))

const mockWorkspaceCtx = vi.hoisted(() => ({
  workspace: null as { id: string; name: string } | null,
}))

vi.mock('../../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: mockWorkspaceCtx.workspace }),
}))

vi.mock('../../../../core/permissions/usePermissions', () => ({
  useRoles: () => ({
    loading: false,
    roles: [
      { id: 'role-technician', key: 'technician', name: 'Técnico', appAccess: { reservalab: 'full' }, isDefault: false },
      { id: 'role-viewer', key: 'viewer', name: 'Visualizador', appAccess: { reservalab: 'read' }, isDefault: true },
    ],
  }),
}))

const mockGetByUser = vi.hoisted(() => vi.fn())

// Isola a leitura de memberships (RLS). Nos fixtures, memberships derivam de
// workspace_ids (espelha o trigger 041); o código de produção nunca faz isso.
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

function membershipRows(userId: string, wsIds: string[]): Membership[] {
  return wsIds.map((ws) => ({
    id: `m-${userId}-${ws}`,
    profile_id: userId,
    workspace_id: ws,
    role_id: 'r-a',
    status: 'active',
    managed_by: null,
    created_at: '',
    updated_at: '',
  })) as Membership[]
}

// Fixtures carregam memberships diretas (9.3-B); workspace_ids fica só pelo
// tipo User (coluna sai na 9.3-F) e nunca decide.
function mockMembershipsFromFixtures(users: { id: string; memberships?: unknown[] }[]) {
  mockGetByUser.mockImplementation(async (userId: string) => {
    const u = users.find((x) => x.id === userId)
    return (u?.memberships ?? []) as never[]
  })
}

import { UsersPage } from '../UsersPage'
import type { User } from '../../../../core/auth/types'
import type { Membership } from '../../../../core/memberships/types'

const pendingUser: User = {
  id: 'u-123',
  email: 'joao@escola.edu.br',
  name: 'João Silva',
  roleId: 'role-viewer',
  status: 'pending',
  workspace_ids: [],
  accent: 'emerald',
  theme_variant: 'dark',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

function renderPage() {
  return render(
    <MemoryRouter>
      <UsersPage />
    </MemoryRouter>,
  )
}

describe('UsersPage deep link (aprovação)', () => {
  const workspaces = [
    { id: 'ws-mooca', name: 'Campus Mooca', slug: 'mooca', location: 'São Paulo', spreadsheet_url: '', created_at: '', updated_at: '' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    currentSearchParams = new URLSearchParams()
    mockAdminService.listAllProfiles.mockResolvedValue([pendingUser])
    mockMembershipsFromFixtures([pendingUser])
    mockAdminService.approveUser.mockResolvedValue(true)
    mockWorkspaceService.syncFromSupabase.mockResolvedValue(workspaces)
  })

  afterEach(() => {
    vi.useFakeTimers()
  })

  it('abre o modal de aprovação quando ?pending=<id> corresponde a um usuário pendente', async () => {
    currentSearchParams.set('pending', 'u-123')

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Aprovar cadastro')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Aprovar e conceder acesso' })).toBeInTheDocument()
    expect(mockSetSearchParams).toHaveBeenCalledWith({}, { replace: true })
  })

  it('não abre o modal quando ?pending=<id> não corresponde a um pendente', async () => {
    currentSearchParams.set('pending', 'nao-existe')

    renderPage()

    await waitFor(() => {
      expect(mockAdminService.listAllProfiles).toHaveBeenCalled()
    })
    expect(screen.queryByText('Aprovar cadastro')).not.toBeInTheDocument()
  })

  it('confirma a aprovação com cargo, app_access e campus obrigatório', async () => {
    currentSearchParams.set('pending', 'u-123')

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Aprovar cadastro')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Aprovar e conceder acesso' })).toBeDisabled()
    expect(screen.getByText('Selecione ao menos um campus para aprovar.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Técnico' }))
    fireEvent.click(screen.getByRole('button', { name: 'Campus Mooca' }))
    expect(screen.getByRole('button', { name: 'Aprovar e conceder acesso' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Aprovar e conceder acesso' }))

    await waitFor(() => {
      expect(mockAdminService.approveUser).toHaveBeenCalledWith('u-123', {
        roleId: 'role-technician',
        app_access: {},
        workspace_ids: ['ws-mooca'],
      })
    })
  })
})

describe('UsersPage listagem (Pessoas)', () => {
  const workspaces = [
    { id: 'ws-mooca', name: 'Campus Mooca', slug: 'mooca', location: 'São Paulo', spreadsheet_url: '', created_at: '', updated_at: '' },
    { id: 'ws-sjc', name: 'Campus São José', slug: 'sjc', location: 'São José dos Campos', spreadsheet_url: '', created_at: '', updated_at: '' },
  ]

  const moocaUser: User = {
    ...pendingUser,
    id: 'u-mooca',
    name: 'Maria Mooca',
    email: 'maria@mooca.edu.br',
    status: 'active',
    roleId: 'role-technician',
    workspace_ids: [],
    memberships: membershipRows('u-mooca', ['ws-mooca']),
    membershipsLoaded: true,
  }
  const sjcUser: User = {
    ...pendingUser,
    id: 'u-sjc',
    name: 'José São José',
    email: 'jose@sjc.edu.br',
    status: 'active',
    roleId: 'role-technician',
    workspace_ids: [],
    memberships: membershipRows('u-sjc', ['ws-sjc']),
    membershipsLoaded: true,
  }
  const unassignedUser: User = {
    ...pendingUser,
    id: 'u-sem-ws',
    name: 'Paulo Semworkspace',
    email: 'paulo@semws.edu.br',
    status: 'active',
    roleId: 'role-viewer',
    workspace_ids: [],
    memberships: [],
    membershipsLoaded: true,
  }
  const superAdminUser: User = {
    ...pendingUser,
    id: 'u-abs',
    name: 'Ana Absoluta',
    email: 'ana@labhub.com',
    status: 'active',
    roleId: 'role-technician',
    is_super_admin: true,
    workspace_ids: [],
    memberships: [],
    membershipsLoaded: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    currentSearchParams = new URLSearchParams()
    mockWorkspaceCtx.workspace = null
    mockAdminService.listAllProfiles.mockResolvedValue([moocaUser, sjcUser, unassignedUser, superAdminUser])
    mockMembershipsFromFixtures([moocaUser, sjcUser, unassignedUser, superAdminUser])
    mockAdminService.approveUser.mockResolvedValue(true)
    mockAdminService.rejectUser.mockResolvedValue(true)
    mockWorkspaceService.syncFromSupabase.mockResolvedValue(workspaces)
  })

  afterEach(() => {
    vi.useFakeTimers()
  })

  it('mostra apenas os usuários do workspace atual (admin absoluto sempre visível)', async () => {
    mockWorkspaceCtx.workspace = workspaces[0] // Campus Mooca

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Maria Mooca')).toBeInTheDocument()
    })
    expect(screen.getByText('Ana Absoluta')).toBeInTheDocument()
    expect(screen.getByText('Paulo Semworkspace')).toBeInTheDocument()
    expect(screen.queryByText('José São José')).not.toBeInTheDocument()
    expect(screen.getByText('3 pessoas em Campus Mooca')).toBeInTheDocument()
  })

  it('sem workspace selecionado mostra todos os usuários', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Maria Mooca')).toBeInTheDocument()
    })
    expect(screen.getByText('José São José')).toBeInTheDocument()
    expect(screen.getByText('Paulo Semworkspace')).toBeInTheDocument()
    expect(screen.getByText('Ana Absoluta')).toBeInTheDocument()
    expect(screen.getByText('4 pessoas no sistema')).toBeInTheDocument()
  })

  it('ao trocar de workspace, a lista acompanha', async () => {
    mockWorkspaceCtx.workspace = workspaces[1] // Campus São José

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('José São José')).toBeInTheDocument()
    })
    expect(screen.queryByText('Maria Mooca')).not.toBeInTheDocument()
    expect(screen.getByText('Ana Absoluta')).toBeInTheDocument()
    expect(screen.getByText('Paulo Semworkspace')).toBeInTheDocument()
    expect(screen.getByText('3 pessoas em Campus São José')).toBeInTheDocument()
  })

  it('toque em uma pessoa navega para o detalhe', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Maria Mooca')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Maria Mooca'))
    expect(mockNavigate).toHaveBeenCalledWith('/admin/users/u-mooca')
  })

  it('filtra por busca', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Maria Mooca')).toBeInTheDocument()
    })
    fireEvent.change(screen.getByPlaceholderText('Buscar por nome ou e-mail...'), { target: { value: 'José' } })
    expect(screen.queryByText('Maria Mooca')).not.toBeInTheDocument()
    expect(screen.getByText('José São José')).toBeInTheDocument()
  })

  it('mostra o banner de solicitações e navega para a inbox quando há pendentes', async () => {
    mockAdminService.listAllProfiles.mockResolvedValue([moocaUser, pendingUser])

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Solicitações de acesso')).toBeInTheDocument()
    })
    expect(screen.getByText('1 aguardando revisão')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Solicitações de acesso'))
    expect(mockNavigate).toHaveBeenCalledWith('/admin/requests')
  })

  it('escopo segue memberships, não workspace_ids (autoridade)', async () => {
    // Maria tem ws-mooca na coluna legada, mas membership ativa em ws-sjc.
    mockGetByUser.mockImplementation(async (userId: string) => {
      if (userId === 'u-mooca') return membershipRows(userId, ['ws-sjc'])
      const u = [sjcUser, unassignedUser, superAdminUser].find((x) => x.id === userId)
      const ws = ((u?.memberships ?? []) as { workspace_id: string }[]).map((m) => m.workspace_id)
      return membershipRows(userId, ws)
    })
    mockWorkspaceCtx.workspace = workspaces[0] // Campus Mooca

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Paulo Semworkspace')).toBeInTheDocument()
    })
    // Maria some da Mooca (membership manda) e José continua fora
    expect(screen.queryByText('Maria Mooca')).not.toBeInTheDocument()
    expect(screen.queryByText('José São José')).not.toBeInTheDocument()
    expect(screen.getByText('Ana Absoluta')).toBeInTheDocument()
  })

  it('falha nas memberships mantém a linha visível com estado de carregamento', async () => {
    mockGetByUser.mockRejectedValue(new Error('RLS: denied'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Maria Mooca')).toBeInTheDocument()
    })
    // Nenhuma decisão por workspace_ids: linha mostra "acessos…" em vez de sumir
    expect(screen.getAllByText('acessos…').length).toBeGreaterThan(0)
  })
})
