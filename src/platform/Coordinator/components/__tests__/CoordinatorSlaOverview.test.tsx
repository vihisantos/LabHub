import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CoordinatorSlaOverview } from '../CoordinatorSlaOverview'
import type { SlaWorkspaceSummary } from '../../../../apps/chamados/services/sla'

const sla: SlaWorkspaceSummary = { total: 4, within: 2, near: 1, overdue: 1, rate: 50 }

describe('CoordinatorSlaOverview — SLA da unidade (Fase 2.2.1)', () => {
  it('renderiza os quatro KPIs com os valores do resumo', () => {
    render(<CoordinatorSlaOverview sla={sla} onOpenChamados={null} />)
    expect(screen.getByTestId('coordinator-sla-overview')).toBeTruthy()
    expect(screen.getByTestId('sla-stat-within')).toHaveTextContent('Dentro do SLA2')
    expect(screen.getByTestId('sla-stat-near')).toHaveTextContent('Próximos do vencimento1')
    expect(screen.getByTestId('sla-stat-overdue')).toHaveTextContent('Vencidos1')
    expect(screen.getByTestId('sla-stat-rate')).toHaveTextContent('Taxa de SLA50%')
  })

  it('unidade sem SLA/tickets → zeros e taxa "—" (nunca 100% inventado)', () => {
    render(<CoordinatorSlaOverview sla={null} onOpenChamados={null} />)
    expect(screen.getByTestId('sla-stat-within')).toHaveTextContent('Dentro do SLA0')
    expect(screen.getByTestId('sla-stat-overdue')).toHaveTextContent('Vencidos0')
    expect(screen.getByTestId('sla-stat-rate')).toHaveTextContent('Taxa de SLA—')
  })

  it('"Dentro do SLA" navega ao app de chamados da unidade (mecanismo da Fase 2.1)', () => {
    const onOpenChamados = vi.fn()
    render(<CoordinatorSlaOverview sla={sla} onOpenChamados={onOpenChamados} />)
    fireEvent.click(screen.getByTestId('sla-stat-within'))
    expect(onOpenChamados).toHaveBeenCalledTimes(1)
  })

  it('Vencidos/Próximos não são clicáveis (filtro de SLA não existe no Chamados — gap)', () => {
    const onOpenChamados = vi.fn()
    render(<CoordinatorSlaOverview sla={sla} onOpenChamados={onOpenChamados} />)
    expect((screen.getByTestId('sla-stat-overdue') as HTMLElement).tagName).toBe('DIV')
    expect((screen.getByTestId('sla-stat-near') as HTMLElement).tagName).toBe('DIV')
    expect((screen.getByTestId('sla-stat-rate') as HTMLElement).tagName).toBe('DIV')
  })

  it('sem callback de navegação → nenhum KPI clicável', () => {
    render(<CoordinatorSlaOverview sla={sla} onOpenChamados={null} />)
    expect((screen.getByTestId('sla-stat-within') as HTMLElement).tagName).toBe('DIV')
  })
})