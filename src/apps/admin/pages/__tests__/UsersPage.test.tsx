import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockAdminService = vi.hoisted(() => ({
  listAllProfiles: vi.fn(),
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
  updateUserProfile: vi.fn(),
  updateUserWorkspaces: vi.fn(),
}))

let currentSearchParams = new URLSearchParams()
const mockSetSearchParams = vi.hoisted(() =>
  vi.fn((next: URLSearchParams | Record<string, string>) => {
    currentSearchParams = next instanceof URLSearchParams ? next : new URLSearchParams()
  }),
)

vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
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
      role: 'admin',
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

vi.mock('../../../../core/workspaces/service', () => ({
  workspaceService: {
    syncFromSupabase: vi.fn(() => Promise.resolve([])),
  },
}))

vi.mock('../../../../core/permissions/usePermissions', () => ({
  useRoles: () => ({
    loading: false,
    roles: [
      { key: 'admin', label: 'Administrador', color: 'purple' },
      { key: 'technician', label: 'Técnico', color: 'blue', appAccess: { reservalab: 'full' } },
      { key: 'viewer', label: 'Visualizador', color: 'slate', appAccess: { reservalab: 'read' } },
    ],
  }),
  useAppAccess: () => ({ getLevel: () => 'full' }),
}))

import { UsersPage } from '../UsersPage'
import type { User } from '../../../../core/auth/types'

const pendingUser: User = {
  id: 'u-123',
  email: 'joao@escola.edu.br',
  name: 'João Silva',
  role: 'viewer',
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

describe('UsersPage deep link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    currentSearchParams = new URLSearchParams()
    mockAdminService.listAllProfiles.mockResolvedValue([pendingUser])
    mockAdminService.approveUser.mockResolvedValue(true)
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

  it('confirma a aprovação com o cargo e o app_access selecionados', async () => {
    currentSearchParams.set('pending', 'u-123')

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Aprovar cadastro')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Técnico' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar e conceder acesso' }))

    await waitFor(() => {
      expect(mockAdminService.approveUser).toHaveBeenCalledWith('u-123', {
        role: 'technician',
        app_access: {},
      })
    })
  })
})
