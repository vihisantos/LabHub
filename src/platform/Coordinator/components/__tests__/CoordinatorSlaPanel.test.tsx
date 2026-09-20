import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CoordinatorSlaPanel } from '../CoordinatorSlaPanel'

function renderPanel(over: Partial<{
  within: number
  near: number
  overdue: number
  rateLabel: string
  onOpenChamados: (query?: string) => void
}> = {}) {
  const onOpenChamados = over.onOpenChamados === undefined ? undefined : over.onOpenChamados
  render(
    <CoordinatorSlaPanel
      within={over.within ?? 0}
      near={over.near ?? 0}
      overdue={over.overdue ?? 0}
      rateLabel={over.rateLabel ?? '—'}
      onOpenChamados={onOpenChamados}
    />,
  )
  return { onOpenChamados }
}

describe('CoordinatorSlaPanel — painel global de SLA (C3, PR B)', () => {
  it('mostra os quatro indicadores com os testids e valores das props', () => {
    renderPanel({ within: 8, near: 2, overdue: 1, rateLabel: '73%' })

    expect(screen.getByTestId('overview-sla-within')).toHaveTextContent('Dentro do SLA')
    expect(screen.getByTestId('overview-sla-within')).toHaveTextContent('8')
    expect(screen.getByTestId('overview-sla-near')).toHaveTextContent('Próximos do vencimento')
    expect(screen.getByTestId('overview-sla-near')).toHaveTextContent('2')
    expect(screen.getByTestId('overview-sla-overdue')).toHaveTextContent('Vencidos')
    expect(screen.getByTestId('overview-sla-overdue')).toHaveTextContent('1')
    expect(screen.getByTestId('overview-sla-rate')).toHaveTextContent('Taxa de SLA')
    expect(screen.getByTestId('overview-sla-rate')).toHaveTextContent('73%')
  })

  it('rateLabel "—" é preservado (ausência de taxa nunca vira 0%)', () => {
    renderPanel({ within: 0, near: 0, overdue: 0, rateLabel: '—' })

    expect(screen.getByTestId('overview-sla-rate')).toHaveTextContent('Taxa de SLA')
    expect(screen.getByTestId('overview-sla-rate')).toHaveTextContent('—')
    expect(screen.getByTestId('overview-sla-rate')).not.toHaveTextContent('0%')
  })

  it('zero legítimo aparece como zero quando recebido', () => {
    renderPanel({ within: 0, near: 3, overdue: 0, rateLabel: '100%' })

    expect(screen.getByTestId('overview-sla-within')).toHaveTextContent('0')
    expect(screen.getByTestId('overview-sla-overdue')).toHaveTextContent('0')
  })

  it('com callback, os cards navegam exatamente como o shell espera', () => {
    const onOpenChamados = vi.fn()
    renderPanel({ onOpenChamados })

    fireEvent.click(screen.getByTestId('overview-sla-within'))
    expect(onOpenChamados).toHaveBeenLastCalledWith()

    fireEvent.click(screen.getByTestId('overview-sla-near'))
    expect(onOpenChamados).toHaveBeenLastCalledWith('?sla=near')

    fireEvent.click(screen.getByTestId('overview-sla-overdue'))
    expect(onOpenChamados).toHaveBeenLastCalledWith('?sla=overdue')
  })

  it('com callback, a Taxa continua sendo bloco de leitura (sem navegação inventada)', () => {
    const onOpenChamados = vi.fn()
    renderPanel({ onOpenChamados })

    expect((screen.getByTestId('overview-sla-rate') as HTMLElement).tagName).toBe('DIV')
    expect(within(screen.getByTestId('overview-sla')).getAllByRole('button')).toHaveLength(3)
  })

  it('sem callback, todos os cards são estáticos (fail-safe)', () => {
    renderPanel()

    expect((screen.getByTestId('overview-sla-within') as HTMLElement).tagName).toBe('DIV')
    expect((screen.getByTestId('overview-sla-near') as HTMLElement).tagName).toBe('DIV')
    expect((screen.getByTestId('overview-sla-overdue') as HTMLElement).tagName).toBe('DIV')
    expect(within(screen.getByTestId('overview-sla')).queryByRole('button')).toBeNull()
  })

  it('preserva os testids existentes da visão geral', () => {
    renderPanel()

    expect(screen.getByTestId('overview-sla')).toBeInTheDocument()
    expect(screen.getByTestId('overview-sla-within')).toBeInTheDocument()
    expect(screen.getByTestId('overview-sla-near')).toBeInTheDocument()
    expect(screen.getByTestId('overview-sla-overdue')).toBeInTheDocument()
    expect(screen.getByTestId('overview-sla-rate')).toBeInTheDocument()
  })
})