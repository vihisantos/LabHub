import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const mockUpdate = vi.hoisted(() => vi.fn())
const mockUpdateStatus = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())
const mockNavigate = vi.hoisted(() => vi.fn())
const mockGetEvents = vi.hoisted(() => vi.fn())
const mockAddEvent = vi.hoisted(() => vi.fn())
const mockGetAll = vi.hoisted(() => vi.fn())
const mockGetByUserId = vi.hoisted(() => vi.fn())

const TICKET = vi.hoisted(() => ({
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
  assignedToUserId: '',
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
}))

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'ticket-1' }),
  useNavigate: () => mockNavigate,
}))
vi.mock('../../hooks/useTickets', () => ({
  useTickets: () => ({
    tickets: [TICKET],
    update: mockUpdate,
    updateStatus: mockUpdateStatus,
    create: mockCreate,
  }),
}))
vi.mock('../../services/ticketService', () => ({
  ticketService: { getEvents: mockGetEvents, addEvent: mockAddEvent },
}))
vi.mock('../../../../core/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-admin', name: 'Técnico 1' } }),
}))
vi.mock('../../../../core/users/service', () => ({
  userService: { getAll: mockGetAll, getByUserId: mockGetByUserId },
}))
vi.mock('../../../chamados-publico/utils/photo', () => ({
  uploadPhotos: vi.fn(),
  uploadPhoto: vi.fn(),
}))
vi.mock('../../../../lib/supabase', () => ({
  defaultDb: {
    channel: () => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }),
    removeChannel: vi.fn(),
  },
}))

import { uploadPhotos } from '../../../chamados-publico/utils/photo'
import { TicketDetail } from '../TicketDetail'

const PROFILE_ME = {
  id: 'p1',
  userId: 'test-admin',
  displayName: 'Admin Teste',
  department: 'TI',
  roleId: 'r1',
  active: true,
  createdAt: '',
  updatedAt: '',
}

const PROFILE_OTHER = {
  id: 'p2',
  userId: 'user-2',
  displayName: 'Técnico 2',
  department: 'TI',
  roleId: 'r1',
  active: true,
  createdAt: '',
  updatedAt: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  TICKET.assignedTo = ''
  TICKET.assignedToUserId = ''
  mockGetEvents.mockResolvedValue([])
  mockGetAll.mockReturnValue([PROFILE_ME, PROFILE_OTHER])
  mockGetByUserId.mockReturnValue(PROFILE_ME)
})

describe('TicketDetail — Histórico e comentários', () => {
  beforeEach(() => {
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

describe('TicketDetail — atribuição de responsável', () => {
  it('mostra o seletor de responsáveis com os usuários ativos', async () => {
    render(<TicketDetail />)
    await act(async () => {})

    const select = screen.getByRole('combobox')
    expect(select).toBeInTheDocument()
    expect(screen.getByText('Admin Teste')).toBeInTheDocument()
    expect(screen.getByText('Técnico 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pegar para mim' })).toBeInTheDocument()
  })

  it('atribui a mim via "Pegar para mim"', async () => {
    render(<TicketDetail />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Pegar para mim' }))

    expect(mockUpdate).toHaveBeenCalledWith('ticket-1', {
      assignedTo: 'Admin Teste',
      assignedToUserId: 'test-admin',
    })
  })

  it('atribui outro técnico pelo seletor', async () => {
    render(<TicketDetail />)
    await act(async () => {})

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'user-2' } })

    expect(mockUpdate).toHaveBeenCalledWith('ticket-1', {
      assignedTo: 'Técnico 2',
      assignedToUserId: 'user-2',
    })
  })

  it('limpa a atribuição com "Sem responsável"', async () => {
    TICKET.assignedToUserId = 'user-2'
    TICKET.assignedTo = 'Técnico 2'
    render(<TicketDetail />)
    await act(async () => {})

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })

    expect(mockUpdate).toHaveBeenCalledWith('ticket-1', {
      assignedTo: '',
      assignedToUserId: '',
    })
  })
})

describe('TicketDetail — reabrir com novo número', () => {
  beforeEach(() => {
    TICKET.status = 'fechado'
    TICKET.archived = true
    TICKET.closedAt = '2026-06-25T13:00:00Z'
    TICKET.closedBy = 'Técnico 1'
    TICKET.assetId = 'asset-1'
    TICKET.assetSource = 'stock'
    TICKET.assetName = 'PC-02'
    TICKET.assetPatrimony = 'P-001'
    mockCreate.mockResolvedValue({ id: 'ticket-novo', ticketNumber: 7 })
  })

  it('cria um novo chamado com a mesma sala/equipamento/problema e navega', async () => {
    render(<TicketDetail />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Abrir novo chamado (mesma sala/problema)' }))
    await act(async () => {})

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-a',
        roomId: '',
        roomName: 'Sala 101',
        assetId: 'asset-1',
        assetSource: 'stock',
        assetName: 'PC-02',
        assetPatrimony: 'P-001',
        problemCategory: 'Internet',
        problemArea: 'academica',
        problemDescription: 'Sem conexão',
        status: 'aberto',
        reportedBy: 'Prof. Maria',
        assignedTo: '',
      }),
    )
    expect(mockNavigate).toHaveBeenCalledWith('/chamados/tickets/ticket-novo')
  })
})
