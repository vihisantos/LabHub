import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TabletsView } from '../Tablets'

// Mock services
vi.mock('../../services/supabase', () => ({
  fetchTabletReservas: vi.fn(),
  fetchAllTabletReservas: vi.fn(),
  createTabletReserva: vi.fn(),
  updateTabletReserva: vi.fn(),
  deleteTabletReserva: vi.fn(),
  checkTabletCapacity: vi.fn().mockResolvedValue(null),
}))

// Mock useIsMobile
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}))

// Workspace fixo para validar o isolamento (fetchAllTabletReservas recebe o id).
vi.mock('../../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: { id: 'ws-test', name: 'Campus Teste', slug: 'campus-teste' } }),
}))

// RBAC 2.0: controla useCanAccessAction por teste (default = concedido).
const { mockUseCanAccessAction } = vi.hoisted(() => ({ mockUseCanAccessAction: vi.fn() }))
vi.mock('../../../../core/permissions/usePermissions', () => ({
  useAppAccess: () => ({
    getLevel: () => 'full',
    canAccessApp: () => true,
    isFullAccess: () => true,
    role: undefined,
  }),
  useCanAccessAction: (..._args: unknown[]) => mockUseCanAccessAction(..._args),
}))

// Mock TimeInput
vi.mock('../../components/TimeInput', () => ({
  TimeInput: ({ label, value, onChange, placeholder }: any) => (
    <div data-testid="time-input">
      <label>{label}</label>
      <input
        data-testid={`time-input-${label}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}))

// Mock modais
vi.mock('../../components/CancelReservationModal', () => ({
  CancelReservationModal: ({ onConfirm }: any) => (
    <div data-testid="cancel-reservation-modal">
      <button onClick={onConfirm}>Confirmar cancelamento</button>
    </div>
  ),
}))

vi.mock('../../components/TabletModal', () => ({
  TabletModal: () => <div data-testid="tablet-modal" />,
}))

import {
  fetchTabletReservas,
  fetchAllTabletReservas,
  deleteTabletReserva,
  createTabletReserva,
  checkTabletCapacity,
} from '../../services/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'

const mockReservas = [
  { id: '11111111-1111-4111-8111-111111111111', sala: 'Sala 1', quantidade_tablets: 10, professor: 'Prof. Ana', horario_inicio: new Date(Date.now() + 1000).toISOString(), horario_fim: new Date(Date.now() + 7200000).toISOString(), finalidade: 'Aula prática', reservado_por: 'Maria', status: 'ativa' },
  { id: '22222222-2222-4222-8222-222222222222', sala: 'Sala 2', quantidade_tablets: 5, professor: 'Prof. Carlos', horario_inicio: new Date(Date.now() + 1000).toISOString(), horario_fim: new Date(Date.now() + 3600000).toISOString(), finalidade: 'Prova', reservado_por: 'João', status: 'ativa' },
]

function renderTablets() {
  return render(
    <MemoryRouter>
      <TabletsView />
    </MemoryRouter>,
  )
}

describe('TabletsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCanAccessAction.mockReturnValue({ allowed: true, loading: false })
    vi.useRealTimers()
    ;(fetchTabletReservas as any).mockResolvedValue(mockReservas)
    ;(fetchAllTabletReservas as any).mockResolvedValue(mockReservas)
    ;(checkTabletCapacity as any).mockResolvedValue(null)
    ;(useIsMobile as any).mockReturnValue(false)
  })

  afterEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-25T12:00:00Z'))
  })

  it('renderiza título "Reserva de Tablets" após carregar', async () => {
    renderTablets()
    expect(await screen.findByText('Reserva de Tablets')).toBeInTheDocument()
  })

  it('exibe contagem de reservas hoje', async () => {
    renderTablets()
    await waitFor(() => {
      expect(screen.getByText(/2 reservas/)).toBeInTheDocument()
    })
  })

  it('renderiza botão "Nova reserva"', async () => {
    renderTablets()
    expect(await screen.findByText('Nova reserva')).toBeInTheDocument()
  })

  it('abre formulário ao clicar em "Nova reserva"', async () => {
    renderTablets()
    const btn = await screen.findByText('Nova reserva')
    fireEvent.click(btn)
    await waitFor(() => {
      expect(screen.getByText('Criar Reserva')).toBeInTheDocument()
    })
  })

  it('fecha formulário ao clicar em "Fechar"', async () => {
    renderTablets()
    const btn = await screen.findByText('Nova reserva')
    fireEvent.click(btn)
    expect(await screen.findByText('Criar Reserva')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Fechar'))
    await waitFor(() => {
      expect(screen.queryByText('Criar Reserva')).not.toBeInTheDocument()
    })
  })

  it('exibe botão "Cancelar" para cada reserva', async () => {
    renderTablets()
    const cancelBtns = await screen.findAllByText('Cancelar')
    expect(cancelBtns.length).toBe(2)
  })

  it('abre modal de confirmação ao clicar em "Cancelar"', async () => {
    renderTablets()
    const cancelBtns = await screen.findAllByText('Cancelar')
    fireEvent.click(cancelBtns[0])
    await waitFor(() => {
      expect(screen.getByTestId('cancel-reservation-modal')).toBeInTheDocument()
    })
  })

  it('remove reserva somente após confirmar no modal', async () => {
    ;(deleteTabletReserva as any).mockResolvedValue(undefined)
    renderTablets()
    const cancelBtns = await screen.findAllByText('Cancelar')
    fireEvent.click(cancelBtns[0])
    fireEvent.click(screen.getByText('Confirmar cancelamento'))
    await waitFor(() => {
      expect(deleteTabletReserva).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    })
  })

  it('exibe nome da sala nas reservas', async () => {
    renderTablets()
    expect(await screen.findByText('Sala 1')).toBeInTheDocument()
    expect(await screen.findByText('Sala 2')).toBeInTheDocument()
  })

  it('exibe nome do professor nas reservas', async () => {
    renderTablets()
    await waitFor(() => {
      expect(screen.getByText(/Prof. Ana/)).toBeInTheDocument()
    })
  })

  it('exibe campo de formulário Sala ao abrir', async () => {
    renderTablets()
    fireEvent.click(await screen.findByText('Nova reserva'))
    expect(await screen.findByPlaceholderText('Digite ou selecione uma sala')).toBeInTheDocument()
  })

  it('exibe campo de formulário Professor ao abrir', async () => {
    renderTablets()
    fireEvent.click(await screen.findByText('Nova reserva'))
    expect(await screen.findByPlaceholderText('Nome do professor')).toBeInTheDocument()
  })

  it('exibe campo de formulário Data (input type=date) ao abrir', async () => {
    renderTablets()
    fireEvent.click(await screen.findByText('Nova reserva'))
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    expect(dateInput).toBeInTheDocument()
  })

  it('exibe TimeInput para início e fim', async () => {
    renderTablets()
    fireEvent.click(await screen.findByText('Nova reserva'))
    const timeInputs = screen.getAllByTestId('time-input')
    expect(timeInputs.length).toBeGreaterThanOrEqual(2)
  })

  it('mostra "Todas" quando há reservas fora de hoje', async () => {
    const manyReservas = Array.from({ length: 10 }, (_, i) => ({
      id: `res-${i + 1}`,
      sala: `Sala ${i + 1}`,
      quantidade_tablets: 1,
      professor: `Prof. ${i}`,
      horario_inicio: new Date(Date.now() + i * 86400000).toISOString(),
      horario_fim: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
      finalidade: '',
      reservado_por: '',
      status: 'ativa',
    }))
    ;(fetchAllTabletReservas as any).mockResolvedValue(manyReservas)
    renderTablets()
    expect(await screen.findByText('Todas')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Todas'))
    await waitFor(() => {
      expect(screen.getByText('Só hoje')).toBeInTheDocument()
    })
  })

  it('exibe estado vazio quando não há reservas', async () => {
    ;(fetchAllTabletReservas as any).mockResolvedValue([])
    renderTablets()
    expect(await screen.findByText('Nenhuma reserva encontrada')).toBeInTheDocument()
  })

  it('lida com erro na API sem quebrar', async () => {
    ;(fetchAllTabletReservas as any).mockRejectedValue(new Error('Erro'))
    renderTablets()
    expect(await screen.findByText('Nenhuma reserva encontrada')).toBeInTheDocument()
  })

  it('oculta "Nova reserva" quando a Action reservelab.tablet.reserve nega', async () => {
    mockUseCanAccessAction.mockImplementation((action: string) =>
      action === 'reservelab.tablet.reserve'
        ? { allowed: false, loading: false }
        : { allowed: true, loading: false },
    )
    renderTablets()
    await waitFor(() => {
      expect(screen.queryByText('Nova reserva')).not.toBeInTheDocument()
    })
  })

  it('oculta editar/cancelar quando a Action reservelab.tablet.cancel nega', async () => {
    mockUseCanAccessAction.mockImplementation((action: string) =>
      action === 'reservelab.tablet.cancel'
        ? { allowed: false, loading: false }
        : { allowed: true, loading: false },
    )
    renderTablets()
    await waitFor(() => {
      expect(screen.queryAllByText('Cancelar').length).toBe(0)
    })
    expect(screen.queryAllByText('Editar').length).toBe(0)
  })

  describe('histórico completo, dias passados e edição (Issue #388)', () => {
    const iso = (offsetDays: number, hour = 10) => {
      const d = new Date()
      d.setDate(d.getDate() + offsetDays)
      d.setHours(hour, 0, 0, 0)
      return d.toISOString()
    }
    const makeReserva = (over: Record<string, unknown>) => ({
      id: String(over.id),
      sala: 'Sala Hist',
      quantidade_tablets: 2,
      professor: 'Prof. Hist',
      finalidade: '',
      reservado_por: 'Eu',
      status: 'ativa',
      ...over,
    })

    it('busca o histórico completo no workspace ativo (isolamento)', async () => {
      renderTablets()
      await waitFor(() => {
        expect(fetchAllTabletReservas).toHaveBeenCalledWith('ws-test')
      })
    })

    it('exibe reserva PASSADA ao acionar "Todas"', async () => {
      ;(fetchAllTabletReservas as any).mockResolvedValue([
        makeReserva({ id: 'passada', sala: 'Sala Passada', horario_inicio: iso(-10), horario_fim: iso(-9) }),
      ])
      renderTablets()
      fireEvent.click(await screen.findByText('Todas'))
      expect(await screen.findByText('Sala Passada')).toBeInTheDocument()
    })

    it('exibe reserva de HOJE na listagem padrão', async () => {
      ;(fetchAllTabletReservas as any).mockResolvedValue([
        makeReserva({ id: 'hoje', sala: 'Sala Hoje', horario_inicio: iso(0, 8), horario_fim: iso(0, 23) }),
      ])
      renderTablets()
      expect(await screen.findByText('Sala Hoje')).toBeInTheDocument()
    })

    it('exibe reserva futura além de 90 dias (sem corte fixo)', async () => {
      ;(fetchAllTabletReservas as any).mockResolvedValue([
        makeReserva({ id: 'futura', sala: 'Sala 200 dias', horario_inicio: iso(200), horario_fim: iso(200, 12) }),
      ])
      renderTablets()
      fireEvent.click(await screen.findByText('Todas'))
      expect(await screen.findByText('Sala 200 dias')).toBeInTheDocument()
    })

    it('mostra "Nenhuma reserva hoje" (e mantém "Todas") quando só há histórico', async () => {
      ;(fetchAllTabletReservas as any).mockResolvedValue([
        makeReserva({ id: 'passada2', sala: 'Sala Antiga', horario_inicio: iso(-3), horario_fim: iso(-2) }),
      ])
      renderTablets()
      expect(await screen.findByText('Nenhuma reserva hoje')).toBeInTheDocument()
      expect(screen.getByText('Todas')).toBeInTheDocument()
    })

    it('NÃO permite editar reserva já encerrada (destaque histórico)', async () => {
      ;(fetchAllTabletReservas as any).mockResolvedValue([
        makeReserva({ id: 'encerrada', sala: 'Sala Encerrada', horario_inicio: iso(-5), horario_fim: iso(-5, 11) }),
      ])
      renderTablets()
      fireEvent.click(await screen.findByText('Todas'))
      await screen.findByText('Sala Encerrada')
      expect(screen.queryByText('Editar')).not.toBeInTheDocument()
      // Cancelar continua disponível (regra de cancelamento da 050/078 inalterada).
      expect(screen.getByText('Cancelar')).toBeInTheDocument()
    })

    it('permite editar reserva futura (horario_fim não passou)', async () => {
      ;(fetchAllTabletReservas as any).mockResolvedValue([
        makeReserva({ id: 'futura2', sala: 'Sala Futura', horario_inicio: iso(1), horario_fim: iso(1, 12) }),
      ])
      renderTablets()
      fireEvent.click(await screen.findByText('Todas'))
      await screen.findByText('Sala Futura')
      expect(screen.getByText('Editar')).toBeInTheDocument()
    })

    it('atualiza lista e calendário após criar reserva (sem reload)', async () => {
      ;(fetchAllTabletReservas as any).mockResolvedValue([])
      ;(createTabletReserva as any).mockResolvedValue(undefined)

      renderTablets()
      fireEvent.click(await screen.findByText('Nova reserva'))

      fireEvent.change(await screen.findByPlaceholderText('Digite ou selecione uma sala'), { target: { value: 'Sala 1' } })
      fireEvent.change(screen.getByPlaceholderText('Nome do professor'), { target: { value: 'Prof. X' } })
      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      fireEvent.change(dateInput, { target: { value: '2026-07-10' } })
      fireEvent.change(screen.getByTestId('time-input-Horário início'), { target: { value: '08h00' } })
      fireEvent.change(screen.getByTestId('time-input-Horário fim'), { target: { value: '09h00' } })

      const callsBefore = (fetchAllTabletReservas as any).mock.calls.length
      fireEvent.click(screen.getByText('Criar Reserva'))

      await waitFor(() => {
        expect(createTabletReserva).toHaveBeenCalled()
      })
      // Refresh: a listagem é reconsultada (e o calendário também).
      await waitFor(() => {
        expect((fetchAllTabletReservas as any).mock.calls.length).toBeGreaterThan(callsBefore)
      })
    })
  })
})
