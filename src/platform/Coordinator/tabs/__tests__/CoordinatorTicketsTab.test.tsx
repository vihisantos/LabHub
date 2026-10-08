import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { CoordinatorTicketsTab, type CoordinatorTicketsTabProps } from '../CoordinatorTicketsTab'
import type { Ticket } from '../../../../apps/chamados/types'
import type { CoordinatedUnit } from '../../../../core/permissions/coordinatorService'

// A Central consulta o backend diretamente via `useCoordinatorTickets` — nunca
// depende do cache local (`cachedTickets()`). `getWorkspaceAssignees` é usado
// só quando o drawer abre; mock estático mantém o teste determinístico.
vi.mock('../../../../core/permissions/workspaceAssigneesService', () => ({
  getWorkspaceAssignees: vi.fn(async () => []),
}))

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

// ── fetch mock (o hook consulta `GET /api/chamados?workspace_id=...`) ────────

let fetchMock: ReturnType<typeof vi.fn>

/**
 * Mock do fetch do hook. O default devolve lista vazia para qualquer URL; os
 * testes que precisam de dados chamam `mockScopeFetch(tickets)`.
 */
function mockScopeFetch(scopeTickets: Ticket[]) {
  fetchMock.mockImplementation((url: string) => {
    const match = url.match(/workspace_id=([^&]+)/)
    const wsId = match ? decodeURIComponent(match[1]) : '__none__'
    const tickets = scopeTickets.filter((t) => t.workspace_id === wsId)
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ tickets }),
    })
  })
}

