import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CoordinatorMetricCard } from '../CoordinatorMetricCard'
import { CoordinatorPanel } from '../CoordinatorPanel'

describe('CoordinatorMetricCard — KPI reutilizável da Central (PR B)', () => {
  it('estático: valor + rótulo em um bloco de leitura (sem interação inventada)', () => {
    render(<CoordinatorMetricCard label="Chamados abertos" value={3} data-testid="k-1" />)
    const card = screen.getByTestId('k-1')
    expect(card).toHaveTextContent('Chamados abertos')
    expect(card).toHaveTextContent('3')
    expect(card.tagName).toBe('DIV')
  })

  it('zero honesto (nunca inventa número)', () => {
    render(<CoordinatorMetricCard label="Vencidos" value={0} data-testid="k-2" />)
    expect(screen.getByTestId('k-2')).toHaveTextContent('Vencidos')
    expect(screen.getByTestId('k-2')).toHaveTextContent('0')
  })

  it('com onClick vira botão real: foco/teclado/aria preservados (nunca div clicável)', () => {
    const onClick = vi.fn()
    render(
      <CoordinatorMetricCard
        label="Em atendimento"
        value={2}
        onClick={onClick}
        data-testid="k-3"
      />,
    )
    const btn = screen.getByTestId('k-3') as HTMLButtonElement
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.getAttribute('aria-label')).toBe('Em atendimento: 2')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('ícone opcional com tom não quebra a leitura do rótulo', () => {
    render(
      <CoordinatorMetricCard
        label="Taxa de SLA"
        value="50%"
        tone="emerald"
        icon={<span role="presentation" />}
        data-testid="k-4"
      />,
    )
    expect(screen.getByTestId('k-4')).toHaveTextContent('Taxa de SLA')
    expect(screen.getByTestId('k-4')).toHaveTextContent('50%')
  })
})

describe('CoordinatorPanel — container de seção da Central (PR B)', () => {
  it('título, descrição e conteúdo numa seção semântica', () => {
    render(
      <CoordinatorPanel title="KPIs principais" description="Resumo operacional" data-testid="p-1">
        <p>conteúdo</p>
      </CoordinatorPanel>,
    )
    const panel = screen.getByTestId('p-1')
    expect(panel.tagName).toBe('SECTION')
    expect(within(panel).getByText('KPIs principais')).toBeTruthy()
    expect(within(panel).getByText('Resumo operacional')).toBeTruthy()
    expect(within(panel).getByText('conteúdo')).toBeTruthy()
  })

  it('sem descrição nem children → segue válido (só título)', () => {
    render(<CoordinatorPanel title="SLA no escopo" data-testid="p-2" />)
    expect(screen.getByTestId('p-2')).toHaveTextContent('SLA no escopo')
  })

  it('action opcional no cabeçalho', () => {
    render(
      <CoordinatorPanel
        title="Solicitações / Pendências"
        action={<button type="button">Aprovar</button>}
        data-testid="p-3"
      />,
    )
    expect(
      within(screen.getByTestId('p-3')).getByRole('button', { name: 'Aprovar' }),
    ).toBeTruthy()
  })
})