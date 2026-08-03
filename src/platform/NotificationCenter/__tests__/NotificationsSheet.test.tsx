import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

import { NotificationsSheet } from '../NotificationsSheet'
import { notificationService } from '../../../core/notifications/service'

describe('NotificationsSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    notificationService.clearAll()
  })

  it('navega para actionUrl ao clicar em uma notificação com link de ação', () => {
    notificationService.create({
      title: 'Novo usuário pendente',
      body: 'João aguarda aprovação',
      type: 'approval',
      severity: 'warning',
      module: 'admin',
      actionUrl: '/admin/users?pending=abc',
    })

    render(<NotificationsSheet open onClose={vi.fn()} />)

    fireEvent.click(screen.getByText('Novo usuário pendente'))

    expect(mockNavigate).toHaveBeenCalledWith('/admin/users?pending=abc')
  })

  it('marca a notificação como lida ao clicar', () => {
    const created = notificationService.create({
      title: 'Novo usuário pendente',
      body: 'João aguarda aprovação',
      type: 'approval',
      severity: 'warning',
      module: 'admin',
      actionUrl: '/admin/users?pending=abc',
    })

    render(<NotificationsSheet open onClose={vi.fn()} />)

    fireEvent.click(screen.getByText('Novo usuário pendente'))

    expect(notificationService.getById(created.id)?.read).toBe(true)
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
