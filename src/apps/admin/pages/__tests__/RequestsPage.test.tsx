import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockAdminService = vi.hoisted(() => ({
  listPendingProfiles: vi.fn(),
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
}))

const mockNavigate = vi.hoisted(() => vi.fn())

// Auth mutável: permite simular admin global e coordenador (não-admin).
const mockAuthUser = vi.hoisted(() => ({
  current: {
    id: 'me',
    name: 'Admin',
    is_super_admin: true,
    status: 'active',
    workspace_ids: [],
  } as Record<string, unknown>,
}))

vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../../core/auth/adminService', () => ({
  adminService: mockAdminService,
}))

vi.mock('../../../../core/auth/AuthContext', () => ({
  useAuth: () => ({ user: mockAuthUser.current }),
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
  created_at: '2026-09-20T10:00:00.000Z',
  updated_at: '2026-09-20T10:00:00.000Z',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RequestsPage />
    </MemoryRouter>,
  )
}

describe('RequestsPage — fila GLOBAL de contas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockAuthUser.current = {
      id: 'me',
      name: 'Admin',
      is_super_admin: true,
      status: 'active',
      workspace_ids: [],
    }
    mockAdminService.listPendingProfiles.mockResolvedValue([pendingUser])
    mockAdminService.approveUser.mockResolvedValue(true)
    mockAdminService.rejectUser.mockResolvedValue(true)
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
    expect(screen.getByText(/Nenhuma conta pendente de aprovação/)).toBeInTheDocument()
  })

  it('exibe estado de erro quando o serviço falha', async () => {
    mockAdminService.listPendingProfiles.mockRejectedValue(new Error('boom'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar as solicitações/)).toBeInTheDocument()
    })
  })

  it('lista TODAS as contas pendentes sem separar por campus/unidade', async () => {
    const ana: User = { ...pendingUser, id: 'u-ana', name: 'Ana Outra', email: 'ana@outra.edu.br' }
    const bia: User = { ...pendingUser, id: 'u-bia', name: 'Bia Terceira', email: 'bia@terceira.edu.br' }
    mockAdminService.listPendingProfiles.mockResolvedValue([pendingUser, ana, bia])

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('3 aguardando revisão')).toBeInTheDocument()
    })
    expect(screen.getByText('João Silva')).toBeInTheDocument()
    expect(screen.getByText('Ana Outra')).toBeInTheDocument()
    expect(screen.getByText('Bia Terceira')).toBeInTheDocument()
    // Sem campus, sem filtro por unidade: a fila é uma lista única de contas
    expect(screen.queryByText(/campus/i)).not.toBeInTheDocument()
  })

  it('mostra a data de cadastro como informação contextual', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Cadastrado em 20\/09\/2026/)).toBeInTheDocument()
    })
  })

  it('aprova direto pelo botão (sem campus, sem cargo): approveUser recebe só o id', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))

    await waitFor(() => {
      expect(mockAdminService.approveUser).toHaveBeenCalledWith('u-123')
    })
    expect(mockAdminService.approveUser).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Conta aprovada — acesso ainda não configurado')).toBeInTheDocument()
    expect(screen.queryByText('João Silva')).not.toBeInTheDocument()
  })

  it('recusa uma solicitação', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Rejeitar' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Rejeitar' }))

    await waitFor(() => {
      expect(mockAdminService.rejectUser).toHaveBeenCalledWith('u-123')
    })
    expect(screen.getByText('Conta rejeitada e removida')).toBeInTheDocument()
    expect(screen.queryByText('João Silva')).not.toBeInTheDocument()
  })

  it('coordenador (não-admin) NÃO acessa a fila administrativa global', async () => {
    mockAuthUser.current = {
      id: 'coord-1',
      name: 'Coordenador',
      is_super_admin: false,
      status: 'active',
      workspace_ids: ['ws-mooca'],
    }

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Apenas administradores podem revisar solicitações.')).toBeInTheDocument()
    })
    expect(mockAdminService.listPendingProfiles).not.toHaveBeenCalled()
    expect(screen.queryByText('João Silva')).not.toBeInTheDocument()
  })
})
