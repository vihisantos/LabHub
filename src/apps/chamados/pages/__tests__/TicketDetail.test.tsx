import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const mockUpdate = vi.hoisted(() => vi.fn())
const mockUpdateStatus = vi.hoisted(() => vi.fn())
const mockGetEvents = vi.hoisted(() => vi.fn())
const mockAddEvent = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'ticket-1' }),
  useNavigate: () => vi.fn(),
}))
vi.mock('../../hooks/useTickets', () => ({
  useTickets: () => ({
    tickets: [
      {
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
      },
    ],
    update: mockUpdate,
    updateStatus: mockUpdateStatus,
  }),
}))
vi.mock('../../services/ticketService', () => ({
  ticketService: { getEvents: mockGetEvents, addEvent: mockAddEvent },
}))
vi.mock('../../../../core/auth/useAuth', () => ({
  useAuth: () => ({ user: { name: 'Técnico 1' } }),
}))
vi.mock('../../../chamados-publico/utils/photo', () => ({
  uploadPhotos: vi.fn(),
  uploadPhoto: vi.fn(),
}))

import { uploadPhotos } from '../../../chamados-publico/utils/photo'
import { TicketDetail } from '../TicketDetail'

describe('TicketDetail — Histórico e comentários', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetEvents.mockResolvedValue([
      {
        id: 'ev-1',
        ticket_id: 'ticket-1',
        type: 'comentario',
        content: 'Testei a sala, cabo solto',
        author: 'Técnico 1',
        photos: [],
        createdAt: '2026-06-25T12:10:00Z',
      },
    ])
    mockAddEvent.mockImplementation(async (id: string, data: { content: string; author: string; photos?: string[] }) => ({
      id: 'ev-2',
      ticket_id: id,
      type: 'comentario',
      content: data.content,
      author: data.author,
      photos: data.photos || [],
      createdAt: '2026-06-25T12:20:00Z',
    }))
  })

  it('carrega e exibe o histórico de eventos', async () => {
    render(<TicketDetail />)
    await act(async () => {})

    expect(mockGetEvents).toHaveBeenCalledWith('ticket-1')
    expect(screen.getByText('Testei a sala, cabo solto')).toBeInTheDocument()
    expect(screen.getByText('Técnico 1')).toBeInTheDocument()
  })

  it('adiciona um comentário com autor e conteúdo', async () => {
    render(<TicketDetail />)
    await act(async () => {})

    fireEvent.change(screen.getByPlaceholderText('Comentário interno sobre o atendimento...'), {
      target: { value: 'Peça solicitada' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Comentar' }))
    await act(async () => {})

    expect(mockAddEvent).toHaveBeenCalledWith('ticket-1', {
      content: 'Peça solicitada',
      author: 'Técnico 1',
      photos: [],
    })
    expect(screen.getByText('Peça solicitada')).toBeInTheDocument()
  })

  it('anexa até 2 fotos no comentário', async () => {
    ;(uploadPhotos as any).mockResolvedValue([
      'https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/a.jpg',
      'https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/b.jpg',
    ])
    render(<TicketDetail />)
    await act(async () => {})

    const fileInput = screen.getByLabelText(/Anexar foto/)
    await act(async () => {
      fireEvent.change(fileInput, {
        target: { files: [new File(['x'], 'a.jpg'), new File(['x'], 'b.jpg')] },
      })
    })
    await act(async () => {})

    expect(screen.getByText('Fotos: 2/2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Comentar' }))
    await act(async () => {})

    expect(mockAddEvent).toHaveBeenCalledWith(
      'ticket-1',
      expect.objectContaining({ photos: expect.arrayContaining([expect.stringContaining('res.cloudinary.com')]) }),
    )
  })
})
