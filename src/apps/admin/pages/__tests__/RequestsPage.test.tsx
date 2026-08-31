import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockAdminService = vi.hoisted(() => ({
  listPendingProfiles: vi.fn(),
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
}))

const mockNavigate = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
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

vi.mock('../../../../core/workspaces/service', () => ({
  workspaceService: mockWorkspaceService,
}))

const mockWorkspaceService = vi.hoisted(() => ({
  syncFromSupabase: vi.fn(),
}))

vi.mock('../../../../core/permissions/usePermissions', () => ({
  useRoles: () => ({
    roles: [
      { id: 'role-technician', name: 'Técnico', appAccess: {}, isDefault: false },
      { id: 'role-viewer', name: 'Visualizador', appAccess: {}, isDefault: true },
    ],
    loading: false,
  }),
}))

import { RequestsPage } from '../RequestsPage'
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
      <RequestsPage />
    </MemoryRouter>,
  )
}

describe('RequestsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockAdminService.listPendingProfiles.mockResolvedValue([pendingUser])
    mockAdminService.approveUser.mockResolvedValue(true)
    mockAdminService.rejectUser.mockResolvedValue(true)
    mockWorkspaceService.syncFromSupabase.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useFakeTimers()
  })

  it('mostra a quantidade real de solicitações pendentes', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('1 aguardando revisão')).toBeInTheDocument()
    })
    expect(screen.getByText('João Silva')).toBeInTheDocument()
    expect(screen.getByText('joao@escola.edu.br')).toBeInTheDocument()
  })

  it('exibe estado vazio quando não há solicitações (não inventa número)', async () => {
    mockAdminService.listPendingProfiles.mockResolvedValue([])

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Tudo em dia')).toBeInTheDocument()
    })
    expect(screen.getByText(/Nenhuma solicitação de acesso aguardando revisão/)).toBeInTheDocument()
  })

  it('exibe estado de erro quando o serviço falha', async () => {
    mockAdminService.listPendingProfiles.mockRejectedValue(new Error('boom'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar as solicitações/)).toBeInTheDocument()
    })
  })

  it('revisar abre o modal de aprovação com campus obrigatório', async () => {
    const workspaces = [
      { id: 'ws-mooca', name: 'Campus Mooca', slug: 'mooca', location: '', spreadsheet_url: '', created_at: '', updated_at: '' },
    ]
    mockWorkspaceService.syncFromSupabase.mockResolvedValue(workspaces)

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Revisar' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    expect(screen.getByText('Aprovar cadastro')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Campus Mooca' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar e conceder acesso' }))

    await waitFor(() => {
      expect(mockAdminService.approveUser).toHaveBeenCalledWith('u-123', {
        roleId: 'role-viewer',
        app_access: {},
        workspace_ids: ['ws-mooca'],
      })
    })
  })

  it('recusa uma solicitação', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Recusar' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Recusar' }))

    await waitFor(() => {
      expect(mockAdminService.rejectUser).toHaveBeenCalledWith('u-123')
    })
    expect(screen.queryByText('João Silva')).not.toBeInTheDocument()
  })
})
