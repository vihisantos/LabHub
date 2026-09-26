import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import {
  CoordinatorAuditTab,
  AUDIT_UNIT_LIMIT,
  formatAuditTimestamp,
  isWithinPeriod,
  type CoordinatorAuditTabProps,
  type AuditPeriodDays,
} from '../CoordinatorAuditTab'
import type { ServerAuditLog } from '../../../../core/logs/serverAuditService'
import type { CoordinatedUnit } from '../../../../core/permissions/coordinatorService'

const mockGetByWorkspace = vi.hoisted(() => vi.fn())

vi.mock('../../../../core/logs/serverAuditService', () => ({
  serverAuditService: {
    getByWorkspace: (...args: unknown[]) => mockGetByWorkspace(...args),
  },
}))

function unit(id: string, unitName: string): CoordinatedUnit {
  return {
    coordination: {
      id: `coordination-${id}`,
      profile_id: 'u-coord',
      workspace_id: id,
      role_id: 'role-x',
      status: 'active',
      managed_by: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    unitId: id,
    unitName,
    leaders: [],
  }
}

function log(id: string, over: Partial<ServerAuditLog> = {}): ServerAuditLog {
  return {
    id,
    workspace_id: 'ws1',
    actor_id: 'u-joao',
    actor_name: 'João Silva',
    action: 'role_changed',
    entity: 'user',
    entity_id: 'u-maria',
    entity_label: 'Maria Souza',
    meta: { prev_role: 'tec', new_role: 'lider' },
    timestamp: new Date(Date.now() - 6 * 86400000).toISOString(),
    ...over,
  }
}

const ws1 = unit('ws1', 'Campus A')
const ws2 = unit('ws2', 'Campus B')

const baseProps: CoordinatorAuditTabProps = {
  units: [ws1],
  unitNameOf: (workspaceId?: string) =>
    [ws1, ws2].find((u) => u.unitId === workspaceId)?.unitName ?? 'Unidade fora do escopo',
}

function renderTab(over: Partial<CoordinatorAuditTabProps> = {}) {
  render(<CoordinatorAuditTab {...baseProps} {...over} />)
}

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('CoordinatorAuditTab — auditoria READ-ONLY sobre o escopo visível (V1)', () => {
  it('renderiza o cabeçalho da aba Auditoria com o subtítulo do escopo', () => {
    mockGetByWorkspace.mockResolvedValue([])
    renderTab()
    expect(screen.getByTestId('tab-audit')).toBeInTheDocument()
    expect(screen.getByText('Auditoria')).toBeTruthy()
    expect(screen.getByText('Registros auditados do escopo do coordenador')).toBeTruthy()
  })

  it('mostra o badge Imutável', () => {
    mockGetByWorkspace.mockResolvedValue([])
    renderTab()
    expect(screen.getByText('Imutável')).toBeTruthy()
  })

  it('renderiza loading → skeletons espelhando KPIs e linhas', async () => {
    let resolvePending!: (value: ServerAuditLog[]) => void
    mockGetByWorkspace.mockReturnValueOnce(
      new Promise<ServerAuditLog[]>((resolve) => {
        resolvePending = resolve
      }),
    )
    renderTab()
    expect(screen.getByTestId('audit-loading')).toBeInTheDocument()
    expect(document.querySelectorAll('.skeleton-shimmer').length).toBeGreaterThan(0)
    resolvePending([])
    await waitFor(() => expect(screen.queryByTestId('audit-loading')).toBeNull())
  })

  it('falha no carregamento → ErrorState honesto', async () => {
    mockGetByWorkspace.mockRejectedValue(new Error('network'))
    renderTab()
    await waitFor(() =>
      expect(screen.getByText(/Não foi possível carregar os registros de auditoria/)).toBeTruthy(),
    )
  })

  it('"Tentar novamente" refaz o carregamento e resolve', async () => {
    mockGetByWorkspace.mockRejectedValueOnce(new Error('network'))
    renderTab()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument(),
    )
    mockGetByWorkspace.mockResolvedValue([log('a')])
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(screen.getByTestId('audit-event-a')).toBeInTheDocument())
    expect(mockGetByWorkspace).toHaveBeenCalledTimes(2)
  })

  it('sem registros → EmptyState "Nenhum registro de auditoria encontrado"', async () => {
    mockGetByWorkspace.mockResolvedValue([])
    renderTab()
    await waitFor(() =>
      expect(
        screen.getByText('Nenhum registro de auditoria encontrado no escopo selecionado.'),
      ).toBeTruthy(),
    )
  })

  it('renderiza as unidades do escopo com eventos', async () => {
    mockGetByWorkspace.mockImplementation((workspaceId: string) => {
      if (workspaceId === 'ws1') return Promise.resolve([log('a')])
      return Promise.resolve([])
    })
    renderTab({ units: [ws1, ws2] })
    await waitFor(() => expect(screen.getByTestId('audit-unit-ws1')).toBeInTheDocument())
    expect(within(screen.getByTestId('audit-unit-ws1')).getByText('Campus A')).toBeTruthy()
  })

  it('agrupa eventos por unidade', async () => {
    mockGetByWorkspace.mockImplementation((workspaceId: string) => {
      if (workspaceId === 'ws1') return Promise.resolve([log('a')])
      return Promise.resolve([{ ...log('b'), workspace_id: 'ws2' }])
    })
    renderTab({ units: [ws1, ws2] })
    await waitFor(() => expect(screen.getByTestId('audit-unit-ws1')).toBeInTheDocument())
    expect(
      within(screen.getByTestId('audit-unit-ws1')).getByTestId('audit-event-a'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('audit-unit-ws2')).getByTestId('audit-event-b'),
    ).toBeInTheDocument()
  })

  it('ordena eventos dentro da unidade do mais recente para o mais antigo', async () => {
    mockGetByWorkspace.mockResolvedValue([
      { ...log('older', { timestamp: new Date(Date.now() - 2 * 86400000).toISOString() }) },
      { ...log('newer', { timestamp: new Date(Date.now() - 86400000).toISOString() }) },
    ])
    renderTab()
    await waitFor(() => expect(screen.getByTestId('audit-event-newer')).toBeInTheDocument())
    const items = screen
      .getByTestId('audit-unit-ws1')
      .querySelectorAll('[data-testid^="audit-event-"]')
    expect(items[0].getAttribute('data-testid')).toBe('audit-event-newer')
    expect(items[1].getAttribute('data-testid')).toBe('audit-event-older')
  })

  it('busca por usuário filtra os registros', async () => {
    mockGetByWorkspace.mockResolvedValue([
      log('a'),
      { ...log('b', { actor_name: 'Ana Lopes', action: 'membership_added' }) },
    ])
    renderTab()
    await waitFor(() => expect(screen.getByTestId('audit-event-a')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('audit-search'), { target: { value: 'ana' } })
    expect(screen.queryByTestId('audit-event-a')).toBeNull()
    expect(screen.getByTestId('audit-event-b')).toBeInTheDocument()
  })

  it('busca por ação/entidade filtra os registros', async () => {
    mockGetByWorkspace.mockResolvedValue([
      log('a'),
      { ...log('b', { actor_name: 'Ana Lopes', action: 'membership_added' }) },
    ])
    renderTab()
    await waitFor(() => expect(screen.getByTestId('audit-event-a')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('audit-search'), { target: { value: 'membership_added' } })
    expect(screen.queryByTestId('audit-event-a')).toBeNull()
    expect(screen.getByTestId('audit-event-b')).toBeInTheDocument()
  })

  it('filtro por ação (derivado dos dados reais) restringe os registros', async () => {
    mockGetByWorkspace.mockResolvedValue([
      log('a'),
      { ...log('b', { actor_name: 'Ana Lopes', action: 'membership_added' }) },
    ])
    renderTab()
    await waitFor(() => expect(screen.getByTestId('audit-event-a')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('audit-action-filter'), {
      target: { value: 'membership_added' },
    })
    expect(screen.queryByTestId('audit-event-a')).toBeNull()
    expect(screen.getByTestId('audit-event-b')).toBeInTheDocument()
  })

  it('filtro por período funciona sobre os dados carregados (padrão 30 dias)', async () => {
    const now = Date.now()
    mockGetByWorkspace.mockResolvedValue([
      { ...log('recent', { timestamp: new Date(now - 5 * 86400000).toISOString() }) },
      { ...log('old', { timestamp: new Date(now - 60 * 86400000).toISOString() }) },
    ])
    renderTab()
    await waitFor(() => expect(screen.getByTestId('audit-event-recent')).toBeInTheDocument())
    expect(screen.queryByTestId('audit-event-old')).toBeNull()
    fireEvent.click(screen.getByTestId('audit-period-90'))
    expect(screen.getByTestId('audit-event-recent')).toBeInTheDocument()
    expect(screen.getByTestId('audit-event-old')).toBeInTheDocument()
  })

  it('metadata inicia colapsada', async () => {
    mockGetByWorkspace.mockResolvedValue([log('a')])
    renderTab()
    await waitFor(() => expect(screen.getByTestId('audit-event-a')).toBeInTheDocument())
    expect(screen.queryByTestId('audit-meta-a')).toBeNull()
    expect(screen.getByTestId('audit-meta-toggle-a')).toHaveTextContent('Ver detalhes')
  })

  it('metadata pode ser expandida com aviso técnico', async () => {
    mockGetByWorkspace.mockResolvedValue([log('a')])
    renderTab()
    await waitFor(() => expect(screen.getByTestId('audit-event-a')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('audit-meta-toggle-a'))
    expect(screen.getByTestId('audit-meta-a')).toBeInTheDocument()
    expect(screen.getByText('Contém dados técnicos do registro.')).toBeTruthy()
    expect(screen.getByTestId('audit-meta-a').textContent).toContain('prev_role')
  })

  it('respeita o limite de 200 registros por unidade na chamada', async () => {
    mockGetByWorkspace.mockImplementation(() => Promise.resolve([]))
    renderTab({ units: [ws1, ws2] })
    await waitFor(() =>
      expect(screen.getByText('Nenhum registro de auditoria encontrado no escopo selecionado.')).toBeTruthy(),
    )
    expect(mockGetByWorkspace).toHaveBeenCalledWith('ws1', AUDIT_UNIT_LIMIT)
    expect(mockGetByWorkspace).toHaveBeenCalledWith('ws2', AUDIT_UNIT_LIMIT)
    expect(mockGetByWorkspace).toHaveBeenCalledTimes(2)
    expect(screen.getByText(/Até 200\/unidade/)).toBeTruthy()
  })

  it('não consulta unidades fora de visibleUnits', async () => {
    mockGetByWorkspace.mockResolvedValue([])
    renderTab({ units: [ws1] })
    await waitFor(() =>
      expect(screen.getByText('Nenhum registro de auditoria encontrado no escopo selecionado.')).toBeTruthy(),
    )
    expect(mockGetByWorkspace).toHaveBeenCalledTimes(1)
    expect(mockGetByWorkspace).toHaveBeenCalledWith('ws1', AUDIT_UNIT_LIMIT)
  })

  it('evento com workspace fora do escopo visível não aparece (fail-closed)', async () => {
    mockGetByWorkspace.mockResolvedValue([
      { ...log('fora', { workspace_id: 'ws999', entity_label: 'Fora do Escopo' }) },
    ])
    renderTab({ units: [ws1] })
    await waitFor(() =>
      expect(screen.getByText('Nenhum registro de auditoria encontrado no escopo selecionado.')).toBeTruthy(),
    )
    expect(screen.queryByTestId('audit-event-fora')).toBeNull()
    expect(screen.queryByText('Fora do Escopo')).toBeNull()
  })

  it('KPIs refletem os dados carregados no período', async () => {
    mockGetByWorkspace.mockImplementation((workspaceId: string) => {
      if (workspaceId === 'ws1') return Promise.resolve([log('a'), { ...log('c') }])
      return Promise.resolve([{ ...log('b', { workspace_id: 'ws2', actor_name: 'Ana Lopes' }) }])
    })
    renderTab({ units: [ws1, ws2] })
    await waitFor(() => expect(screen.getByTestId('audit-event-c')).toBeInTheDocument())
    expect(within(screen.getByTestId('audit-summary-events')).getByText('3')).toBeTruthy()
    expect(within(screen.getByTestId('audit-summary-units')).getByText('2')).toBeTruthy()
    expect(within(screen.getByTestId('audit-summary-actions')).getByText('1')).toBeTruthy()
  })

  it('unidade do escopo com 0 eventos é exibida de forma honesta', async () => {
    mockGetByWorkspace.mockImplementation((workspaceId: string) => {
      if (workspaceId === 'ws1') return Promise.resolve([log('a')])
      return Promise.resolve([])
    })
    renderTab({ units: [ws1, ws2] })
    await waitFor(() => expect(screen.getByTestId('audit-unit-ws2')).toBeInTheDocument())
    expect(within(screen.getByTestId('audit-unit-ws2')).getByText(/0 eventos no período exibido/)).toBeTruthy()
  })

  it('filtro de unidade restringe os grupos exibidos', async () => {
    mockGetByWorkspace.mockImplementation((workspaceId: string) => {
      if (workspaceId === 'ws1') return Promise.resolve([log('a')])
      return Promise.resolve([{ ...log('b', { workspace_id: 'ws2' }) }])
    })
    renderTab({ units: [ws1, ws2] })
    await waitFor(() => expect(screen.getByTestId('audit-event-b')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('audit-unit-filter'), { target: { value: 'ws1' } })
    expect(screen.queryByTestId('audit-event-b')).toBeNull()
    expect(screen.getByTestId('audit-event-a')).toBeInTheDocument()
  })

  it('com filtro sem correspondência → EmptyState de filtro sem resultado', async () => {
    mockGetByWorkspace.mockResolvedValue([log('a')])
    renderTab()
    await waitFor(() => expect(screen.getByTestId('audit-event-a')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('audit-search'), { target: { value: 'zzz' } })
    expect(screen.getByText('Nenhum registro corresponde aos filtros atuais.')).toBeTruthy()
  })

  it('formatAuditTimestamp usa o padrão pt-BR local, como o LogsPage (Admin)', () => {
    const iso = '2026-09-25T12:42:00.000Z'
    expect(formatAuditTimestamp(iso)).toBe(new Date(iso).toLocaleString('pt-BR'))
    expect(formatAuditTimestamp('invalida')).toBe('—')
  })

  it('isWithinPeriod respeita o período informado (limite inclusivo no início)', () => {
    const now = new Date('2026-09-25T12:00:00Z').getTime()
    expect(isWithinPeriod('2026-09-22T12:00:00Z', 7 as AuditPeriodDays, now)).toBe(true)
    expect(isWithinPeriod('2026-09-18T12:00:00Z', 7 as AuditPeriodDays, now)).toBe(true)
    expect(isWithinPeriod('2026-09-17T12:00:00Z', 7 as AuditPeriodDays, now)).toBe(false)
    expect(isWithinPeriod('2026-09-18T12:00:00Z', 30 as AuditPeriodDays, now)).toBe(true)
    expect(isWithinPeriod('invalida', 90 as AuditPeriodDays, now)).toBe(false)
  })
})