import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const mockGetByToken = vi.hoisted(() => vi.fn())
const mockGetEvents = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))
vi.mock('../../../chamados/services/publicTicketService', () => ({
  publicTicketService: {
    getByToken: mockGetByToken,
    getEvents: mockGetEvents,
  },
  toTicket: (p: unknown) => p,
}))

import { TrackPage } from '../TrackPage'

const PUBLIC_TICKET = {
  id: 'ticket-1',
  ticketNumber: 6,
  roomName: 'Sala 101',
  problemCategory: 'Internet',
  problemArea: 'academica',
  problemDescription: 'Sem conexão',
  status: 'em_atendimento',
  reportedBy: 'Prof. Maria',
  feedbackRating: null,
  photos: '',
  createdAt: '2026-06-25T12:00:00Z',
  updatedAt: '2026-06-25T12:00:00Z',
  closedAt: null,
}

describe('TrackPage — acompanhamento anônimo via tracking token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetByToken.mockResolvedValue(PUBLIC_TICKET)
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
  })

  it('busca o chamado pelo código de acompanhamento (token)', async () => {
    render(<TrackPage />)

    fireEvent.change(screen.getByPlaceholderText('Código de acompanhamento'), {
      target: { value: 'abc123token' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await act(async () => {})

    expect(mockGetByToken).toHaveBeenCalledWith('abc123token')
    expect(screen.getByText('#6')).toBeInTheDocument()
    expect(screen.getByText('Em atendimento')).toBeInTheDocument()
  })

  it('mostra o histórico do chamado via endpoint público', async () => {
    render(<TrackPage />)

    fireEvent.change(screen.getByPlaceholderText('Código de acompanhamento'), {
      target: { value: 'abc123token' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Ver histórico' }))
    await act(async () => {})

    expect(mockGetEvents).toHaveBeenCalledWith('abc123token')
    expect(screen.getByText('Técnico a caminho')).toBeInTheDocument()
  })

  it('exibe erro quando o token é inválido', async () => {
    mockGetByToken.mockRejectedValue(new Error('Chamado não encontrado'))
    render(<TrackPage />)

    fireEvent.change(screen.getByPlaceholderText('Código de acompanhamento'), {
      target: { value: 'invalido' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await act(async () => {})

    expect(screen.getByText('Chamado não encontrado')).toBeInTheDocument()
  })
})
