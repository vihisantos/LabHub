import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UnitOverview } from '../UnitOverview'
import type { CoordinatorUnitOverview } from '../../../../core/permissions/coordinatorService'
import type { SlaWorkspaceSummary } from '../../../../apps/chamados/services/sla'

const overview: CoordinatorUnitOverview = {
  workspace: { id: 'ws1', name: 'Campus A' },
  tickets: { open: 2, in_progress: 3, unassigned: 4, high_priority: 2, urgent: 1 },
  recent: [
    {
      id: 'tk-1',
      ticketNumber: 7,
      roomName: 'Sala 101',
      problemCategory: 'Imprensa',
      status: 'em_atendimento',
      priority: 'alta',
      assignedToUserId: '',
      createdAt: '2026-01-11T00:00:00Z',
      updatedAt: '2026-01-11T00:00:00Z',
    },
  ],
}

function renderOverview(over: Partial<{ overview: CoordinatorUnitOverview | null; loading: boolean; failed: boolean; onRetry: () => void; sla: SlaWorkspaceSummary | null; onOpenChamados: ((query?: string) => void) | null; onOpenTicket: ((ticketId: string) => void) | null }> = {}) {
  const onRetry = over.onRetry ?? vi.fn()
  const onOpenChamados = over.onOpenChamados === undefined ? null : over.onOpenChamados
  const onOpenTicket = over.onOpenTicket === undefined ? null : over.onOpenTicket
  render(
    <UnitOverview
      overview={over.overview === undefined ? overview : over.overview}
      loading={over.loading ?? false}
      failed={over.failed ?? false}
      onRetry={onRetry}
      sla={over.sla === undefined ? null : over.sla}
      onOpenChamados={onOpenChamados}
      onOpenTicket={onOpenTicket}
    />,
  )
  return { onRetry, onOpenChamados, onOpenTicket }
}

