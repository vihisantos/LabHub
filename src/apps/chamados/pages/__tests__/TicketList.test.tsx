import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const TICKETS = vi.hoisted(() => [
  {
    id: 't1',
    ticketNumber: 1,
    workspace_id: 'ws-a',
    roomId: '',
    roomName: 'Sala 101',
    assetName: '',
    problemCategory: 'Internet',
    problemArea: 'academica',
    problemDescription: 'Sem conexão',
    status: 'aberto',
    priority: 'normal',
    reportedBy: 'Prof. Maria',
    reportedByEmail: '',
    assignedTo: 'Admin Teste',
    assignedToUserId: 'test-admin',
    feedbackRating: null,
    feedbackComment: '',
    feedbackAt: null,
    archived: false,
    closedAt: null,
    closedBy: '',
    statusNote: '',
    createdAt: '2026-06-20T12:00:00Z',
    updatedAt: '2026-06-20T12:00:00Z',
    resolvedAt: null,
  },
  {
    id: 't2',
    ticketNumber: 2,
    workspace_id: 'ws-a',
    roomId: '',
    roomName: 'Lab 2',
    assetName: '',
    problemCategory: 'Projetor',
    problemArea: 'academica',
    problemDescription: 'Projetor sem imagem',
    status: 'aberto',
    priority: 'normal',
    reportedBy: 'Prof. Ana',
    reportedByEmail: '',
    assignedTo: 'Técnico 2',
    assignedToUserId: 'user-2',
    feedbackRating: null,
    feedbackComment: '',
    feedbackAt: null,
    archived: false,
    closedAt: null,
    closedBy: '',
    statusNote: '',
    createdAt: '2026-06-21T12:00:00Z',
    updatedAt: '2026-06-21T12:00:00Z',
    resolvedAt: null,
  },
  {
    id: 't3',
    ticketNumber: 3,
    workspace_id: 'ws-a',
    roomId: '',
    roomName: 'Sala 202',
    assetName: '',
    problemCategory: 'Áudio',
    problemArea: 'academica',
    problemDescription: 'Sem som',
    status: 'fechado',
    priority: 'normal',
    reportedBy: 'Prof. Bia',
    reportedByEmail: '',
    assignedTo: 'Admin Teste',
    assignedToUserId: 'test-admin',
    feedbackRating: null,
    feedbackComment: '',
    feedbackAt: null,
    archived: true,
    closedAt: '2026-06-22T12:00:00Z',
    closedBy: 'Admin Teste',
    statusNote: '',
    createdAt: '2026-06-19T12:00:00Z',
    updatedAt: '2026-06-22T12:00:00Z',
    resolvedAt: null,
  },
])

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))
vi.mock('../../hooks/useTickets', () => ({
  useTickets: () => ({ tickets: TICKETS }),
}))
vi.mock('../../../../core/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-admin', name: 'Admin Teste' } }),
}))

import { TicketList } from '../TicketList'

describe('TicketList — fila do técnico', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mostra apenas os chamados abertos atribuídos a mim em "Minha fila"', async () => {
    render(<TicketList />)
    await act(async () => {})

    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(screen.queryByText('#3')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Minha fila' }))

    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.queryByText('#2')).not.toBeInTheDocument()
    expect(screen.queryByText('#3')).not.toBeInTheDocument()
  })
})
