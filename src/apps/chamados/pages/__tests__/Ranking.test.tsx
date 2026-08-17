import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, act } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/helpers'

vi.mock('../../services/ticketService', () => ({
  ticketService: { getReports: vi.fn() },
}))

vi.mock('../../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: { id: 'ws-a', name: 'Campus A' } }),
}))

import { ticketService } from '../../services/ticketService'
import { Ranking } from '../Ranking'

function renderRanking() {
  return renderWithProviders(<Ranking />)
}

function makeReport() {
  return {
    total: 5,
    period: { from: '', to: '' },
    byStatus: { aberto: 3, fechado: 2 },
    byPriority: {},
    byCategory: {},
    byArea: {},
    byRoom: [
      ['Lab 2', 3],
      ['Sala 101', 2],
    ],
    byTechnician: [],
    avgResolutionHours: 1.5,
    feedback: { count: 1, average: 5 },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(ticketService.getReports as any).mockResolvedValue(makeReport())
})

describe('Ranking', () => {
  it('carrega e mostra o ranking de salas com o período padrão (30 dias)', async () => {
    renderRanking()
    await act(async () => {})

    expect(ticketService.getReports).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: 'ws-a', from: expect.any(String) }),
    )
    expect(screen.getByText('Lab 2')).toBeInTheDocument()
    expect(screen.getByText('Sala 101')).toBeInTheDocument()
    expect(screen.getByText(/Salas com chamados no período/)).toBeInTheDocument()
  })

  it('muda o período ao trocar o filtro', async () => {
    renderRanking()
    await act(async () => {})

    screen.getByRole('button', { name: '7 dias' }).click()
    await act(async () => {})

    const lastCall = (ticketService.getReports as any).mock.calls.at(-1)
    expect(lastCall[0]).toEqual(expect.objectContaining({ workspace_id: 'ws-a' }))
  })

  it('mostra estado vazio sem chamados', async () => {
    ;(ticketService.getReports as any).mockResolvedValue({
      total: 0,
      period: { from: '', to: '' },
      byStatus: {},
      byPriority: {},
      byCategory: {},
      byArea: {},
      byRoom: [],
      byTechnician: [],
      avgResolutionHours: null,
      feedback: { count: 0, average: null },
    })

    renderRanking()
    await act(async () => {})

    expect(screen.getByText('Nenhum chamado no período')).toBeInTheDocument()
  })
})
