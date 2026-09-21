import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { CoordinatorReportsTab } from '../CoordinatorReportsTab'
import { setCol } from '../../../../lib/db'
import { slaConfigService } from '../../../../apps/chamados/services/slaConfigService'
import type { CoordinatedUnit } from '../../../../core/permissions/coordinatorService'
import type { Workspace } from '../../../../core/workspaces/types'
import type { ChamadosReport } from '../../../../apps/chamados/types/report'
import type { Ticket } from '../../../../apps/chamados/types'

const mockUseAppAccess = vi.hoisted(() => vi.fn())
const mockGetReports = vi.hoisted(() => vi.fn())
const mockExportCSV = vi.hoisted(() => vi.fn())

vi.mock('../../../../core/permissions/usePermissions', () => ({
  useAppAccess: () => mockUseAppAccess(),
}))

vi.mock('../../../../apps/chamados/services/ticketService', () => ({
  ticketService: {
    getReports: (...args: unknown[]) => mockGetReports(...args),
  },
}))

vi.mock('../../../../apps/pcare/utils/export', () => ({
  exportCSV: (...args: unknown[]) => mockExportCSV(...args),
}))

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

function workspace(id: string, slug: string): Workspace {
  return {
    id,
    name: `Campus ${id}`,
    slug,
    location: '',
    spreadsheet_url: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function report(): ChamadosReport {
  return {
    total: 6,
    byStatus: { resolvido: 4, aberto: 2 },
    byPriority: { alta: 1, normal: 5 },
    byArea: { academica: 6 },
    avgResolutionHours: 18.5,
    feedback: { count: 8, average: 4.2 },
    byTechnician: [],
    byRoom: [],
    byCategory: {},
    period: { from: '2026-01-01T00:00:00Z', to: '2026-01-31T00:00:00Z' },
  }
}

function ticket(overrides: Partial<Ticket>): Ticket {
  return {
    id: 't1',
    ticketNumber: 1,
    workspace_id: 'ws1',
    roomId: 'r1',
    roomName: 'Sala 101',
    assetName: 'Projetor',
    problemCategory: 'Projetor',
    problemDescription: 'não liga',
    status: 'resolvido',
    reportedBy: 'Prof. A',
    reportedByEmail: 'a@labhub.local',
    assignedTo: 'Técnico',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: null,
    ...overrides,
  }
}

function allowed(over: Record<string, unknown> = {}) {
  return { canAccessApp: () => true, canWriteApp: () => false, ...over }
}

function renderTab(units: CoordinatedUnit[], workspaces: Workspace[]) {
  return render(<CoordinatorReportsTab units={units} workspaces={workspaces} />)
}

describe('CoordinatorReportsTab (F.1 — leitura honesta por unidade)', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    mockUseAppAccess.mockReturnValue(allowed())
  })

  it('acesso restrito: papel sem leitura de Chamados não busca nada e mostra reports-restricted', async () => {
    mockUseAppAccess.mockReturnValue(allowed({ canAccessApp: () => false }))

    renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])
    await act(async () => {})

    expect(screen.getByTestId('reports-restricted')).toBeInTheDocument()
    expect(screen.queryByTestId('reports-loading')).toBeNull()
    expect(screen.queryByTestId('reports-unit-ws1')).toBeNull()
    expect(mockGetReports).not.toHaveBeenCalled()
  })

  it('sem unidades no escopo mostra reports-empty e não busca nada', async () => {
    renderTab([], [])
    await act(async () => {})

    expect(screen.getByTestId('reports-empty')).toBeInTheDocument()
    expect(mockGetReports).not.toHaveBeenCalled()
  })

  it('mostra reports-loading enquanto busca e depois esconde', async () => {
    let resolveReport!: (r: ChamadosReport) => void
    mockGetReports.mockImplementation(
      () => new Promise<ChamadosReport>((resolve) => (resolveReport = resolve)),
    )

    renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])
    expect(screen.getByTestId('reports-loading')).toBeInTheDocument()

    resolveReport(report())
    await waitFor(() =>
      expect(screen.queryByTestId('reports-loading')).not.toBeInTheDocument(),
    )
  })

  it('busca por unidade com workspace_id do membro e mostra os KPIs do relatório', async () => {
    mockGetReports.mockResolvedValue(report())

    renderTab([unit('ws2', 'Campus B')], [workspace('ws2', 'campus-b')])
    await waitFor(() => expect(screen.queryByTestId('reports-loading')).toBeNull())

    expect(mockGetReports).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws2',
        from: expect.any(String),
        to: expect.any(String),
      }),
    )

    const block = screen.getByTestId('reports-unit-ws2')
    expect(block).toHaveTextContent('Campus B')
    expect(block).toHaveTextContent('6')
    expect(block).toHaveTextContent('4')
  })

  it('falha isolada por unidade não derruba as demais unidades', async () => {
    mockGetReports.mockImplementation(({ workspace_id }) =>
      workspace_id === 'ws3'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(report()),
    )

    renderTab(
      [unit('ws1', 'Campus A'), unit('ws3', 'Campus C')],
      [workspace('ws1', 'campus-a'), workspace('ws3', 'campus-c')],
    )
    await waitFor(() => expect(screen.queryByTestId('reports-loading')).toBeNull())

    expect(screen.getByTestId('reports-unit-ws1')).toBeInTheDocument()
    expect(screen.getByTestId('reports-unit-ws3-error')).toBeInTheDocument()
  })

  it('alterna período e re-busca com o novo intervalo', async () => {
    mockGetReports.mockResolvedValue(report())

    renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])
    await waitFor(() => expect(screen.queryByTestId('reports-loading')).toBeNull())
    expect(mockGetReports).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('reports-period-7'))
    await waitFor(() => expect(mockGetReports).toHaveBeenCalledTimes(2))

    const last = mockGetReports.mock.calls[1][0] as { from: string; to: string }
    expect(new Date(last.to).getTime() - new Date(last.from).getTime()).toBeGreaterThan(0)
  })

  it('exporta CSV por unidade chamando exportCSV com cabeçalhos e linhas', async () => {
    mockGetReports.mockResolvedValue(report())
    mockExportCSV.mockImplementation(() => {})

    renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])
    await waitFor(() => expect(screen.queryByTestId('reports-loading')).toBeNull())

    fireEvent.click(screen.getByTestId('reports-export-csv'))

    expect(mockExportCSV).toHaveBeenCalledWith(
      expect.arrayContaining(['Unidade', 'Total']),
      expect.any(Array),
      expect.stringContaining('relatorios'),
    )
  })

  it('SLA do período varia com o período: 30d inclui resolvido que o intervalo de 7d exclui', async () => {
    const now = Date.now()
    const DAY = 24 * 60 * 60 * 1000
    const resolvedAt = new Date(now - 10 * DAY).toISOString()
    const createdAt = new Date(now - 11 * DAY).toISOString()
    setCol('chamados', [
      ticket({
        id: 'r-10d',
        workspace_id: 'ws1',
        status: 'resolvido',
        priority: 'normal',
        createdAt,
        updatedAt: resolvedAt,
        resolvedAt,
      }),
    ])
    mockGetReports.mockResolvedValue(report())

    renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])
    await waitFor(() => expect(screen.queryByTestId('reports-loading')).toBeNull())

    const periodLine = () => screen.getByTestId('reports-unit-ws1-sla-period')
    expect(periodLine()).toHaveTextContent(
      'SLA do período (30d): 100% dentro · 1/1 resolvidos no prazo',
    )

    fireEvent.click(screen.getByTestId('reports-period-7'))
    await waitFor(() => expect(mockGetReports).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(periodLine()).toHaveTextContent(
        'SLA do período (7d): 0% dentro · 0/0 resolvidos no prazo',
      ),
    )
  })

  it('SLA operacional (agora) vem do cache bruto e é separado do SLA do período', async () => {
    const now = Date.now()
    const HOUR = 60 * 60 * 1000
    setCol('chamados', [
      ticket({
        id: 'open-1',
        workspace_id: 'ws1',
        status: 'aberto',
        priority: 'urgente',
        createdAt: new Date(now - 3 * HOUR).toISOString(),
      }),
      ticket({
        id: 'open-2',
        workspace_id: 'ws1',
        status: 'em_atendimento',
        priority: 'normal',
        createdAt: new Date(now - 30 * 60 * 1000).toISOString(),
      }),
    ])
    mockGetReports.mockResolvedValue(report())

    renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])
    await waitFor(() => expect(screen.queryByTestId('reports-loading')).toBeNull())

    expect(screen.getByTestId('reports-unit-ws1-sla-operational')).toHaveTextContent(
      'SLA operacional (agora): 50% dentro (1 ok · 0 perto · 1 vencido)',
    )
    expect(screen.getByTestId('reports-unit-ws1-sla-period')).toHaveTextContent('0/0')
  })

  it('renderiza gráficos reais por unidade a partir das distribuições do relatório', async () => {
    mockGetReports.mockResolvedValue(report())

    renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])
    await waitFor(() => expect(screen.queryByTestId('reports-loading')).toBeNull())

    expect(screen.getByTestId('reports-unit-ws1-chart-status')).toBeInTheDocument()
    expect(screen.getByTestId('reports-unit-ws1-chart-priority')).toBeInTheDocument()
    expect(screen.getByTestId('reports-unit-ws1-chart-area')).toBeInTheDocument()
    expect(screen.getByTestId('reports-unit-ws1-chart-status')).toHaveTextContent('6')
  })

  it('read-only: nenhuma escrita do SLA é invocada e toda busca passa workspace_id', async () => {
    const getForSpy = vi.spyOn(slaConfigService, 'getFor')
    const getHoursSpy = vi.spyOn(slaConfigService, 'getHours')
    const updateSpy = vi.spyOn(slaConfigService, 'update')
    mockGetReports.mockResolvedValue(report())

    renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])
    await waitFor(() => expect(screen.queryByTestId('reports-loading')).toBeNull())

    expect(mockGetReports).toHaveBeenCalledTimes(1)
    const args = mockGetReports.mock.calls[0][0] as {
      workspace_id?: string
      from?: string
      to?: string
    }
    expect(args.workspace_id).toBe('ws1')
    expect(args.from).toBeTruthy()
    expect(args.to).toBeTruthy()

    expect(getForSpy).not.toHaveBeenCalled()
    expect(getHoursSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()

    getForSpy.mockRestore()
    getHoursSpy.mockRestore()
    updateSpy.mockRestore()
  })
})
