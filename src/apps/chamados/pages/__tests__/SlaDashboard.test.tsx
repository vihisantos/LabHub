import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/helpers'
import type { Ticket } from '../../types'

const mockUseTicketsCtx = vi.hoisted(() => vi.fn())

vi.mock('../../contexts/TicketsContext', () => ({ useTicketsContext: mockUseTicketsCtx }))

import { SlaDashboard } from '../SlaDashboard'

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
    status: 'resolvido',
    priority: 'normal',
    reportedBy: 'Prof. Maria',
    reportedByEmail: '',
    assignedTo: '',
    createdAt: '2026-06-25T10:00:00Z',
    updatedAt: '2026-06-25T10:00:00Z',
    resolvedAt: '2026-06-25T12:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SlaDashboard', () => {
  it('sem dados quando não há chamados resolvidos', () => {
    mockUseTicketsCtx.mockReturnValue({ tickets: [] })
    renderWithProviders(<SlaDashboard />)

    expect(screen.getByText('Sem dados')).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('mostra taxa de cumprimento de 100% para chamado no prazo', () => {
    mockUseTicketsCtx.mockReturnValue({ tickets: [makeTicket()] })
    renderWithProviders(<SlaDashboard />)

    expect(screen.getByText('1/1 no prazo')).toBeInTheDocument()
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0)
  })

  it('lista chamado resolvido fora do prazo', () => {
    mockUseTicketsCtx.mockReturnValue({
      tickets: [
        makeTicket({
          createdAt: '2026-06-01T10:00:00Z',
          resolvedAt: '2026-06-03T10:00:00Z',
        }),
      ],
    })
    renderWithProviders(<SlaDashboard />)

    expect(screen.getByText('Resolvidos fora do prazo')).toBeInTheDocument()
    expect(screen.getByText(/\+\d+[dh] de atraso/)).toBeInTheDocument()
  })

  it('filtra por período selecionado', () => {
    mockUseTicketsCtx.mockReturnValue({
      tickets: [
        makeTicket({ createdAt: '2026-06-01T10:00:00Z', resolvedAt: '2026-06-01T11:00:00Z' }),
      ],
    })
    renderWithProviders(<SlaDashboard />)

    expect(screen.getByText('1/1 no prazo')).toBeInTheDocument()

    fireEvent.click(screen.getByText('7 dias'))
    expect(screen.getByText('Sem dados')).toBeInTheDocument()
  })
})
