import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TabletsView } from '../Tablets'

// Mock services
vi.mock('../../services/supabase', () => ({
  fetchTabletReservas: vi.fn(),
  createTabletReserva: vi.fn(),
  deleteTabletReserva: vi.fn(),
}))

// Mock useIsMobile
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
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

import { fetchTabletReservas, deleteTabletReserva } from '../../services/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'

const mockReservas = [
  { id: 1, sala: 'Sala 1', quantidade_tablets: 10, professor: 'Prof. Ana', horario_inicio: new Date(Date.now() + 1000).toISOString(), horario_fim: new Date(Date.now() + 7200000).toISOString(), finalidade: 'Aula prática', reservado_por: 'Maria', status: 'ativa' },
  { id: 2, sala: 'Sala 2', quantidade_tablets: 5, professor: 'Prof. Carlos', horario_inicio: new Date(Date.now() + 1000).toISOString(), horario_fim: new Date(Date.now() + 3600000).toISOString(), finalidade: 'Prova', reservado_por: 'João', status: 'ativa' },
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
    vi.useRealTimers()
    ;(fetchTabletReservas as any).mockResolvedValue(mockReservas)
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

  it('remove reserva ao clicar em "Cancelar"', async () => {
    ;(deleteTabletReserva as any).mockResolvedValue(undefined)
    renderTablets()
    const cancelBtns = await screen.findAllByText('Cancelar')
    fireEvent.click(cancelBtns[0])
    await waitFor(() => {
      expect(deleteTabletReserva).toHaveBeenCalledWith(1)
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

  it('alterna para "Todas" quando há mais de 5 reservas', async () => {
    const manyReservas = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      sala: `Sala ${i + 1}`,
      quantidade_tablets: 1,
      professor: `Prof. ${i}`,
      horario_inicio: new Date(Date.now() + i * 86400000).toISOString(),
      horario_fim: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
      finalidade: '',
      reservado_por: '',
      status: 'ativa',
    }))
    ;(fetchTabletReservas as any).mockResolvedValue(manyReservas)
    renderTablets()
    expect(await screen.findByText('Todas')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Todas'))
    await waitFor(() => {
      expect(screen.getByText('Só hoje')).toBeInTheDocument()
    })
  })

  it('exibe estado vazio quando não há reservas', async () => {
    ;(fetchTabletReservas as any).mockResolvedValue([])
    renderTablets()
    expect(await screen.findByText('Nenhuma reserva encontrada')).toBeInTheDocument()
  })

  it('lida com erro na API sem quebrar', async () => {
    ;(fetchTabletReservas as any).mockRejectedValue(new Error('Erro'))
    renderTablets()
    expect(await screen.findByText('Nenhuma reserva encontrada')).toBeInTheDocument()
  })
})
