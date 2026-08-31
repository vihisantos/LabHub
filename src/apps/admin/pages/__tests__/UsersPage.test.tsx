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

import { UsersPage } from '../UsersPage'
import type { User } from '../../../../core/auth/types'

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
    workspace_ids: ['ws-mooca'],
  }
  const sjcUser: User = {
    ...pendingUser,
    id: 'u-sjc',
    name: 'José São José',
    email: 'jose@sjc.edu.br',
    status: 'active',
    roleId: 'role-technician',
    workspace_ids: ['ws-sjc'],
  }
  const unassignedUser: User = {
    ...pendingUser,
    id: 'u-sem-ws',
    name: 'Paulo Semworkspace',
    email: 'paulo@semws.edu.br',
    status: 'active',
    roleId: 'role-viewer',
    workspace_ids: [],
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
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    currentSearchParams = new URLSearchParams()
    mockWorkspaceCtx.workspace = null
    mockAdminService.listAllProfiles.mockResolvedValue([moocaUser, sjcUser, unassignedUser, superAdminUser])
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
})