async function renderTab(
  units: CoordinatedUnit[],
  scopeTickets: Ticket[],
  over: Partial<CoordinatorTicketsTabProps> = {},
): Promise<RenderResult> {
  const onOpenTicket = vi.fn()
  const onOpenChamados = vi.fn()
  render(
    <CoordinatorTicketsTab
      units={units}
      activeKpis={{ abertos: 1, emAtendimento: 2, semResponsavel: 0 }}
      recentTickets={scopeTickets.slice(0, 5)}
      scopeTickets={[]}
      slaConfigs={{}}
      unitNameOf={(id) => units.find((u) => u.unitId === id)?.unitName ?? 'Unidade fora do escopo'}
      openChamadosFor={() => onOpenChamados}
      openTicketFor={() => onOpenTicket}
      {...over}
    />,
  )
  // O setup global ativa fake timers; `waitFor` não avança sozinho. Flush
  // explícito da resolução do fetch (padrão do repo: `await act(async () => {})`).
  await act(async () => {})
  return { onOpenTicket, onOpenChamados }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ tickets: [] }),
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('CoordinatorTicketsTab — listagem de chamados por escopo', () => {
  it('preserva os blocos existentes (KPIs, recentes e operação por unidade)', async () => {
    const units = [unit('ws1', 'Campus A')]
    mockScopeFetch([tk({ id: 'a', workspace_id: 'ws1' })])
    await renderTab(units, [tk({ id: 'a', workspace_id: 'ws1' })])

    expect(screen.getByTestId('tickets-kpis')).toBeInTheDocument()
    expect(screen.getByTestId('tickets-kpi-abertos')).toHaveTextContent('1')
    expect(screen.getByTestId('tickets-kpi-atendimento')).toHaveTextContent('2')
    expect(screen.getByTestId('tickets-kpi-sem-responsavel')).toHaveTextContent('0')
    expect(screen.getByTestId('tickets-recent')).toBeInTheDocument()
    expect(screen.getByTestId('tickets-open-ws1')).toBeInTheDocument()
    expect(screen.getByTestId('tickets-open-ws1?status=aberto')).toBeInTheDocument()
    expect(screen.getByTestId('tickets-open-ws1?sla=near')).toBeInTheDocument()
  })

  it('consulta direta ao servidor: lista NÃO depende de cachedTickets (cache vazio também traz dados)', async () => {
    const units = [unit('ws1', 'Campus A')]
    // `scopeTickets` (cache do shell) chega vazio — os chamados vêm do fetch.
    mockScopeFetch([tk({ id: 'a', workspace_id: 'ws1' })])
    await renderTab(units, [])

    expect(screen.getByTestId('tickets-list-a')).toBeInTheDocument()
    // Confirma que a lista veio de um GET no servidor, não do cache.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/chamados?workspace_id=ws1'),
      expect.anything(),
    )
  })

  it('lista todos os chamados do escopo recebido, com unidade no meta de cada linha', async () => {
    const units = [unit('ws1', 'Campus A'), unit('ws2', 'Campus B')]
    mockScopeFetch([tk({ id: 'a', workspace_id: 'ws1' }), tk({ id: 'b', workspace_id: 'ws2' })])
    await renderTab(units, [tk({ id: 'a', workspace_id: 'ws1' }), tk({ id: 'b', workspace_id: 'ws2' })])

    const list = screen.getByTestId('tickets-list')
    expect(within(list).getByTestId('tickets-list-a')).toBeInTheDocument()
    expect(within(list).getByTestId('tickets-list-b')).toBeInTheDocument()
    expect(within(screen.getByTestId('tickets-list-a')).getByText(/Campus A/)).toBeTruthy()
    expect(within(screen.getByTestId('tickets-list-b')).getByText(/Campus B/)).toBeTruthy()
  })

  it('invariante de escopo: chamado fora das unidades não vira linha (fail-closed)', async () => {
    const units = [unit('ws1', 'Campus A')]
    mockScopeFetch([tk({ id: 'a', workspace_id: 'ws1' }), tk({ id: 'out', workspace_id: 'ws99' })])
    await renderTab(units, [tk({ id: 'a', workspace_id: 'ws1' })])

    expect(screen.getByTestId('tickets-list-a')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-out')).toBeNull()
  })

  it('seletor de unidade lista apenas as unidades do escopo (nunca inventa)', async () => {
    const units = [unit('ws1', 'Campus A'), unit('ws2', 'Campus B')]
    mockScopeFetch([tk({ id: 'a', workspace_id: 'ws1' })])
    await renderTab(units, [tk({ id: 'a', workspace_id: 'ws1' })])

    const select = screen.getByTestId('tickets-filter-unit') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['all', 'ws1', 'ws2'])
  })

  it('filtro por unidade exibe só os chamados da unidade selecionada', async () => {
    const units = [unit('ws1', 'Campus A'), unit('ws2', 'Campus B')]
    mockScopeFetch([tk({ id: 'a', workspace_id: 'ws1' }), tk({ id: 'b', workspace_id: 'ws2' })])
    await renderTab(units, [tk({ id: 'a', workspace_id: 'ws1' }), tk({ id: 'b', workspace_id: 'ws2' })])

    fireEvent.change(screen.getByTestId('tickets-filter-unit'), { target: { value: 'ws2' } })

    expect(screen.getByTestId('tickets-list-b')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-a')).toBeNull()
  })

  it('filtro por status exibe só os chamados com aquele status', async () => {
    const units = [unit('ws1', 'Campus A')]
    mockScopeFetch([
      tk({ id: 'a', workspace_id: 'ws1' }),
      tk({ id: 'b', workspace_id: 'ws1', status: 'em_atendimento' }),
    ])
    await renderTab(units, [
      tk({ id: 'a', workspace_id: 'ws1' }),
      tk({ id: 'b', workspace_id: 'ws1', status: 'em_atendimento' }),
    ])

    fireEvent.change(screen.getByTestId('tickets-filter-status'), { target: { value: 'em_atendimento' } })

    expect(screen.getByTestId('tickets-list-b')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-a')).toBeNull()
  })

  it('filtro por prioridade usa a mesma normalização do app (ausência vira "normal")', async () => {
    const units = [unit('ws1', 'Campus A')]
    mockScopeFetch([
      tk({ id: 'sem', workspace_id: 'ws1', priority: undefined }),
      tk({ id: 'alta', workspace_id: 'ws1', priority: 'alta' }),
    ])
    await renderTab(units, [])

    fireEvent.change(screen.getByTestId('tickets-filter-priority'), { target: { value: 'normal' } })

    expect(screen.getByTestId('tickets-list-sem')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-alta')).toBeNull()
  })

  it('filtro por SLA (aplicável só ao fluxo aberto) usando getSlaState como fonte única', async () => {
    const units = [unit('ws1', 'Campus A')]
    mockScopeFetch([
      tk({ id: 'ok', workspace_id: 'ws1', createdAt: new Date(NOW.getTime() - 1 * HOUR).toISOString() }),
      tk({ id: 'near', workspace_id: 'ws1', createdAt: new Date(NOW.getTime() - 20 * HOUR).toISOString() }),
      tk({ id: 'overdue', workspace_id: 'ws1', createdAt: new Date(NOW.getTime() - 30 * HOUR).toISOString() }),
      tk({ id: 'fechado', workspace_id: 'ws1', status: 'fechado', createdAt: new Date(NOW.getTime() - 30 * HOUR).toISOString() }),
    ])
    await renderTab(units, [])

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

  it('busca local por termo (número/local/responsável) e contador reflete o filtro', async () => {
    const units = [unit('ws1', 'Campus A')]
    mockScopeFetch([
      tk({ id: 'a', workspace_id: 'ws1', ticketNumber: 404, assetName: 'Projetor' }),
      tk({ id: 'b', workspace_id: 'ws1', ticketNumber: 505, assignedTo: 'Técnico 2' }),
    ])
    await renderTab(units, [])

    fireEvent.change(screen.getByTestId('tickets-filter-search'), { target: { value: '404' } })
    expect(screen.getByTestId('tickets-list-a')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-b')).toBeNull()
    expect(screen.getByTestId('tickets-list-count')).toHaveTextContent('1 de 2')

    fireEvent.change(screen.getByTestId('tickets-filter-search'), { target: { value: 'técnico 2' } })
    expect(screen.getByTestId('tickets-list-b')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-a')).toBeNull()
  })

  it('escopo sem chamados mostra estado vazio honesto (não é erro)', async () => {
    mockScopeFetch([])
    await renderTab([unit('ws1', 'Campus A')], [])

    expect(screen.getByText('Nenhum chamado encontrado no escopo')).toBeInTheDocument()
  })

  it('filtros sem correspondência mostram mensagem de busca, mantendo o escopo', async () => {
    mockScopeFetch([tk({ id: 'a', workspace_id: 'ws1' })])
    await renderTab([unit('ws1', 'Campus A')], [])

    fireEvent.change(screen.getByTestId('tickets-filter-search'), { target: { value: 'nada' } })

    expect(screen.getByText('Nenhum chamado corresponde aos filtros')).toBeInTheDocument()
    expect(screen.getByTestId('tickets-list-count')).toHaveTextContent('0 de 1')
  })

  it('paginação remota: limit/offset fatiam a janela; navegação simula backend paginado', async () => {
    const units = [unit('ws1', 'Campus A')]
    const all = Array.from({ length: 25 }, (_, i) => tk({ id: `c${i}`, ticketNumber: i + 1 }))
    // Backend paginado de verdade: fatia por limit/offset e informa total.
    fetchMock.mockImplementation((url: string) => {
      const limit = Number(url.match(/limit=(\d+)/)?.[1] ?? 20)
      const offset = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
      const tickets = all.slice(offset, offset + limit)
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            tickets,
            total: 25,
            hasMore: offset + tickets.length < 25,
          }),
      })
    })
    await renderTab(units, [])

    expect(screen.getByTestId('tickets-pagination')).toBeInTheDocument()
    // A janela baixada é de 20 registros (página 1), não o histórico inteiro.
    expect(screen.getByTestId('tickets-list-c0')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-c24')).toBeNull()
    expect(screen.getByTestId('tickets-list-count')).toHaveTextContent('20 de 20')

    fireEvent.click(screen.getByTestId('tickets-page-2'))
    await act(async () => {})

    // Página 2: os 5 restantes da mesma janela remota.
    expect(screen.getByTestId('tickets-list-c24')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-c0')).toBeNull()
    expect(screen.getByTestId('tickets-list-count')).toHaveTextContent('5 de 5')

    // A página 2 foi buscada com offset=20 (paginação remota de verdade).
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('limit=20&offset=20'))).toBe(true)
  })

  it('mudança de filtro/busca volta para a página 1 e aplica-se na janela carregada', async () => {
    const units = [unit('ws1', 'Campus A')]
    const all = Array.from({ length: 25 }, (_, i) => tk({ id: `c${i}`, ticketNumber: i + 1 }))
    fetchMock.mockImplementation((url: string) => {
      const limit = Number(url.match(/limit=(\d+)/)?.[1] ?? 20)
      const offset = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
      const tickets = all.slice(offset, offset + limit)
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ tickets, total: 25, hasMore: true }),
      })
    })
    await renderTab(units, [])

    // Vai para a página 2…
    fireEvent.click(screen.getByTestId('tickets-page-2'))
    await act(async () => {})
    expect(screen.getByTestId('tickets-list-c24')).toBeInTheDocument()

    // …e muda a busca: volta para a página 1.
    fireEvent.change(screen.getByTestId('tickets-filter-search'), {
      target: { value: 'Computador' },
    })
    await act(async () => {})

    expect(screen.getByTestId('tickets-list-c0')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-c24')).toBeNull()
    // Busca continua CLIENT-SIDE sobre a janela carregada (página 1).
    expect(screen.getByTestId('tickets-list-count')).toHaveTextContent('20 de 20')
  })

  it('clique na linha abre o drawer de detalhe rápido (sem exigir navegação operacional)', async () => {
    const t = tk({ id: 'a', workspace_id: 'ws1' })
    mockScopeFetch([t])
    await renderTab([unit('ws1', 'Campus A')], [], { openTicketFor: () => null })

    fireEvent.click(screen.getByTestId('tickets-list-a'))
    await act(async () => {})

    // Drawer aberto com o chamado (não depende de `openTicketFor`).
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(`#${t.ticketNumber} — ${t.assetName || t.roomName}`)).toBeInTheDocument()
    // Sem permissão de navegação → botão "Abrir no módulo" NÃO aparece.
    expect(screen.queryByTestId('coordinator-ticket-open-operational')).toBeNull()
  })

  it('drawer oferece abrir no módulo operacional quando o workspace permite', async () => {
    const t = tk({ id: 'a', workspace_id: 'ws1' })
    mockScopeFetch([t])
    await renderTab([unit('ws1', 'Campus A')], [])

    fireEvent.click(screen.getByTestId('tickets-list-a'))
    await act(async () => {})

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('coordinator-ticket-open-operational')).toBeInTheDocument()
  })

  it('isolamento do coordenador: chamado de Pira (unidade coordenada) aparece; chamado de Mooca (fora do escopo) NUNCA aparece', async () => {
    const units = [unit('ws-pira', 'Campus Pira')]
    // Backend devolve até chamado de outra unidade por bug — a listagem ignora.
    mockScopeFetch([
      tk({ id: 'pira-1', workspace_id: 'ws-pira', roomName: 'Lab. 1' }),
      tk({ id: 'mooca-1', workspace_id: 'ws-mooca', roomName: 'Lab. mooca' }),
    ])
    await renderTab(units, [])

    expect(screen.getByTestId('tickets-list-pira-1')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-mooca-1')).toBeNull()
    // A fronteira do escopo também vale para o seletor: Mooca nem é uma opção.
    const select = screen.getByTestId('tickets-filter-unit') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['all', 'ws-pira'])
  })

  it('badge de SLA por linha usa o rótulo da fonte única (getSlaInfo)', async () => {
    const units = [unit('ws1', 'Campus A')]
    mockScopeFetch([
      tk({ id: 'ok', workspace_id: 'ws1', createdAt: new Date(NOW.getTime() - 1 * HOUR).toISOString() }),
      tk({ id: 'overdue', workspace_id: 'ws1', createdAt: new Date(NOW.getTime() - 30 * HOUR).toISOString() }),
    ])
    await renderTab(units, [])

    const badgeOk = screen.getByTestId('tickets-list-sla-ok')
    const badgeOverdue = screen.getByTestId('tickets-list-sla-overdue')
    expect(badgeOk).toHaveTextContent(/restantes/)
    expect(badgeOverdue).toHaveTextContent(/Atrasado/)
  })
})