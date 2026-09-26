import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { CoordinatorReservaLabTab } from '../CoordinatorReservaLabTab'
import type { CoordinatedUnit } from '../../../../core/permissions/coordinatorService'
import type { Workspace } from '../../../../core/workspaces/types'

const mockUseAppAccess = vi.hoisted(() => vi.fn())
const mockFetchReservas = vi.hoisted(() => vi.fn())
const mockFetchTabletReservas = vi.hoisted(() => vi.fn())

vi.mock('../../../../core/permissions/usePermissions', () => ({
  useAppAccess: () => mockUseAppAccess(),
}))

vi.mock('../../../../apps/reservalab/services/api', () => ({
  fetchReservas: (...args: unknown[]) => mockFetchReservas(...args),
}))

vi.mock('../../../../apps/reservalab/services/supabase', () => ({
  fetchTabletReservas: (...args: unknown[]) => mockFetchTabletReservas(...args),
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

function labsResponse(over: Record<string, unknown> = {}) {
  return { lab1_reservas: [], lab2_reservas: [], reservas_semana: [], ...over }
}

function labReserva(data: string, over: Record<string, unknown> = {}) {
  return {
    horario: '07h30 às 09h20',
    responsavel: 'Prof. Ana',
    observacao: 'Química',
    reserva_feita_por: 'Coordenação',
    alunos: 12,
    labs: ['LAB01'],
    lab: 'LAB01',
    data,
    ...over,
  }
}

function tabletReserva(id: string, horarioInicio: string, over: Record<string, unknown> = {}) {
  return {
    id,
    sala: 'Sala 10',
    quantidade_tablets: 10,
    professor: 'Prof. Bruno',
    horario_inicio: horarioInicio,
    horario_fim: horarioInicio.replace(/T(\d+)/, (_, h: string) => `T${Number(h) + 2}`),
    finalidade: 'Aula',
    reservado_por: 'Coordenação',
    status: 'ativa',
    workspace_id: 'ws1',
    ...over,
  }
}

function renderTab(units: CoordinatedUnit[], workspaces: Workspace[]) {
  return render(<CoordinatorReservaLabTab units={units} workspaces={workspaces} />)
}

describe('CoordinatorReservaLabTab (PR E — visão consolidada em leitura)', () => {
  beforeEach(() => {
    // O setup global (src/test/mocks.ts) usa fake timers; waitFor/findByTestId
    // dependem de timers reais — mesmo padrão do CoordinatorHome.test.tsx.
    vi.useRealTimers()
    vi.clearAllMocks()
    mockUseAppAccess.mockReturnValue({ canAccessApp: () => true, canWriteApp: () => false })
    mockFetchReservas.mockResolvedValue(labsResponse())
    mockFetchTabletReservas.mockResolvedValue([])
  })

  it('carrega por unidade: labs via slug da workspace, tablets via id', async () => {
    renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])
    await waitFor(() => expect(screen.queryByTestId('reservalab-loading')).toBeNull())

    expect(mockFetchReservas).toHaveBeenCalledTimes(1)
    expect(mockFetchReservas).toHaveBeenCalledWith('campus-a')
    expect(mockFetchTabletReservas).toHaveBeenCalledTimes(1)
    expect(mockFetchTabletReservas).toHaveBeenCalledWith(
      expect.any(Date),
      expect.any(Date),
      'ws1',
    )
  })

  it('renderiza cards de lab e tablet com os dados reais por unidade', async () => {
    mockFetchReservas.mockResolvedValue(
      labsResponse({
        lab_reservas: { LAB01: [labReserva('20/09/2026')] },
      }),
    )
    mockFetchTabletReservas.mockResolvedValue([
      tabletReserva('tb-1', '2026-09-20T11:00:00.000Z'),
    ])

    renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])

    // Datas dos fixtures são fixas (20/09) — seleciona a data explicitamente.
    fireEvent.change(screen.getByTestId('reservalab-date-input'), {
      target: { value: '2026-09-20' },
    })

    const unitBlock = await screen.findByTestId('reservalab-unit-ws1')
    expect(within(unitBlock).getByText('Campus A')).toBeInTheDocument()
    expect(within(unitBlock).getByTestId('reservalab-lab-card')).toBeInTheDocument()
    expect(within(unitBlock).getByText('Lab 01')).toBeInTheDocument()
    expect(within(unitBlock).getByText('07h30 às 09h20')).toBeInTheDocument()
    expect(within(unitBlock).getByText(/Prof\. Ana/)).toBeInTheDocument()
    expect(within(unitBlock).getByTestId('reservalab-tablet-card')).toBeInTheDocument()
    expect(within(unitBlock).getByText('10 tablets')).toBeInTheDocument()
    expect(within(unitBlock).getByText(/Prof\. Bruno/)).toBeInTheDocument()
  })

  it('multiunidade busca por unidade (uma chamada por fonte, sem N+1)', async () => {
    renderTab(
      [unit('ws1', 'Campus A'), unit('ws2', 'Campus B')],
      [workspace('ws1', 'campus-a'), workspace('ws2', 'campus-b')],
    )
    await waitFor(() => expect(screen.queryByTestId('reservalab-loading')).toBeNull())

    expect(mockFetchReservas).toHaveBeenCalledTimes(2)
    expect(mockFetchReservas).toHaveBeenCalledWith('campus-a')
    expect(mockFetchReservas).toHaveBeenCalledWith('campus-b')
    expect(mockFetchTabletReservas).toHaveBeenCalledTimes(2)
    expect(mockFetchTabletReservas).toHaveBeenCalledWith(
      expect.any(Date),
      expect.any(Date),
      'ws1',
    )
    expect(mockFetchTabletReservas).toHaveBeenCalledWith(
      expect.any(Date),
      expect.any(Date),
      'ws2',
    )
    expect(screen.getByTestId('reservalab-unit-ws1')).toBeInTheDocument()
    expect(screen.getByTestId('reservalab-unit-ws2')).toBeInTheDocument()
  })

  it('unidade fora do contexto não busca nada (fail-closed)', async () => {
    renderTab([unit('ws2', 'Campus B')], [workspace('ws1', 'campus-a')])
    await waitFor(() => expect(screen.queryByTestId('reservalab-loading')).toBeNull())

    expect(mockFetchReservas).not.toHaveBeenCalled()
    expect(mockFetchTabletReservas).not.toHaveBeenCalled()
    const unitBlock = screen.getByTestId('reservalab-unit-ws2')
    expect(within(unitBlock).getByText(/fora do contexto/)).toBeInTheDocument()
  })

  it('erro isolado por fonte: falha em labs não apaga tablets e vice-versa', async () => {
    mockFetchReservas.mockRejectedValue(new Error('boom'))
    mockFetchTabletReservas.mockResolvedValue([tabletReserva('tb-1', '2026-09-20T11:00:00.000Z')])

    const { unmount: unmount1 } = renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])
    fireEvent.change(screen.getByTestId('reservalab-date-input'), {
      target: { value: '2026-09-20' },
    })
    const unitBlock1 = await screen.findByTestId('reservalab-unit-ws1')
    expect(within(unitBlock1).getByTestId('reservalab-labs-error')).toBeInTheDocument()
    expect(within(unitBlock1).getByTestId('reservalab-tablet-card')).toBeInTheDocument()
    unmount1()

    mockFetchReservas.mockResolvedValue(labsResponse({ lab_reservas: { LAB01: [labReserva('20/09/2026')] } }))
    mockFetchTabletReservas.mockRejectedValue(new Error('boom'))

    renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])
    fireEvent.change(screen.getByTestId('reservalab-date-input'), {
      target: { value: '2026-09-20' },
    })
    const unitBlock2 = await screen.findByTestId('reservalab-unit-ws1')
    expect(within(unitBlock2).getByTestId('reservalab-tablets-error')).toBeInTheDocument()
    expect(within(unitBlock2).getByTestId('reservalab-lab-card')).toBeInTheDocument()
  })

  it('planilha ausente mostra aviso honesto por unidade', async () => {
    mockFetchReservas.mockResolvedValue(labsResponse({ spreadsheet: 'missing' }))

    renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])
    const unitBlock = await screen.findByTestId('reservalab-unit-ws1')

    expect(within(unitBlock).getByTestId('reservalab-labs-missing')).toBeInTheDocument()
    expect(within(unitBlock).getByText(/planilha configurada/i)).toBeInTheDocument()
  })

  it('estados vazios separados por fonte', async () => {
    renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])
    const unitBlock = await screen.findByTestId('reservalab-unit-ws1')

    expect(within(unitBlock).getByTestId('reservalab-labs-empty')).toBeInTheDocument()
    expect(within(unitBlock).getByText('Nenhuma reserva de laboratório nesta data.')).toBeInTheDocument()
    expect(within(unitBlock).getByTestId('reservalab-tablets-empty')).toBeInTheDocument()
    expect(within(unitBlock).getByText('Nenhuma reserva de tablets nesta data.')).toBeInTheDocument()
  })

  it('read-only: nenhum botão de criar/editar/cancelar/gerenciar em nenhuma unidade', async () => {
    renderTab(
      [unit('ws1', 'Campus A'), unit('ws2', 'Campus B')],
      [workspace('ws1', 'campus-a'), workspace('ws2', 'campus-b')],
    )
    await screen.findByTestId('reservalab-unit-ws2')

    expect(document.querySelectorAll('button')).toHaveLength(0)
  })

  it('data é America/Sao_Paulo: virada de UTC não desloca o dia', async () => {
    mockFetchTabletReservas.mockResolvedValue([
      // 23:00 BRT de 20/09 (2026-09-21T02:00Z em UTC) — mesma data no fuso do negócio.
      tabletReserva('tb-brt', '2026-09-21T02:00:00.000Z'),
      // 10:00 BRT de 21/09 — outro dia.
      tabletReserva('tb-outro', '2026-09-21T13:00:00.000Z', { sala: 'Sala 99' }),
    ])

    renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])

    // Seleciona 20/09 explicitamente.
    fireEvent.change(screen.getByTestId('reservalab-date-input'), {
      target: { value: '2026-09-20' },
    })

    const unitBlock = await screen.findByTestId('reservalab-unit-ws1')
    await waitFor(() => {
      expect(within(unitBlock).getAllByTestId('reservalab-tablet-card')).toHaveLength(1)
    })
    expect(within(unitBlock).getByText(/Prof\. Bruno/)).toBeInTheDocument()
    expect(within(unitBlock).queryByText('Sala 99')).toBeNull()
  })

  it('labs fora da data selecionada não aparecem (dia da semana incluído)', async () => {
    mockFetchReservas.mockResolvedValue(
      labsResponse({
        reservas_semana: [
          labReserva('20/09/2026'),
          labReserva('21/09/2026', { horario: '13h00 às 15h00', lab: 'LAB02', labs: ['LAB02'] }),
        ],
      }),
    )

    renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])

    fireEvent.change(screen.getByTestId('reservalab-date-input'), {
      target: { value: '2026-09-20' },
    })

    const unitBlock = await screen.findByTestId('reservalab-unit-ws1')
    await waitFor(() => {
      expect(within(unitBlock).getAllByTestId('reservalab-lab-card')).toHaveLength(1)
    })
    expect(within(unitBlock).getByText('Lab 01')).toBeInTheDocument()
    expect(within(unitBlock).queryByText('Lab 02')).toBeNull()
  })

  it('papel sem acesso ao ReservaLab: "acesso restrito" e nada é buscado', async () => {
    mockUseAppAccess.mockReturnValue({ canAccessApp: () => false, canWriteApp: () => false })

    renderTab([unit('ws1', 'Campus A')], [workspace('ws1', 'campus-a')])
    await waitFor(() => expect(screen.getByTestId('reservalab-restricted')).toBeInTheDocument())

    expect(mockFetchReservas).not.toHaveBeenCalled()
    expect(mockFetchTabletReservas).not.toHaveBeenCalled()
    expect(screen.queryByTestId('reservalab-unit-ws1')).toBeNull()
  })
})
