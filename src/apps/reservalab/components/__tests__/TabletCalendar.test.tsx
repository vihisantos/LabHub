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
      isPast: date < '2026-06-25',
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
  onSelectReservation = vi.fn(),
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
  onSelectReservation: (reservation: TabletReserva) => void
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
      onSelectReservation={onSelectReservation}
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

  it('chama onSelectReservation ao clicar num evento do dia', () => {
    const onSelectReservation = vi.fn()
    const reserva = makeReserva()
    renderCalendar({ selectedDay: '2026-06-25', selectedDayItems: [reserva], onSelectReservation })
    fireEvent.click(screen.getByText('Sala 1'))
    expect(onSelectReservation).toHaveBeenCalledTimes(1)
    expect(onSelectReservation).toHaveBeenCalledWith(reserva)
  })

  describe('dias passados em cinza, hoje destacado (Issue #388)', () => {
    const dayButton = (label: string) => screen.getByText(label).closest('button') as HTMLButtonElement

    it('aplica fundo cinza discreto nos dias passados, sem desabilitar', () => {
      renderCalendar()
      const passado = dayButton('10')
      expect(passado.getAttribute('data-past')).toBe('true')
      expect(passado.className).toContain('bg-fg-muted/10')
      expect(passado.className).toContain('text-fg-muted')
      // Continua clicável — NÃO usamos `disabled` só para acinzentar.
      expect(passado).not.toBeDisabled()
    })

    it('mantém o dia passado clicável (seleção funciona)', () => {
      const onSelectDay = vi.fn()
      renderCalendar({ onSelectDay })
      fireEvent.click(dayButton('10'))
      expect(onSelectDay).toHaveBeenCalledWith('2026-06-10')
    })

    it('mantém o destaque distinto de HOJE (não fica cinza)', () => {
      renderCalendar()
      const hoje = dayButton('25')
      expect(hoje.getAttribute('data-today')).toBe('true')
      expect(hoje.className).toContain('bg-indigo-500/10')
      expect(hoje.className).not.toContain('bg-fg-muted/10')
    })

    it('não acinzenta dias futuros', () => {
      renderCalendar()
      const futuro = dayButton('26')
      expect(futuro.getAttribute('data-past')).toBeNull()
      expect(futuro.className).not.toContain('bg-fg-muted/10')
    })

    it('mantém os indicadores de reserva visíveis em dia passado', () => {
      const days = makeCalendarDays()
      const dia10 = days.find((d) => d.date === '2026-06-10')!
      dia10.items = [makeReserva()]
      renderCalendar({ calendarDays: days })
      const passado = dayButton('10')
      expect(passado.getAttribute('data-past')).toBe('true')
      // O pontinho de reserva continua renderizado no dia passado.
      expect(passado.querySelectorAll('.rounded-full').length).toBeGreaterThan(0)
    })

    it('o cinza não depende de haver reservas (dia passado vazio continua cinza)', () => {
      renderCalendar()
      const passadoVazio = dayButton('10')
      expect(passadoVazio.getAttribute('data-past')).toBe('true')
      expect(passadoVazio.className).toContain('bg-fg-muted/10')
    })

    it('mantém dias de outro mês como espaços diferenciados (sem botão)', () => {
      const days = makeCalendarDays()
      days.unshift({ date: '', day: 0, isToday: false, isPast: false, isOther: true, items: [] })
      renderCalendar({ calendarDays: days })
      // 30 dias reais + 1 placeholder → só os 30 reais viram botão.
      expect(screen.getAllByTestId('tablet-calendar-day')).toHaveLength(30)
    })
  })
})