import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const { mockChannelOn, mockChannelSubscribe, mockRemoveChannel } = vi.hoisted(() => ({
  mockChannelOn: vi.fn().mockReturnThis(),
  mockChannelSubscribe: vi.fn().mockReturnThis(),
  mockRemoveChannel: vi.fn(),
}))

const { mockChannel } = vi.hoisted(() => ({
  mockChannel: vi.fn(() => ({ on: mockChannelOn, subscribe: mockChannelSubscribe })),
}))

vi.mock('../../../../lib/supabase', () => ({
  defaultDb: { channel: mockChannel, removeChannel: mockRemoveChannel },
}))

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
    update: vi.fn(),
    updateStatus: vi.fn(),
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

import { TicketDetail } from '../TicketDetail'

function realtimeCallback(): (payload: any) => void {
  const call = mockChannelOn.mock.calls.find((c) => c[0] === 'postgres_changes')
  if (!call) throw new Error('Canal realtime não registrado')
  return call[2]
}

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
})

describe('TicketDetail — Realtime (comentário de outro técnico aparece na timeline)', () => {
  it('INSERT: novo comentário de outro técnico aparece sem recarregar a página', async () => {
    render(<TicketDetail />)
    await act(async () => {})

    act(() => {
      realtimeCallback()({
        schema: 'public',
        table: 'ticket_events',
        commit_timestamp: '2026-06-25T12:30:00Z',
        eventType: 'INSERT',
        new: {
          id: 'ev-99',
          ticket_id: 'ticket-1',
          type: 'comentario',
          content: 'Cheguei na sala, vou trocar o cabo',
          author: 'Técnico 2',
          photo_urls: '[]',
          createdAt: '2026-06-25T12:30:00Z',
        },
        old: {},
        errors: [],
      })
    })

    expect(screen.getByText('Cheguei na sala, vou trocar o cabo')).toBeInTheDocument()
    expect(screen.getByText('Técnico 2')).toBeInTheDocument()
    // O comentário carregado no mount continua lá
    expect(screen.getByText('Testei a sala, cabo solto')).toBeInTheDocument()
  })

  it('INSERT com foto: o comentário chega com as fotos parseadas', async () => {
    render(<TicketDetail />)
    await act(async () => {})

    act(() => {
      realtimeCallback()({
        schema: 'public',
        table: 'ticket_events',
        commit_timestamp: '2026-06-25T12:35:00Z',
        eventType: 'INSERT',
        new: {
          id: 'ev-100',
          ticket_id: 'ticket-1',
          type: 'comentario',
          content: 'Foto do cabo queimado',
          author: 'Técnico 1',
          photo_urls:
            '["https://res.cloudinary.com/horytsxg/image/upload/v1/chamados/cabo.jpg"]',
          createdAt: '2026-06-25T12:35:00Z',
        },
        old: {},
        errors: [],
      })
    })

    expect(screen.getByText('Foto do cabo queimado')).toBeInTheDocument()
  })

  it('ignora eventos de outros chamados', async () => {
    render(<TicketDetail />)
    await act(async () => {})

    act(() => {
      realtimeCallback()({
        schema: 'public',
        table: 'ticket_events',
        commit_timestamp: '2026-06-25T12:40:00Z',
        eventType: 'INSERT',
        new: {
          id: 'ev-101',
          ticket_id: 'ticket-outro',
          type: 'comentario',
          content: 'Comentário de outro chamado',
          author: 'Técnico 3',
          photo_urls: '[]',
          createdAt: '2026-06-25T12:40:00Z',
        },
        old: {},
        errors: [],
      })
    })

    expect(screen.queryByText('Comentário de outro chamado')).not.toBeInTheDocument()
  })
})
