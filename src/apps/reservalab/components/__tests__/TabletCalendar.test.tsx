import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TabletCalendar, type CalendarDay } from '../TabletCalendar'
import type { TabletReserva } from '../../types'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock('lucide-react', () => ({
  ChevronLeft: () => <span>ChevronLeft</span>,
  ChevronRight: () => <span>ChevronRight</span>,
  Tablet: () => <span>TabletIcon</span>,
  User: () => <span>UserIcon</span>,
}))

const AGORA = new Date('2026-06-25T12:00:00Z')

const makeReserva = (over: Partial<TabletReserva> = {}): TabletReserva => ({
  id: '11111111-1111-4111-8111-111111111111',
  sala: 'Sala 1',
  quantidade_tablets: 10,
  professor: 'Prof. Ana',
  horario_inicio: '2026-06-25T15:00:00.000Z',
  horario_fim: '2026-06-25T16:00:00.000Z',
  finalidade: 'Aula prática',
  reservado_por: 'Maria',
  status: 'ativa',
  ...over,
})

function makeCalendarDays(): CalendarDay[] {
  const days: CalendarDay[] = []
  // Junho/2026 começa numa segunda-feira (getDay = 1), sem offset
  for (let d = 1; d <= 30; d++) {
    const date = `2026-06-${String(d).padStart(2, '0')}`
    days.push({
      date,
      day: d,
      isToday: date === AGORA.toISOString().slice(0, 10),
      isOther: false,
      items: d === 25 ? [makeReserva()] : [],
    })
  }
  return days
}

function renderCalendar({
  selectedDay = null,
  calendarDays = makeCalendarDays(),
  selectedDayItems = selectedDay ? [makeReserva()] : [],
  calYear = 2026,
  calMonth = 5,
  loadingCalendar = false,
  onSelectDay = vi.fn(),
  onPrevMonth = vi.fn(),
  onNextMonth = vi.fn(),
  onToday = vi.fn(),
  formatTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
}: Partial<{
  selectedDay: string | null
  calendarDays: CalendarDay[]
  selectedDayItems: TabletReserva[]
  calYear: number
  calMonth: number
  loadingCalendar: boolean
  onSelectDay: (date: string | null) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  formatTime: (iso: string) => string
}> = {}) {
  return render(
    <TabletCalendar
      calYear={calYear}
      calMonth={calMonth}
      selectedDay={selectedDay}
      calendarDays={calendarDays}
      onPrevMonth={onPrevMonth}
      onNextMonth={onNextMonth}
      onToday={onToday}
      onSelectDay={onSelectDay}
      selectedDayItems={selectedDayItems}
      loadingCalendar={loadingCalendar}
      formatTime={formatTime}
    />
  )
}

describe('TabletCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AGORA)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renderiza título "Calendário de reservas"', () => {
    renderCalendar()
    expect(screen.getByText('Calendário de reservas')).toBeInTheDocument()
  })

  it('renderiza o mês por extenso e o ano', () => {
    renderCalendar()
    expect(screen.getByText('Junho 2026')).toBeInTheDocument()
  })

  it('renderiza os dias da semana', () => {
    renderCalendar()
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    weekdays.forEach((d) => {
      expect(screen.getAllByText(d).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText(d)).toBeInTheDocument()
    })
  })

  it('renderiza os dias do mês', () => {
    renderCalendar()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('renderiza o botão "Hoje"', () => {
    renderCalendar()
    expect(screen.getByText('Hoje')).toBeInTheDocument()
  })

  it('chama onPrevMonth ao clicar no mês anterior', () => {
    const onPrevMonth = vi.fn()
    renderCalendar({ onPrevMonth })
    fireEvent.click(screen.getByLabelText('Mês anterior'))
    expect(onPrevMonth).toHaveBeenCalledTimes(1)
  })

  it('chama onNextMonth ao clicar no próximo mês', () => {
    const onNextMonth = vi.fn()
    renderCalendar({ onNextMonth })
    fireEvent.click(screen.getByLabelText('Próximo mês'))
    expect(onNextMonth).toHaveBeenCalledTimes(1)
  })

  it('chama onToday ao clicar no botão Hoje', () => {
    const onToday = vi.fn()
    renderCalendar({ onToday, calYear: 2025, calMonth: 0 })
    fireEvent.click(screen.getByText('Hoje'))
    expect(onToday).toHaveBeenCalledTimes(1)
  })

  it('chama onSelectDay ao clicar num dia', () => {
    const onSelectDay = vi.fn()
    renderCalendar({ onSelectDay })
    fireEvent.click(screen.getByText('10'))
    expect(onSelectDay).toHaveBeenCalledWith('2026-06-10')
  })

  it('exibe dia sem reservas selecionado com mensagem vazia', () => {
    renderCalendar({ selectedDay: '2026-06-10', selectedDayItems: [] })
    expect(screen.getByText('Nenhuma reserva de tablets neste dia')).toBeInTheDocument()
    expect(screen.getByText('0 reservas')).toBeInTheDocument()
  })

  it('exibe detalhes da reserva do dia selecionado', () => {
    renderCalendar({ selectedDay: '2026-06-25', selectedDayItems: [makeReserva()] })
    expect(screen.getByText('Sala 1')).toBeInTheDocument()
    expect(screen.getByText(/Prof\. Ana/)).toBeInTheDocument()
    expect(screen.getByText('Maria')).toBeInTheDocument()
    expect(screen.getByText('Aula prática')).toBeInTheDocument()
  })

  it('mostra spinner quando carregando', () => {
    renderCalendar({ loadingCalendar: true })
    expect(screen.getByText('Carregando reservas...')).toBeInTheDocument()
  })
})