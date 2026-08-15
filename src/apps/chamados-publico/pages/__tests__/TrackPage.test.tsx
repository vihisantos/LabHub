import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const mockGetByReporter = vi.hoisted(() => vi.fn())
const mockGetEvents = vi.hoisted(() => vi.fn())
const mockAddEvent = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))
vi.mock('../../../chamados/services/ticketService', () => ({
  ticketService: {
    getByReporter: mockGetByReporter,
    getEvents: mockGetEvents,
    addEvent: mockAddEvent,
  },
}))

import { TrackPage } from '../TrackPage'

const TICKET = {
  id: 'ticket-1',
  ticketNumber: 6,
  workspace_id: 'ws-a',
  roomId: '',
  roomName: 'Sala 101',
  assetName: '',
  problemCategory: 'Internet',
  problemArea: 'academica',
  problemDescription: 'Sem conexão',
  status: 'em_atendimento',
  reportedBy: 'Prof. Maria',
  reportedByEmail: '',
  assignedTo: '',
  feedbackRating: null,
  feedbackComment: '',
  feedbackAt: null,
  archived: false,
  closedAt: null,
  closedBy: '',
  statusNote: '',
  createdAt: '2026-06-25T12:00:00Z',
  updatedAt: '2026-06-25T12:00:00Z',
  resolvedAt: null,
}

describe('TrackPage — histórico e comentário do solicitante', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetByReporter.mockResolvedValue([TICKET])
    mockGetEvents.mockResolvedValue([
      {
        id: 'ev-1',
        ticket_id: 'ticket-1',
        type: 'status',
        content: 'Técnico a caminho',
        author: 'Sistema',
        photos: [],
        createdAt: '2026-06-25T12:05:00Z',
      },
    ])
    mockAddEvent.mockImplementation(
      async (id: string, data: { content: string; author: string }) => ({
        id: 'ev-2',
        ticket_id: id,
        type: 'comentario',
        content: data.content,
        author: data.author,
        photos: [],
        createdAt: '2026-06-25T12:30:00Z',
      }),
    )
  })

  it('busca chamados pelo nome e mostra o histórico', async () => {
    render(<TrackPage />)

    fireEvent.change(screen.getByPlaceholderText('Seu nome'), { target: { value: 'Maria' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await act(async () => {})

    expect(screen.getByText('#6')).toBeInTheDocument()
    expect(screen.getByText('Em atendimento')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver histórico' }))
    await act(async () => {})

    expect(mockGetEvents).toHaveBeenCalledWith('ticket-1')
    expect(screen.getByText('Técnico a caminho')).toBeInTheDocument()
  })

  it('permite o solicitante comentar no próprio chamado', async () => {
    render(<TrackPage />)

    fireEvent.change(screen.getByPlaceholderText('Seu nome'), { target: { value: 'Maria' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Ver histórico' }))
    await act(async () => {})

    fireEvent.change(screen.getByPlaceholderText('Escrever um comentário...'), {
      target: { value: 'Continuo sem internet' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Comentar' }))
    await act(async () => {})

    expect(mockAddEvent).toHaveBeenCalledWith('ticket-1', {
      content: 'Continuo sem internet',
      author: 'Prof. Maria',
    })
    expect(screen.getByText('Continuo sem internet')).toBeInTheDocument()
  })
})