describe('UnitOverview — visão da unidade (RPC 070)', () => {
  it('mostra os cinco totais, o resumo e os recentes do RPC', () => {
    renderOverview()
    expect(screen.getByText('Visão da unidade')).toBeTruthy()
    expect(screen.getByTestId('unit-stat-open')).toHaveTextContent('Abertos2')
    expect(screen.getByTestId('unit-stat-in_progress')).toHaveTextContent('Em andamento3')
    expect(screen.getByTestId('unit-stat-unassigned')).toHaveTextContent('Sem responsável4')
    expect(screen.getByTestId('unit-stat-high_priority')).toHaveTextContent('Alta prioridade2')
    expect(screen.getByTestId('unit-stat-urgent')).toHaveTextContent('Urgentes1')
    expect(screen.getByText('Sala 101 — Imprensa')).toBeTruthy()
    expect(screen.getByText(/#7/)).toBeTruthy()
    expect(screen.getByText(/5 no total/)).toBeTruthy()
  })

  it('unidade vazia → zeros honestos, sem recentes e sem erro', () => {
    renderOverview({
      overview: {
        workspace: { id: 'ws1', name: 'Campus A' },
        tickets: { open: 0, in_progress: 0, unassigned: 0, high_priority: 0, urgent: 0 },
        recent: [],
      },
    })
    expect(screen.getByTestId('unit-stat-open')).toHaveTextContent('Abertos0')
    expect(screen.queryByText(/Sala 101/)).toBeNull()
    expect(screen.queryByText(/Não foi possível/)).toBeNull()
    expect(screen.getByText(/0 no total/)).toBeTruthy()
  })

  it('carregando → estado honesto sem inventar números', () => {
    renderOverview({ loading: true })
    expect(screen.getByText(/Carregando chamados da unidade/)).toBeTruthy()
    expect(screen.queryByTestId('unit-stat-open')).toBeNull()
  })

  it('falha (ex.: negado pelo RPC) → erro + retry chamado pelo usuário', () => {
    const { onRetry } = renderOverview({ failed: true })
    expect(screen.getByText(/Não foi possível carregar a visão desta unidade/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('Abrir chamados dispara o callback de navegação do app existente', () => {
    const onOpenChamados = vi.fn()
    renderOverview({ onOpenChamados })
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chamados' }))
    expect(onOpenChamados).toHaveBeenCalledTimes(1)
    expect(onOpenChamados).toHaveBeenCalledWith()
  })

  it('sem callback de navegação (unidade fora do contexto) → sem botão Abrir chamados', () => {
    renderOverview({ onOpenChamados: null })
    expect(screen.queryByRole('button', { name: 'Abrir chamados' })).toBeNull()
  })

  it('Fase 2.1 — cada card navega com o query param que inicializa o filtro existente', () => {
    const onOpenChamados = vi.fn()
    renderOverview({ onOpenChamados })

    fireEvent.click(screen.getByTestId('unit-stat-open'))
    expect(onOpenChamados).toHaveBeenLastCalledWith('?status=aberto')

    fireEvent.click(screen.getByTestId('unit-stat-in_progress'))
    expect(onOpenChamados).toHaveBeenLastCalledWith('?status=em_andamento')

    fireEvent.click(screen.getByTestId('unit-stat-unassigned'))
    expect(onOpenChamados).toHaveBeenLastCalledWith('?unassigned=1')

    fireEvent.click(screen.getByTestId('unit-stat-high_priority'))
    expect(onOpenChamados).toHaveBeenLastCalledWith('?priority=alta')

    fireEvent.click(screen.getByTestId('unit-stat-urgent'))
    expect(onOpenChamados).toHaveBeenLastCalledWith('?priority=urgente')
  })

  it('Fase 2.1 — chamado recente abre o detail existente (/chamados/tickets/:id)', () => {
    const onOpenTicket = vi.fn()
    renderOverview({ onOpenTicket })

    fireEvent.click(screen.getByTestId('unit-recent-tk-1'))
    expect(onOpenTicket).toHaveBeenCalledTimes(1)
    expect(onOpenTicket).toHaveBeenCalledWith('tk-1')
  })

  it('Fase 2.1 — sem callbacks, cards e recentes não são clicáveis (não são botões)', () => {
    renderOverview({ onOpenChamados: null, onOpenTicket: null })

    expect((screen.getByTestId('unit-stat-open') as HTMLElement).tagName).toBe('DIV')
    expect(screen.queryByTestId('unit-recent-tk-1')).toBeNull()
  })

  it('Fase 2.2.1 — SLA da unidade renderiza com os valores do resumo', () => {
    renderOverview({ sla: { total: 4, within: 2, near: 1, overdue: 1, rate: 50 } })
    expect(screen.getByTestId('coordinator-sla-overview')).toBeTruthy()
    expect(screen.getByTestId('sla-stat-within')).toHaveTextContent('Dentro do SLA2')
    expect(screen.getByTestId('sla-stat-near')).toHaveTextContent('Próximos do vencimento1')
    expect(screen.getByTestId('sla-stat-overdue')).toHaveTextContent('Vencidos1')
    expect(screen.getByTestId('sla-stat-rate')).toHaveTextContent('Taxa de SLA50%')
  })

  it('Fase 2.2.1 — unidade sem SLA/tickets → zeros e taxa "—"', () => {
    renderOverview({ sla: null })
    expect(screen.getByTestId('sla-stat-within')).toHaveTextContent('Dentro do SLA0')
    expect(screen.getByTestId('sla-stat-rate')).toHaveTextContent('Taxa de SLA—')
  })

  it('Fase 2.2.1 — "Dentro do SLA" usa a navegação contextual da unidade', () => {
    const onOpenChamados = vi.fn()
    renderOverview({ sla: { total: 2, within: 2, near: 0, overdue: 0, rate: 100 }, onOpenChamados })
    fireEvent.click(screen.getByTestId('sla-stat-within'))
    expect(onOpenChamados).toHaveBeenCalledTimes(1)
  })

  it('Fase 2.2.1 — sem callback de navegação, o SLA não é clicável', () => {
    renderOverview({ sla: { total: 2, within: 2, near: 0, overdue: 0, rate: 100 }, onOpenChamados: null })
    expect((screen.getByTestId('sla-stat-within') as HTMLElement).tagName).toBe('DIV')
  })
})