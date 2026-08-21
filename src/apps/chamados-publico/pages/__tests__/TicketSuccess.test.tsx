import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, act } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '../../../../test/helpers'
import type { Ticket } from '../../../chamados/types'

const mockGetById = vi.hoisted(() => vi.fn())
const mockGetByIdRemote = vi.hoisted(() => vi.fn())
const mockSubmitFeedback = vi.hoisted(() => vi.fn())

vi.mock('../../../chamados/services/ticketService', () => ({
  ticketService: {
    getById: mockGetById,
    getByIdRemote: mockGetByIdRemote,
    submitFeedback: mockSubmitFeedback,
    getAll: vi.fn().mockReturnValue([]),
    getEvents: vi.fn().mockResolvedValue([]),
    addEvent: vi.fn(),
  },
}))

vi.mock('../../../../lib/useRealtimeSubscription', () => ({
  useRealtimeSubscription: () => {},
}))

import { TicketSuccess } from '../TicketSuccess'

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 't-1',
    ticketNumber: 1,
    workspace_id: 'ws-a',
    roomId: 'room-1',
    roomName: 'Sala 101',
    assetName: 'PC-01',
    problemCategory: 'Internet',
    problemArea: 'academica',
    problemDescription: 'Sem conexão',
    status: 'aberto',
    priority: 'normal',
    reportedBy: 'Prof. Maria',
    reportedByEmail: '',
    assignedTo: '',
    createdAt: '2026-06-25T10:00:00Z',
    updatedAt: '2026-06-25T10:00:00Z',
    resolvedAt: null,
    ...overrides,
  }
}

function renderSuccess() {
  return renderWithProviders(
    <Routes>
      <Route path="/chamados-publico" element={<div>inicio</div>} />
      <Route path="/chamados-publico/track" element={<div>acompanhar</div>} />
      <Route path="/chamados-publico/ticket/:ticketId" element={<TicketSuccess />} />
    </Routes>,
    { initialEntries: ['/chamados-publico/ticket/t-1'] },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn().mockResolvedValue('default'),
  })
  mockGetByIdRemote.mockResolvedValue(makeTicket())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TicketSuccess', () => {
  it('chamado não encontrado mostra erro', async () => {
    mockGetById.mockReturnValue(null)
    mockGetByIdRemote.mockRejectedValue(new Error('não encontrado'))
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Chamado não encontrado')).toBeInTheDocument()
  })

  it('mostra os dados do chamado aberto', async () => {
    mockGetById.mockReturnValue(makeTicket())
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Chamado Aberto!')).toBeInTheDocument()
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('Sala 101')).toBeInTheDocument()
    expect(screen.getByText('PC-01')).toBeInTheDocument()
    expect(screen.getByText('Aberto')).toBeInTheDocument()
    expect(screen.getByText('Atualiza automaticamente')).toBeInTheDocument()
    expect(screen.getByText('Acompanhar e avaliar depois')).toBeInTheDocument()
  })

  it('atualiza o status ao vivo pelo polling', async () => {
    mockGetById.mockReturnValue(makeTicket())
    mockGetByIdRemote.mockResolvedValue(
      makeTicket({ status: 'em_atendimento', statusNote: 'Técnico a caminho' }),
    )
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Em atendimento')).toBeInTheDocument()
    expect(screen.getByText('Técnico a caminho')).toBeInTheDocument()
  })

  it('indica ausência de conexão quando o polling falha', async () => {
    mockGetById.mockReturnValue(makeTicket())
    mockGetByIdRemote.mockRejectedValue(new Error('offline'))
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Sem conexão — tenta de novo automaticamente')).toBeInTheDocument()
  })

  it('mostra conclusão para chamado resolvido', async () => {
    mockGetById.mockReturnValue(
      makeTicket({ status: 'resolvido', resolvedAt: '2026-06-25T12:00:00Z' }),
    )
    mockGetByIdRemote.mockResolvedValue(makeTicket({ status: 'resolvido', resolvedAt: '2026-06-25T12:00:00Z' }))
    renderSuccess()
    await act(async () => {})

    expect(screen.getByText('Seu chamado foi concluído. Obrigado!')).toBeInTheDocument()
  })
})
