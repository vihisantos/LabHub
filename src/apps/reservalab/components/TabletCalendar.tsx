import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Tablet as TabletIcon, User } from 'lucide-react'
import { cn } from '../../../lib/components/ui/utils'
import type { TabletReserva } from '../types'

export interface CalendarDay {
  date: string
  day: number
  isToday: boolean
  isOther: boolean
  items: TabletReserva[]
}

interface TabletCalendarProps {
  calYear: number
  calMonth: number
  selectedDay: string | null
  calendarDays: CalendarDay[]
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  onSelectDay: (date: string | null) => void
  selectedDayItems: TabletReserva[]
  loadingCalendar: boolean
  formatTime: (iso: string) => string
  onSelectReservation?: (reservation: TabletReserva) => void
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function formatDateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).replace('-feira', '')
}

export function TabletCalendar({
  calYear,
  calMonth,
  selectedDay,
  calendarDays,
  onPrevMonth,
  onNextMonth,
  onToday,
  onSelectDay,
  selectedDayItems,
  loadingCalendar,
  formatTime,
  onSelectReservation,
}: TabletCalendarProps) {
  const todayKey = new Date().toISOString().slice(0, 10)
  const isCurrentMonth =
    new Date().getFullYear() === calYear && new Date().getMonth() === calMonth

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-line bg-card/60 backdrop-blur-xl"
    >
      <div className="border-b border-line p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fg">Calendário de reservas</h3>
          <button
            type="button"
            onClick={onToday}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-all',
              isCurrentMonth
                ? 'bg-input text-fg-dim cursor-default'
                : 'bg-indigo-600/10 text-indigo-600 hover:bg-indigo-600/20 dark:text-indigo-400'
            )}
          >
            Hoje
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onPrevMonth}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-dim hover:bg-input hover:text-fg transition-colors"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold capitalize text-fg">
            {MONTHS[calMonth]} {calYear}
          </span>
          <button
            type="button"
            onClick={onNextMonth}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-dim hover:bg-input hover:text-fg transition-colors"
            aria-label="Próximo mês"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1 text-center text-[10px] font-semibold uppercase text-fg-dim">
              {d}
            </div>
          ))}
        </div>
      </div>

      <div className="p-4">
        {loadingCalendar ? (
          <div className="flex flex-col items-center justify-center py-10 text-fg-muted">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="mt-2 text-xs">Carregando reservas...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((d, i) =>
                d.isOther ? (
                  <div key={i} />
                ) : (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => onSelectDay(selectedDay === d.date ? null : d.date)}
                    className={cn(
                      'relative flex min-h-11 flex-col items-center justify-center rounded-lg py-1 text-xs font-medium transition-all',
                      selectedDay === d.date
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : d.isToday
                          ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/15'
                          : 'text-fg hover:bg-input'
                    )}
                  >
                    <span>{d.day}</span>
                    {d.items.length > 0 && (
                      <div className="mt-0.5 flex max-w-[18px] flex-wrap items-center justify-center gap-0.5">
                        {d.items.slice(0, 3).map((r) => (
                          <span
                            key={r.id}
                            className={cn(
                              'h-1 w-1 rounded-full',
                              r.horario_inicio < new Date().toISOString() ? 'bg-fg-muted' : 'bg-indigo-500',
                              selectedDay === d.date && 'bg-white'
                            )}
                          />
                        ))}
                        {d.items.length > 3 && (
                          <span
                            className={cn(
                              'text-[8px] leading-none font-bold',
                              selectedDay === d.date ? 'text-white' : 'text-indigo-500'
                            )}
                          >
                            +{d.items.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                )
              )}
            </div>

            <AnimatePresence>
              {selectedDay && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="mt-5 border-t border-line pt-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-dim capitalize">
                      {formatDateLabel(selectedDay)}
                    </h4>
                    <span className="text-xs font-medium text-fg-muted">
                      {selectedDayItems.length} {selectedDayItems.length === 1 ? 'reserva' : 'reservas'}
                    </span>
                  </div>

                  {selectedDayItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line py-8 text-center">
                      <TabletIcon size={24} className="text-fg-muted opacity-50" />
                      <p className="mt-2 text-xs text-fg-muted">Nenhuma reserva de tablets neste dia</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {selectedDayItems.map((r) => (
                        <DayReservationRow
                          key={r.id}
                          reservation={r}
                          formatTime={formatTime}
                          onClick={onSelectReservation ? () => onSelectReservation(r) : undefined}
                        />
                      ))}
                    </div>
                  )}

                  {selectedDay === todayKey && !isCurrentMonth && (
                    <p className="mt-3 text-center text-[11px] text-fg-muted">
                      Este dia pertence a outro mês.
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </motion.div>
  )
}

function DayReservationRow({ reservation, formatTime, onClick }: { reservation: TabletReserva; formatTime: (iso: string) => string; onClick?: () => void }) {
  const row = (
    <div className={cn(
      'flex items-center gap-3 rounded-xl border border-line bg-card/60 p-3',
      onClick && 'cursor-pointer transition-colors hover:bg-input'
    )}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600/10">
        <TabletIcon size={16} className="text-indigo-600 dark:text-indigo-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">{reservation.sala}</p>
        <p className="text-xs text-fg-dim">
          {formatTime(reservation.horario_inicio)} — {formatTime(reservation.horario_fim)}
          {reservation.professor && <span> · {reservation.professor}</span>}
        </p>
        {(reservation.finalidade || reservation.reservado_por) && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-muted">
            {reservation.reservado_por && (
              <span className="flex items-center gap-1">
                <User size={10} className="inline" />
                {reservation.reservado_por}
              </span>
            )}
            {reservation.reservado_por && reservation.finalidade && <span>·</span>}
            {reservation.finalidade}
          </p>
        )}
      </div>
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
          reservation.horario_inicio < new Date().toISOString()
            ? 'bg-fg-muted/10 text-fg-muted'
            : 'bg-indigo-600/10 text-indigo-600 dark:text-indigo-400'
        )}
      >
        {reservation.horario_inicio < new Date().toISOString() ? 'Passada' : 'Ativa'}
      </span>
    </div>
  )

  if (!onClick) return row
  return (
    <button type="button" onClick={onClick} className="w-full rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
      {row}
    </button>
  )
}
