import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/helpers'
import type { Ticket } from '../../types'

const mockUseTickets = vi.hoisted(() => vi.fn())

vi.mock('../../hooks/useTickets', () => ({ useTickets: mockUseTickets }))
vi.mock('../../components/PushStatusCard', () => ({ PushStatusCard: () => null }))

import { Dashboard } from '../Dashboard'

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 't-1',
    ticketNumber: 1,
    workspace_id: 'ws-a',
    roomId: 'room-1',
    roomName: 'Sala 101',
    assetName: '',
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

function cardByLabel(label: string): HTMLElement {
  const el = screen
    .getAllByText(label)
    .find((e) => e.closest('div.rounded-xl')?.querySelector('.text-2xl'))
  if (!el) throw new Error(`Card de status "${label}" não encontrado`)
  return el.closest('div.rounded-xl') as HTMLElement
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Dashboard', () => {
  it('estado vazio: nenhum chamado, sem atrasos', () => {
    mockUseTickets.mockReturnValue({ tickets: [] })
    renderWithProviders(<Dashboard />)

    expect(screen.getByText('Sem atrasos')).toBeInTheDocument()
    expect(screen.getByText('Nenhum chamado ainda')).toBeInTheDocument()
    expect(screen.queryByText('Satisfação dos professores')).not.toBeInTheDocument()
    expect(screen.queryByText('Tempo médio de resolução')).not.toBeInTheDocument()
    expect(screen.queryByText('Chamados em atraso')).not.toBeInTheDocument()
    expect(screen.queryByText('Chamados abertos por sala')).not.toBeInTheDocument()
  })

  it('conta os chamados por status', () => {
    mockUseTickets.mockReturnValue({
      tickets: [
        makeTicket(),
        makeTicket({ id: 't-2', status: 'aberto' }),
        makeTicket({ id: 't-3', status: 'em_atendimento' }),
        makeTicket({ id: 't-4', status: 'resolvido' }),
        makeTicket({ id: 't-5', status: 'a_caminho' }),
      ],
    })
    renderWithProviders(<Dashboard />)

    expect(within(cardByLabel('Aberto')).getByText('2')).toBeInTheDocument()
    expect(within(cardByLabel('Em atendimento')).getByText('1')).toBeInTheDocument()
    expect(within(cardByLabel('Resolvido')).getByText('1')).toBeInTheDocument()
    expect(within(cardByLabel('A caminho')).getByText('1')).toBeInTheDocument()
    expect(within(cardByLabel('Arquivados')).getByText('0')).toBeInTheDocument()
  })

  it('mostra satisfação, tempo médio e abertos por sala', () => {
    mockUseTickets.mockReturnValue({
      tickets: [
        makeTicket({
          id: 't-1',
          roomName: 'Lab 2',
          assetName: 'PC-01',
          feedbackRating: 5,
        }),
        makeTicket({
          id: 't-2',
          roomName: 'Lab 2',
          status: 'em_atendimento',
          feedbackRating: 4,
        }),
        makeTicket({
          id: 't-4',
          status: 'resolvido',
          createdAt: '2026-06-25T10:00:00Z',
          resolvedAt: '2026-06-25T12:00:00Z',
        }),
      ],
    })
    renderWithProviders(<Dashboard />)

    expect(screen.getByText('Satisfação dos professores')).toBeInTheDocument()
    expect(screen.getByText('4.5')).toBeInTheDocument()
    expect(screen.getByText('2 avaliações recebidas')).toBeInTheDocument()

    expect(screen.getByText('Tempo médio de resolução')).toBeInTheDocument()
    expect(screen.getByText('2h')).toBeInTheDocument()

    expect(screen.getByText('Chamados abertos por sala')).toBeInTheDocument()
    expect(screen.getByText('Lab 2')).toBeInTheDocument()
  })

  it('lista chamado em atraso com a duração', () => {
    mockUseTickets.mockReturnValue({
      tickets: [
        makeTicket({
          id: 't-1',
          ticketNumber: 7,
          assetName: 'Projetor',
          createdAt: '2026-06-10T10:00:00Z',
          priority: 'normal',
        }),
      ],
    })
    renderWithProviders(<Dashboard />)

    expect(screen.getByText('Chamados em atraso')).toBeInTheDocument()
    expect(screen.getByText(/^Atrasado há \d+d/)).toBeInTheDocument()
    expect(screen.getAllByText('#7').length).toBeGreaterThan(0)
  })

  it('mostra os últimos chamados', () => {
    mockUseTickets.mockReturnValue({
      tickets: [makeTicket({ id: 't-1', assetName: 'PC-01', problemCategory: 'Internet' })],
    })
    renderWithProviders(<Dashboard />)

    expect(screen.getByText('PC-01')).toBeInTheDocument()
    expect(screen.getByText('Ver todos')).toBeInTheDocument()
  })
})
