import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockAdminService = vi.hoisted(() => ({
  listAllProfiles: vi.fn(),
  updateUserProfile: vi.fn(),
  updateUserWorkspaces: vi.fn(),
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
  workspace_ids: ['ws-mooca'],
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
    mockAdminService.updateUserProfile.mockResolvedValue(true)
    mockAdminService.updateUserWorkspaces.mockResolvedValue(true)
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
})
