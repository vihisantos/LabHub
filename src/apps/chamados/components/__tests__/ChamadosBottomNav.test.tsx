import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/helpers'
import type { Ticket } from '../../types'

const mockUseTickets = vi.hoisted(() => vi.fn())

vi.mock('../../hooks/useTickets', () => ({ useTickets: mockUseTickets }))

import { ChamadosBottomNav } from '../ChamadosBottomNav'

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

beforeEach(() => {
  vi.clearAllMocks()
  mockUseTickets.mockReturnValue({ tickets: [] })
})

describe('ChamadosBottomNav', () => {
  it('renderiza os itens principais e o menu "Mais"', () => {
    renderWithProviders(<ChamadosBottomNav />, { initialEntries: ['/chamados'] })

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Chamados')).toBeInTheDocument()
    expect(screen.queryByText('Salas')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Mais opções')).toBeInTheDocument()
  })

  it('mostra o contador de chamados abertos no item Chamados', () => {
    mockUseTickets.mockReturnValue({
      tickets: [
        makeTicket(),
        makeTicket({ id: 't-2', status: 'em_atendimento' }),
        makeTicket({ id: 't-3', status: 'a_caminho' }),
        makeTicket({ id: 't-4', status: 'resolvido' }),
      ],
    })

    renderWithProviders(<ChamadosBottomNav />, { initialEntries: ['/chamados/tickets'] })

    const chamadosBtn = screen.getByText('Chamados').closest('button')
    expect(chamadosBtn).not.toBeNull()
    expect(within(chamadosBtn as HTMLElement).getByText('3')).toBeInTheDocument()
  })

  it('sem chamados abertos não mostra badge', () => {
    mockUseTickets.mockReturnValue({ tickets: [makeTicket({ status: 'resolvido' })] })

    renderWithProviders(<ChamadosBottomNav />, { initialEntries: ['/chamados/tickets'] })

    const chamadosBtn = screen.getByText('Chamados').closest('button')
    expect(within(chamadosBtn as HTMLElement).queryByText('3')).not.toBeInTheDocument()
  })

  it('destaca somente a aba ativa em rota filha (pai não fica selecionado)', () => {
    renderWithProviders(<ChamadosBottomNav />, { initialEntries: ['/chamados/tickets'] })

    const dashboardBtn = screen.getByText('Dashboard').closest('button')
    const chamadosBtn = screen.getByText('Chamados').closest('button')

    expect(dashboardBtn).not.toBeNull()
    expect(chamadosBtn).not.toBeNull()
    expect(dashboardBtn!.classList.contains('text-indigo-500')).toBe(false)
    expect(chamadosBtn!.classList.contains('text-indigo-500')).toBe(true)
  })

  it('abre o menu "Mais" e navega para Relatórios', () => {
    renderWithProviders(<ChamadosBottomNav />, { initialEntries: ['/chamados'] })

    fireEvent.click(screen.getByLabelText('Mais opções'))
    expect(screen.getByText('Relatórios')).toBeInTheDocument()
    expect(screen.getByText('QR Code')).toBeInTheDocument()
    expect(screen.getByText('Config')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Relatórios'))
    expect(screen.queryByText('QR Code')).not.toBeInTheDocument()
    expect(screen.getAllByText('Relatórios')).toHaveLength(1)
  })
})
