import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CoordinatorTicketsPanel } from '../CoordinatorTicketsPanel'
import type { TicketStatsSummary } from '../../../../apps/chamados/services/ticketStats'

function summary(over: Partial<TicketStatsSummary> = {}): TicketStatsSummary {
  return {
    total: 0,
    abertos: 0,
    emAtendimento: 0,
    semResponsavel: 0,
    altaPrioridade: 0,
    urgentes: 0,
    byStatus: { aberto: 0, a_caminho: 0, em_atendimento: 0, resolvido: 0, fechado: 0 },
    byPriority: { baixa: 0, normal: 0, alta: 0, urgente: 0 },
    ...over,
  }
}

const EMPTY_STATUS_NOTE = 'a distribuição por status aparece quando houver dados'
const EMPTY_PRIORITY_NOTE = 'a distribuição por prioridade aparece quando houver dados'

describe('CoordinatorTicketsPanel — painel apresentacional de chamados (C2, PR B)', () => {
  it('mostra os KPIs do resumo com os testids preservados e os valores das props', () => {
    render(
      <CoordinatorTicketsPanel
        stats={summary({
          total: 7,
          abertos: 3,
          emAtendimento: 2,
          semResponsavel: 4,
          altaPrioridade: 1,
          urgentes: 5,
        })}
      />,
    )

    expect(screen.getByTestId('overview-kpi-total')).toHaveTextContent('Chamados operacionais')
    expect(screen.getByTestId('overview-kpi-total')).toHaveTextContent('7')
    expect(screen.getByTestId('overview-kpi-aberto')).toHaveTextContent('Chamados abertos')
    expect(screen.getByTestId('overview-kpi-aberto')).toHaveTextContent('3')
    expect(screen.getByTestId('overview-kpi-em_atendimento')).toHaveTextContent('Em atendimento')
    expect(screen.getByTestId('overview-kpi-em_atendimento')).toHaveTextContent('2')
    expect(screen.getByTestId('overview-kpi-unassigned')).toHaveTextContent('Sem responsável')
    expect(screen.getByTestId('overview-kpi-unassigned')).toHaveTextContent('4')
    expect(screen.getByTestId('overview-kpi-alta_prioridade')).toHaveTextContent('Alta prioridade')
    expect(screen.getByTestId('overview-kpi-alta_prioridade')).toHaveTextContent('1')
    expect(screen.getByTestId('overview-kpi-urgentes')).toHaveTextContent('Urgentes')
    expect(screen.getByTestId('overview-kpi-urgentes')).toHaveTextContent('5')
  })

  it('distribuição por status com dados renderiza o gráfico dentro do card', () => {
    render(
      <CoordinatorTicketsPanel
        stats={summary({
          total: 3,
          byStatus: { aberto: 2, a_caminho: 0, em_atendimento: 0, resolvido: 1, fechado: 0 },
        })}
      />,
    )

    const card = screen.getByTestId('tickets-dist-status')
    expect(within(card).getByText('Chamados por status')).toBeTruthy()
    expect(within(card).queryByText(new RegExp(EMPTY_STATUS_NOTE))).toBeNull()
  })

  it('distribuição por prioridade com dados renderiza o donut com o total central', () => {
    render(
      <CoordinatorTicketsPanel
        stats={summary({
          total: 5,
          byPriority: { baixa: 0, normal: 3, alta: 0, urgente: 2 },
        })}
      />,
    )

    const card = screen.getByTestId('tickets-dist-priority')
    expect(within(card).getByText('Chamados por prioridade')).toBeTruthy()
    expect(within(card).getByText('chamados')).toBeTruthy()
    expect(within(card).getByText('5')).toBeTruthy()
    expect(within(card).queryByText(new RegExp(EMPTY_PRIORITY_NOTE))).toBeNull()
  })

  it('distribuições vazias são honestas: mensagem real, sem dados fabricados', () => {
    render(<CoordinatorTicketsPanel stats={summary()} />)

    const statusCard = screen.getByTestId('tickets-dist-status')
    const priorityCard = screen.getByTestId('tickets-dist-priority')

    expect(within(statusCard).getByText(new RegExp(EMPTY_STATUS_NOTE))).toBeTruthy()
    expect(within(priorityCard).getByText(new RegExp(EMPTY_PRIORITY_NOTE))).toBeTruthy()
    // Donut sem dados: o rótulo central não é inventado.
    expect(within(priorityCard).queryByText('chamados')).toBeNull()
  })

  it('com callback de navegação, os cards com deep link existente viram botões com as queries do shell', () => {
    const onOpenChamados = vi.fn()
    render(<CoordinatorTicketsPanel stats={summary({ total: 3, abertos: 1 })} onOpenChamados={onOpenChamados} />)

    fireEvent.click(screen.getByTestId('overview-kpi-total'))
    expect(onOpenChamados).toHaveBeenLastCalledWith()

    fireEvent.click(screen.getByTestId('overview-kpi-aberto'))
    expect(onOpenChamados).toHaveBeenLastCalledWith('?status=aberto')

    fireEvent.click(screen.getByTestId('overview-kpi-em_atendimento'))
    expect(onOpenChamados).toHaveBeenLastCalledWith('?status=em_andamento')

    fireEvent.click(screen.getByTestId('overview-kpi-unassigned'))
    expect(onOpenChamados).toHaveBeenLastCalledWith('?unassigned=1')

    // Sem deep link existente: alta prioridade e urgentes continuam blocos de leitura.
    expect((screen.getByTestId('overview-kpi-alta_prioridade') as HTMLElement).tagName).toBe('DIV')
    expect((screen.getByTestId('overview-kpi-urgentes') as HTMLElement).tagName).toBe('DIV')
    expect(within(screen.getByTestId('overview-kpis')).getAllByRole('button')).toHaveLength(4)
  })

  it('sem callback, nenhum KPI inventa navegação (todos blocos de leitura)', () => {
    render(<CoordinatorTicketsPanel stats={summary()} />)

    expect((screen.getByTestId('overview-kpi-aberto') as HTMLElement).tagName).toBe('DIV')
    expect((screen.getByTestId('overview-kpi-total') as HTMLElement).tagName).toBe('DIV')
    expect(within(screen.getByTestId('overview-kpis')).queryByRole('button')).toBeNull()
  })

  it('sla opcional (C5): cards dentro do SLA com deep links do shell; ausente → não renderiza', () => {
    const onOpenChamados = vi.fn()
    render(
      <CoordinatorTicketsPanel
        stats={summary({ total: 5 })}
        sla={{ within: 3, near: 1, overdue: 1 }}
        onOpenChamados={onOpenChamados}
      />,
    )

    expect(screen.getByTestId('overview-kpi-within')).toHaveTextContent('Dentro do SLA')
    expect(screen.getByTestId('overview-kpi-within')).toHaveTextContent('3')
    expect(screen.getByTestId('overview-kpi-near')).toHaveTextContent('Próximos do SLA')
    expect(screen.getByTestId('overview-kpi-near')).toHaveTextContent('1')
    expect(screen.getByTestId('overview-kpi-overdue')).toHaveTextContent('Vencidos')
    expect(screen.getByTestId('overview-kpi-overdue')).toHaveTextContent('1')

    fireEvent.click(screen.getByTestId('overview-kpi-within'))
    expect(onOpenChamados).toHaveBeenLastCalledWith()
    fireEvent.click(screen.getByTestId('overview-kpi-near'))
    expect(onOpenChamados).toHaveBeenLastCalledWith('?sla=near')
    fireEvent.click(screen.getByTestId('overview-kpi-overdue'))
    expect(onOpenChamados).toHaveBeenLastCalledWith('?sla=overdue')
  })

  it('sla omisso não cria os cards de SLA do painel', () => {
    render(<CoordinatorTicketsPanel stats={summary()} />)

    expect(screen.queryByTestId('overview-kpi-within')).toBeNull()
    expect(screen.queryByTestId('overview-kpi-near')).toBeNull()
    expect(screen.queryByTestId('overview-kpi-overdue')).toBeNull()
  })

  it('expõe os testids contratuais da visão geral e das distribuições', () => {
    render(
      <CoordinatorTicketsPanel
        stats={summary({
          total: 1,
          byStatus: { aberto: 1, a_caminho: 0, em_atendimento: 0, resolvido: 0, fechado: 0 },
          byPriority: { baixa: 0, normal: 1, alta: 0, urgente: 0 },
        })}
      />,
    )

    expect(screen.getByTestId('overview-kpis')).toBeInTheDocument()
    expect(screen.getByTestId('overview-kpi-total')).toBeInTheDocument()
    expect(screen.getByTestId('overview-kpi-aberto')).toBeInTheDocument()
    expect(screen.getByTestId('overview-kpi-em_atendimento')).toBeInTheDocument()
    expect(screen.getByTestId('overview-kpi-unassigned')).toBeInTheDocument()
    expect(screen.getByTestId('overview-kpi-alta_prioridade')).toBeInTheDocument()
    expect(screen.getByTestId('overview-kpi-urgentes')).toBeInTheDocument()
    expect(screen.getByTestId('tickets-dist-status')).toBeInTheDocument()
    expect(screen.getByTestId('tickets-dist-priority')).toBeInTheDocument()
  })
})