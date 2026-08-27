import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../../core/auth/adminService', () => ({
  adminService: {
    approveUser: vi.fn().mockResolvedValue(true),
    rejectUser: vi.fn().mockResolvedValue(true),
  },
}))

import { NotificationsSheet } from '../NotificationsSheet'
import { notificationService } from '../../../core/notifications/service'

describe('NotificationsSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    notificationService.clearAll()
  })

  it('navega para actionUrl ao clicar em notificação de chamado', () => {
    notificationService.create({
      title: 'Novo chamado #48',
      body: 'Sala 1 · Internet',
      type: 'ticket',
      severity: 'warning',
      module: 'chamados',
      actionUrl: '/chamados/tickets/t-1',
    })

    render(<NotificationsSheet open onClose={vi.fn()} />)

    fireEvent.click(screen.getByText('Novo chamado #48'))

    expect(mockNavigate).toHaveBeenCalledWith('/chamados/tickets/t-1')
  })

  it('mostra botões de aprovação inline para notificações de aprovação', () => {
    notificationService.create({
      title: 'Novo usuário pendente',
      body: 'João aguarda aprovação',
      type: 'approval',
      severity: 'warning',
      module: 'auth',
      actionUrl: '/admin/users?pending=abc',
    })

    render(<NotificationsSheet open onClose={vi.fn()} />)

    expect(screen.getByText('Aprovar')).toBeInTheDocument()
    expect(screen.getByText('Recusar')).toBeInTheDocument()
    expect(screen.getByText('Ver detalhes')).toBeInTheDocument()
  })

  it('não navega ao clicar no título de notificação de aprovação', () => {
    notificationService.create({
      title: 'Novo usuário pendente',
      body: 'João aguarda aprovação',
      type: 'approval',
      severity: 'warning',
      module: 'auth',
      actionUrl: '/admin/users?pending=abc',
    })

    render(<NotificationsSheet open onClose={vi.fn()} />)

    fireEvent.click(screen.getByText('Novo usuário pendente'))

    // Approval notifications don't navigate on click — they show inline buttons
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('não navega quando a notificação não tem actionUrl', () => {
    notificationService.create({
      title: 'Sem ação',
      body: 'Apenas informação',
      type: 'system',
      severity: 'info',
      module: 'admin',
    })

    render(<NotificationsSheet open onClose={vi.fn()} />)

    fireEvent.click(screen.getByText('Sem ação'))

    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
