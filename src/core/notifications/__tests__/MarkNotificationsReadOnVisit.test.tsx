import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockService = vi.hoisted(() => ({
  getAll: vi.fn(),
  markAsRead: vi.fn(),
}))

vi.mock('../service', () => ({
  notificationService: mockService,
}))

import { MarkNotificationsReadOnVisit } from '../MarkNotificationsReadOnVisit'

function renderAt(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <MarkNotificationsReadOnVisit />
    </MemoryRouter>,
  )
}

describe('MarkNotificationsReadOnVisit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockService.getAll.mockReturnValue([])
  })

  it('marca como lida a notificação cuja actionUrl é a página visitada', () => {
    mockService.getAll.mockReturnValue([
      { id: 'n1', actionUrl: '/admin/users?pending=abc', read: false },
      { id: 'n2', actionUrl: '/chamados/tickets/t1', read: false },
      { id: 'n3', actionUrl: '/admin/users?pending=xyz', read: true },
    ])

    renderAt(['/admin/users?pending=abc'])

    expect(mockService.markAsRead).toHaveBeenCalledTimes(1)
    expect(mockService.markAsRead).toHaveBeenCalledWith('n1')
  })

  it('não marca notificações de outras páginas nem já lidas', () => {
    mockService.getAll.mockReturnValue([
      { id: 'n1', actionUrl: '/admin/users?pending=abc', read: false },
      { id: 'n2', actionUrl: '/admin/users?pending=xyz', read: true },
    ])

    renderAt(['/chamados'])

    expect(mockService.markAsRead).not.toHaveBeenCalled()
  })

  it('ignora notificações sem actionUrl', () => {
    mockService.getAll.mockReturnValue([
      { id: 'n1', actionUrl: undefined, read: false },
    ])

    renderAt(['/admin/users'])

    expect(mockService.markAsRead).not.toHaveBeenCalled()
  })
})
