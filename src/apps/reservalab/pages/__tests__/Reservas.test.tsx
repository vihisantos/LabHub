import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ReservasView } from '../Reservas'

// Mock services
vi.mock('../../services/api', () => ({
  fetchReservas: vi.fn(),
}))

vi.mock('../../services/supabase', () => ({
  fetchTabletReservas: vi.fn(),
}))

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, transition, exit, layout, ...rest } = props
      return <div {...rest}>{children}</div>
    },
    button: ({ children, ...props }: any) => {
      const { initial, animate, transition, whileHover, whileTap, ...rest } = props
      return <button {...rest}>{children}</button>
    },
    h2: ({ children, ...props }: any) => {
      const { initial, animate, transition, ...rest } = props
      return <h2 {...rest}>{children}</h2>
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Mock child components
vi.mock('../../components/ReservationCard', () => ({
  ReservationCard: ({ reservation, onClick }: any) => (
    <div data-testid="reservation-card" onClick={() => onClick(reservation)}>
      {reservation.subject} - {reservation.time}
    </div>
  ),
}))

vi.mock('../../components/ReservationModal', () => ({
  ReservationModal: ({ reservation, onClose }: any) => (
    <div data-testid="reservation-modal">
      <span>{reservation.subject}</span>
      <button onClick={onClose}>Fechar</button>
    </div>
  ),
}))

vi.mock('../../components/TabletReservationCard', () => ({
  TabletReservationCard: ({ reservation, onClick }: any) => (
    <div data-testid="tablet-card" onClick={() => onClick(reservation)}>
      {reservation.sala}
    </div>
  ),
}))

vi.mock('../../components/TabletModal', () => ({
  TabletModal: ({ reservation, onClose }: any) => (
    <div data-testid="tablet-modal">
      <span>{reservation.sala}</span>
      <button onClick={onClose}>Fechar</button>
    </div>
  ),
}))

vi.mock('../../components/WeeklyCalendar', () => ({
  WeeklyCalendar: ({ weekData }: any) => (
    <div data-testid="weekly-calendar">
      {weekData.length} dias
    </div>
  ),
}))

import { fetchReservas } from '../../services/api'
import { fetchTabletReservas } from '../../services/supabase'

const mockReservasData = {
  lab1_reservas: [
    { horario: '07h30', responsavel: 'Prof. Silva', observacao: 'Matemática', reserva_feita_por: 'João', alunos: '30', labs: ['LAB01'], lab: 'LAB01', data: '29/06/2026' },
    { horario: '09h30', responsavel: 'Prof. Ana', observacao: 'Física', reserva_feita_por: '', alunos: '25', labs: ['LAB01'], lab: 'LAB01', data: '29/06/2026' },
  ],
  lab2_reservas: [
    { horario: '13h30', responsavel: 'Prof. Carlos', observacao: 'Química', reserva_feita_por: 'Pedro', alunos: '20', labs: ['LAB02'], lab: 'LAB02', data: '29/06/2026' },
  ],
  reservas_semana: [],
}

const mockTabletReservas = [
  { id: 1, sala: 'Sala 1', quantidade_tablets: 10, professor: 'Prof. Ana', horario_inicio: new Date(Date.now() + 1000).toISOString(), horario_fim: new Date(Date.now() + 7200000).toISOString(), finalidade: 'Aula prática', reservado_por: 'Maria', status: 'ativa' },
]

function renderReservas() {
  return render(
    <MemoryRouter>
      <ReservasView />
    </MemoryRouter>,
  )
}

describe('ReservasView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    ;(fetchReservas as any).mockResolvedValue(mockReservasData)
    ;(fetchTabletReservas as any).mockResolvedValue(mockTabletReservas)
  })

  afterEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-25T12:00:00Z'))
  })

  it('renderiza o título principal', async () => {
    renderReservas()
    expect(await screen.findByText('Gestão inteligente de laboratórios')).toBeInTheDocument()
  })

  it('exibe o subtítulo da página', async () => {
    renderReservas()
    expect(await screen.findByText(/Consulte a disponibilidade em tempo real/)).toBeInTheDocument()
  })

  it('renderiza seção Lab 01', async () => {
    renderReservas()
    // "Lab 01" aparece no título e no texto decorativo de fundo
    const lab01Elements = await screen.findAllByText('Lab 01')
    expect(lab01Elements.length).toBeGreaterThanOrEqual(1)
  })

  it('renderiza seção Lab 02', async () => {
    renderReservas()
    const lab02Elements = await screen.findAllByText('Lab 02')
    expect(lab02Elements.length).toBeGreaterThanOrEqual(1)
  })

  it('exibe reservas de tablets', async () => {
    renderReservas()
    expect(await screen.findByText('Reserva de Tablets')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('tablet-card')).toBeInTheDocument()
    })
  })

  it('exibe calendário semanal (WeeklyCalendar)', async () => {
    renderReservas()
    expect(await screen.findByTestId('weekly-calendar')).toBeInTheDocument()
  })

  it('exibe filtros de período nas seções de lab', async () => {
    renderReservas()
    // "Manhã" aparece em Lab 01 e Lab 02
    const manhaBtns = await screen.findAllByText('Manhã')
    expect(manhaBtns.length).toBe(2)
    const tardeBtns = screen.getAllByText('Tarde')
    expect(tardeBtns.length).toBe(2)
    const noiteBtns = screen.getAllByText('Noite')
    expect(noiteBtns.length).toBe(2)
  })

  it('abre modal de detalhes ao clicar em uma reserva', async () => {
    renderReservas()
    const cards = await screen.findAllByTestId('reservation-card')
    fireEvent.click(cards[0])
    await waitFor(() => {
      expect(screen.getByTestId('reservation-modal')).toBeInTheDocument()
    })
  })

  it('fecha modal de detalhes', async () => {
    renderReservas()
    const cards = await screen.findAllByTestId('reservation-card')
    fireEvent.click(cards[0])
    expect(await screen.findByTestId('reservation-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Fechar'))
    await waitFor(() => {
      expect(screen.queryByTestId('reservation-modal')).not.toBeInTheDocument()
    })
  })

  it('abre modal de tablet ao clicar em um card de tablet', async () => {
    renderReservas()
    const tabletCards = await screen.findAllByTestId('tablet-card')
    fireEvent.click(tabletCards[0])
    await waitFor(() => {
      expect(screen.getByTestId('tablet-modal')).toBeInTheDocument()
    })
  })

  it('fecha modal de tablet', async () => {
    renderReservas()
    const tabletCards = await screen.findAllByTestId('tablet-card')
    fireEvent.click(tabletCards[0])
    expect(await screen.findByTestId('tablet-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Fechar'))
    await waitFor(() => {
      expect(screen.queryByTestId('tablet-modal')).not.toBeInTheDocument()
    })
  })

  it('exibe "Nenhuma reserva encontrada" quando não há reservas', async () => {
    ;(fetchReservas as any).mockResolvedValue({ lab1_reservas: [], lab2_reservas: [], reservas_semana: [] })
    renderReservas()
    // "Nenhuma reserva encontrada" aparece em cada seção vazia (Lab 01, Lab 02, Tablets)
    const emptyMessages = await screen.findAllByText('Nenhuma reserva encontrada')
    expect(emptyMessages.length).toBeGreaterThanOrEqual(1)
  })

  it('exibe contagem de reservas de tablets', async () => {
    renderReservas()
    await waitFor(() => {
      expect(screen.getByText(/1 reserva/)).toBeInTheDocument()
    })
  })

  it('filtra reservas por período no Lab 01', async () => {
    renderReservas()
    const lab01Elements = await screen.findAllByText('Lab 01')
    expect(lab01Elements.length).toBeGreaterThanOrEqual(1)

    // Clica em "Tarde" no primeiro FigmaLabSection (Lab 01)
    const tardeBtns = screen.getAllByText('Tarde')
    fireEvent.click(tardeBtns[0])

    await waitFor(() => {
      // Lab 01 tem reservas só de manhã, então "Tarde" deve mostrar vazio
      const emptyMessages = screen.getAllByText('Nenhuma reserva encontrada')
      expect(emptyMessages.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('lida com erro na API sem quebrar', async () => {
    ;(fetchReservas as any).mockRejectedValue(new Error('API error'))
    ;(fetchTabletReservas as any).mockRejectedValue(new Error('API error'))
    renderReservas()
    expect(await screen.findByText('Gestão inteligente de laboratórios')).toBeInTheDocument()
  })
})
