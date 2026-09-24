import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CoordinatorTicketsTab, type CoordinatorTicketsTabProps } from '../CoordinatorTicketsTab'
import type { Ticket } from '../../../../apps/chamados/types'
import type { CoordinatedUnit } from '../../../../core/permissions/coordinatorService'

const NOW = new Date('2026-08-13T10:00:00Z')
const HOUR = 1000 * 60 * 60

function unit(unitId: string, unitName: string): CoordinatedUnit {
  return {
    coordination: {
      id: `coordination-${unitId}`,
      profile_id: 'u-coord',
      workspace_id: unitId,
      role_id: 'role-x',
      status: 'active' as const,
      managed_by: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    unitId,
    unitName,
    leaders: [],
  }
}

function tk(over: Partial<Ticket> & Pick<Ticket, 'id'>): Ticket {
  return {
    ticketNumber: 7,
    workspace_id: 'ws1',
    roomId: 'r1',
    roomName: 'Sala 101',
    assetName: 'Computador',
    problemCategory: 'Internet',
    problemDescription: 'sem conexão',
    status: 'aberto',
    priority: 'normal',
    reportedBy: 'Prof. Ana',
    reportedByEmail: 'ana@labhub.local',
    assignedTo: 'Técnico 1',
    createdAt: new Date(NOW.getTime() - 1 * HOUR).toISOString(),
    updatedAt: new Date(NOW.getTime() - 1 * HOUR).toISOString(),
    resolvedAt: null,
    ...over,
  }
}

interface RenderResult {
  onOpenTicket: ReturnType<typeof vi.fn>
  onOpenChamados: ReturnType<typeof vi.fn>
}

function renderTab(
  units: CoordinatedUnit[],
  scopeTickets: Ticket[],
  over: Partial<CoordinatorTicketsTabProps> = {},
): RenderResult {
  const onOpenTicket = vi.fn()
  const onOpenChamados = vi.fn()
  render(
    <CoordinatorTicketsTab
      units={units}
      activeKpis={{ abertos: 1, emAtendimento: 2, semResponsavel: 0 }}
      recentTickets={scopeTickets.slice(0, 5)}
      scopeTickets={scopeTickets}
      slaConfigs={{}}
      unitNameOf={(id) => units.find((u) => u.unitId === id)?.unitName ?? 'Unidade fora do escopo'}
      openChamadosFor={() => onOpenChamados}
      openTicketFor={() => onOpenTicket}
      {...over}
    />,
  )
  return { onOpenTicket, onOpenChamados }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CoordinatorTicketsTab — listagem de chamados por escopo', () => {
  it('preserva os blocos existentes (KPIs, recentes e operação por unidade)', () => {
    const units = [unit('ws1', 'Campus A')]
    renderTab(units, [tk({ id: 'a', workspace_id: 'ws1' })])

    expect(screen.getByTestId('tickets-kpis')).toBeInTheDocument()
    expect(screen.getByTestId('tickets-kpi-abertos')).toHaveTextContent('1')
    expect(screen.getByTestId('tickets-kpi-atendimento')).toHaveTextContent('2')
    expect(screen.getByTestId('tickets-kpi-sem-responsavel')).toHaveTextContent('0')
    expect(screen.getByTestId('tickets-recent')).toBeInTheDocument()
    expect(screen.getByTestId('tickets-open-ws1')).toBeInTheDocument()
    expect(screen.getByTestId('tickets-open-ws1?status=aberto')).toBeInTheDocument()
    expect(screen.getByTestId('tickets-open-ws1?sla=near')).toBeInTheDocument()
  })

  it('lista todos os chamados do escopo recebido, com unidade no meta de cada linha', () => {
    const units = [unit('ws1', 'Campus A'), unit('ws2', 'Campus B')]
    renderTab(units, [tk({ id: 'a', workspace_id: 'ws1' }), tk({ id: 'b', workspace_id: 'ws2' })])

    const list = screen.getByTestId('tickets-list')
    expect(within(list).getByTestId('tickets-list-a')).toBeInTheDocument()
    expect(within(list).getByTestId('tickets-list-b')).toBeInTheDocument()
    expect(within(screen.getByTestId('tickets-list-a')).getByText(/Campus A/)).toBeTruthy()
    expect(within(screen.getByTestId('tickets-list-b')).getByText(/Campus B/)).toBeTruthy()
  })

  it('invariante de escopo: chamado fora das unidades não vira linha (fail-closed)', () => {
    const units = [unit('ws1', 'Campus A')]
    // O prop literalmente traz um chamado de fora — a listagem ignora.
    renderTab(units, [tk({ id: 'a', workspace_id: 'ws1' }), tk({ id: 'out', workspace_id: 'ws99' })])

    expect(screen.getByTestId('tickets-list-a')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-out')).toBeNull()
  })

  it('seletor de unidade lista apenas as unidades do escopo (nunca inventa)', () => {
    const units = [unit('ws1', 'Campus A'), unit('ws2', 'Campus B')]
    renderTab(units, [tk({ id: 'a', workspace_id: 'ws1' })])

    const select = screen.getByTestId('tickets-filter-unit') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['all', 'ws1', 'ws2'])
  })

  it('filtro por unidade exibe só os chamados da unidade selecionada', () => {
    const units = [unit('ws1', 'Campus A'), unit('ws2', 'Campus B')]
    renderTab(units, [tk({ id: 'a', workspace_id: 'ws1' }), tk({ id: 'b', workspace_id: 'ws2' })])

    fireEvent.change(screen.getByTestId('tickets-filter-unit'), { target: { value: 'ws2' } })

    expect(screen.getByTestId('tickets-list-b')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-a')).toBeNull()
  })

  it('filtro por status exibe só os chamados com aquele status', () => {
    const units = [unit('ws1', 'Campus A')]
    renderTab(units, [
      tk({ id: 'a', workspace_id: 'ws1' }),
      tk({ id: 'b', workspace_id: 'ws1', status: 'em_atendimento' }),
    ])

    fireEvent.change(screen.getByTestId('tickets-filter-status'), { target: { value: 'em_atendimento' } })

    expect(screen.getByTestId('tickets-list-b')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-a')).toBeNull()
  })

  it('filtro por prioridade usa a mesma normalização do app (ausência vira "normal")', () => {
    const units = [unit('ws1', 'Campus A')]
    renderTab(units, [
      tk({ id: 'sem', workspace_id: 'ws1', priority: undefined }),
      tk({ id: 'alta', workspace_id: 'ws1', priority: 'alta' }),
    ])

    fireEvent.change(screen.getByTestId('tickets-filter-priority'), { target: { value: 'normal' } })

    expect(screen.getByTestId('tickets-list-sem')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-alta')).toBeNull()
  })

  it('filtro por SLA (aplicável só ao fluxo aberto) usando getSlaState como fonte única', () => {
    const units = [unit('ws1', 'Campus A')]
    renderTab(units, [
      tk({ id: 'ok', workspace_id: 'ws1', createdAt: new Date(NOW.getTime() - 1 * HOUR).toISOString() }),
      tk({ id: 'near', workspace_id: 'ws1', createdAt: new Date(NOW.getTime() - 20 * HOUR).toISOString() }),
      tk({ id: 'overdue', workspace_id: 'ws1', createdAt: new Date(NOW.getTime() - 30 * HOUR).toISOString() }),
      tk({ id: 'fechado', workspace_id: 'ws1', status: 'fechado', createdAt: new Date(NOW.getTime() - 30 * HOUR).toISOString() }),
    ])

    fireEvent.change(screen.getByTestId('tickets-filter-sla'), { target: { value: 'overdue' } })
    expect(screen.getByTestId('tickets-list-overdue')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-ok')).toBeNull()
    expect(screen.queryByTestId('tickets-list-near')).toBeNull()
    expect(screen.queryByTestId('tickets-list-fechado')).toBeNull()

    fireEvent.change(screen.getByTestId('tickets-filter-sla'), { target: { value: 'near' } })
    expect(screen.getByTestId('tickets-list-near')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-overdue')).toBeNull()

    fireEvent.change(screen.getByTestId('tickets-filter-sla'), { target: { value: 'ok' } })
    expect(screen.getByTestId('tickets-list-ok')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-near')).toBeNull()
  })

  it('busca local por termo (número/local/responsável) e contador reflete o filtro', () => {
    const units = [unit('ws1', 'Campus A')]
    renderTab(units, [
      tk({ id: 'a', workspace_id: 'ws1', ticketNumber: 404, assetName: 'Projetor' }),
      tk({ id: 'b', workspace_id: 'ws1', ticketNumber: 505, assignedTo: 'Técnico 2' }),
    ])

    fireEvent.change(screen.getByTestId('tickets-filter-search'), { target: { value: '404' } })
    expect(screen.getByTestId('tickets-list-a')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-b')).toBeNull()
    expect(screen.getByTestId('tickets-list-count')).toHaveTextContent('1 de 2')

    fireEvent.change(screen.getByTestId('tickets-filter-search'), { target: { value: 'técnico 2' } })
    expect(screen.getByTestId('tickets-list-b')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-a')).toBeNull()
  })

  it('escopo sem chamados mostra estado vazio honesto (não é erro)', () => {
    renderTab([unit('ws1', 'Campus A')], [])

    expect(screen.getByText('Nenhum chamado encontrado no escopo')).toBeInTheDocument()
  })

  it('filtros sem correspondência mostram mensagem de busca, mantendo o escopo', () => {
    renderTab([unit('ws1', 'Campus A')], [tk({ id: 'a', workspace_id: 'ws1' })])

    fireEvent.change(screen.getByTestId('tickets-filter-search'), { target: { value: 'nada' } })

    expect(screen.getByText('Nenhum chamado corresponde aos filtros')).toBeInTheDocument()
    expect(screen.getByTestId('tickets-list-count')).toHaveTextContent('0 de 1')
  })

  it('clique na linha abre o detail existente do chamado (openTicketFor com o id)', () => {
    const units = [unit('ws1', 'Campus A')]
    const { onOpenTicket } = renderTab(units, [tk({ id: 'a', workspace_id: 'ws1' })])

    fireEvent.click(screen.getByTestId('tickets-list-a'))

    expect(onOpenTicket).toHaveBeenCalledWith('a')
  })

  it('linha desabilitada quando não há workspace para abrir o chamado', () => {
    const units = [unit('ws1', 'Campus A')]
    renderTab(units, [tk({ id: 'a', workspace_id: 'ws1' })], { openTicketFor: () => null })

    expect(screen.getByTestId('tickets-list-a')).toBeDisabled()
  })

  it('badge de SLA por linha usa o rótulo da fonte única (getSlaInfo)', () => {
    const units = [unit('ws1', 'Campus A')]
    renderTab(units, [
      tk({ id: 'ok', workspace_id: 'ws1', createdAt: new Date(NOW.getTime() - 1 * HOUR).toISOString() }),
      tk({ id: 'overdue', workspace_id: 'ws1', createdAt: new Date(NOW.getTime() - 30 * HOUR).toISOString() }),
    ])

    const badgeOk = screen.getByTestId('tickets-list-sla-ok')
    const badgeOverdue = screen.getByTestId('tickets-list-sla-overdue')
    expect(badgeOk).toHaveTextContent(/restantes/)
    expect(badgeOverdue).toHaveTextContent(/Atrasado/)
  })
})
