import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockAdminService = vi.hoisted(() => ({
  listAllProfiles: vi.fn(),
  updateUserProfile: vi.fn(),
  setUserMemberships: vi.fn(),
  rejectUser: vi.fn(),
}))

const mockNavigate = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: 'u-123' }) }
})

vi.mock('../../../../core/auth/adminService', () => ({
  adminService: mockAdminService,
}))

vi.mock('../../../../core/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'me',
      name: 'Admin',
      is_super_admin: true,
      status: 'active',
      workspace_ids: [],
    },
  }),
}))

const mockWorkspaceService = vi.hoisted(() => ({ syncFromSupabase: vi.fn() }))
vi.mock('../../../../core/workspaces/service', () => ({
  workspaceService: mockWorkspaceService,
}))

vi.mock('../../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: null }),
}))

vi.mock('../../../../core/permissions/usePermissions', () => ({
  useRoles: () => ({
    roles: [
      { id: 'role-technician', name: 'Técnico', appAccess: { reservalab: 'full' }, isDefault: false },
      { id: 'role-viewer', name: 'Visualizador', appAccess: { reservalab: 'read' }, isDefault: true },
    ],
    loading: false,
  }),
}))

const mockGetByUser = vi.hoisted(() => vi.fn())

// Isola a leitura de memberships (RLS); funções puras seguem reais.
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

function mockMembershipsFromFixtures(users: { id: string; memberships?: unknown[] }[]) {
  mockGetByUser.mockImplementation(async (userId: string) => {
    const u = users.find((x) => x.id === userId)
    return (u?.memberships ?? []) as never[]
  })
}

import { logService } from '../../../../core/logs/service'

vi.mock('../../../../core/logs/service', () => ({
  logService: { getByUser: vi.fn() },
}))

import { UserDetailPage } from '../UserDetailPage'
import type { User } from '../../../../core/auth/types'

const activeUser: User = {
  id: 'u-123',
  email: 'maria@mooca.edu.br',
  name: 'Maria Mooca',
  roleId: 'role-technician',
  status: 'active',
  workspace_ids: [],
  memberships: [
    {
      id: 'm-u-123-ws-mooca',
      profile_id: 'u-123',
      workspace_id: 'ws-mooca',
      role_id: 'r-a',
      status: 'active',
      managed_by: null,
      created_at: '',
      updated_at: '',
    },
  ],
  membershipsLoaded: true,
  accent: 'emerald',
  theme_variant: 'dark',
  created_at: '2024-01-10T00:00:00.000Z',
  updated_at: '2024-01-10T00:00:00.000Z',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <UserDetailPage />
    </MemoryRouter>,
  )
}

describe('UserDetailPage', () => {
  const workspaces = [
    { id: 'ws-mooca', name: 'Campus Mooca', slug: 'mooca', location: 'São Paulo', spreadsheet_url: '', created_at: '', updated_at: '' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockAdminService.listAllProfiles.mockResolvedValue([activeUser])
    mockMembershipsFromFixtures([activeUser])
    mockAdminService.updateUserProfile.mockResolvedValue(true)
    mockAdminService.setUserMemberships.mockResolvedValue([])
    mockWorkspaceService.syncFromSupabase.mockResolvedValue(workspaces)
    vi.mocked(logService.getByUser).mockReturnValue([])
  })

  it('mostra o cabeçalho da pessoa com nome, e-mail, status e cargo', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Maria Mooca')).toBeInTheDocument()
    })
    expect(screen.getByText('maria@mooca.edu.br')).toBeInTheDocument()
    expect(screen.getByText('Ativo')).toBeInTheDocument()
    expect(screen.getByText('Técnico')).toBeInTheDocument()
  })

  it('mostra a seção de acesso por aplicativo', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Acesso por aplicativo')).toBeInTheDocument()
    })
    expect(screen.getByText('ReservaLab')).toBeInTheDocument()
    expect(screen.getByText('Acesso total')).toBeInTheDocument()
  })

  it('mostra estado vazio de atividade quando não há logs', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Atividade')).toBeInTheDocument()
    })
    expect(screen.getByText('Nenhuma atividade registrada.')).toBeInTheDocument()
  })

  it('expande a administração com "Editar" e altera o cargo', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))

    // Cargo editable fica visível
    expect(screen.getByRole('button', { name: 'Visualizador' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Visualizador' }))

    await waitFor(() => {
      expect(mockAdminService.updateUserProfile).toHaveBeenCalledWith('u-123', { roleId: 'role-viewer' })
    })
    expect(screen.getByText('Cargo alterado para Visualizador')).toBeInTheDocument()
  })

  it('mostra aprovação/rejeição para usuário pendente', async () => {
    mockAdminService.listAllProfiles.mockResolvedValue([{ ...activeUser, status: 'pending', roleId: 'role-viewer' }])

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Recusar solicitação' })).toBeInTheDocument()
  })

  it('exibe os workspaces a partir das memberships ativas', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))

    // Contador e chip derivam de memberships, não da coluna legada
    const byFullText = (t: string) => (_c: string, el: Element | null) => el?.textContent === t
    expect(screen.getByText(byFullText('Workspaces (1 de 1)'))).toBeInTheDocument()
    // Nome aparece no scopeLabel e no chip do toggle
    expect(screen.getAllByText('Campus Mooca').length).toBeGreaterThanOrEqual(1)
  })

  it('falha nas memberships mostra carregamento e desabilita os toggles', async () => {
    mockGetByUser.mockRejectedValue(new Error('RLS: denied'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))

    const byFullText = (t: string) => (_c: string, el: Element | null) => el?.textContent === t
    expect(screen.getByText(byFullText('Workspaces (… de 1)'))).toBeInTheDocument()
    expect(screen.getByText('Carregando workspaces…')).toBeInTheDocument()
  })

  it('toggle chama o endpoint atômico e atualiza a exibição', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))

    // Maria tem membership ativa em ws-mooca → toggle remove
    fireEvent.click(screen.getByRole('button', { name: 'Campus Mooca' }))

    await waitFor(() => {
      expect(mockAdminService.setUserMemberships).toHaveBeenCalledWith('u-123', [], 'role-technician')
    })
    expect(screen.getByText('Acesso removido')).toBeInTheDocument()
  })

  it('toggle com falha mostra erro e mantém a exibição', async () => {
    mockAdminService.setUserMemberships.mockResolvedValue(null)

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Campus Mooca' }))

    await waitFor(() => {
      expect(screen.getByText('Erro ao atualizar workspaces')).toBeInTheDocument()
    })
  })
})
