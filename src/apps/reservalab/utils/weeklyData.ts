import { diasSemana } from './timeUtils'
import { getLabDisplayName } from './labUtils'
import type { LaboratorioReserva, WeekDayData } from '../types'

type DayReservation = WeekDayData['reservations'][number]

const DEFAULT_LIMIT = 30

function parseBrDate(value: string): number {
  const [dia, mes, ano] = value.split('/').map(Number)
  return new Date(ano, mes - 1, dia).getTime()
}

/**
 * Monta os dias do calendário (lab + tablet) ORDENADOS por data crescente e
 * limitados a `limit` dias (default 30). Antes a ordem vinha do agrupamento,
 * o que produzia sequências como 16/09, 18/09, 17/09.
 */
export function buildWeeklyData(
  reservasSemana: LaboratorioReserva[] | undefined,
  tabletWeekData: WeekDayData[],
  limit = DEFAULT_LIMIT,
): WeekDayData[] {
  const grouped: Record<string, DayReservation[]> = {}

  for (const r of reservasSemana || []) {
    if (!r.data) continue
    if (!grouped[r.data]) grouped[r.data] = []
    grouped[r.data].push({
      tipo: 'lab',
      lab: getLabDisplayName(r.lab) || r.lab,
      time: r.horario,
      subject: r.responsavel || r.observacao || 'Disciplina',
      professor: r.responsavel,
      reservaFeitaPor: r.reserva_feita_por || '',
      observacao: r.observacao || '',
    })
  }

  for (const day of tabletWeekData) {
    if (!grouped[day.date]) grouped[day.date] = []
    for (const r of day.reservations) {
      grouped[day.date].push({
        tipo: 'tablet',
        lab: r.lab,
        time: r.time,
        subject: r.subject,
        professor: r.professor,
        reservaFeitaPor: r.reservaFeitaPor,
        observacao: r.observacao || '',
      })
    }
  }

  return Object.entries(grouped)
    .sort(([a], [b]) => parseBrDate(a) - parseBrDate(b))
    .map(([date, reservations]) => {
      const [dia, mes, ano] = date.split('/').map(Number)
      return {
        date,
        dayName: diasSemana[new Date(ano, mes - 1, dia).getDay()],
        reservations,
      }
    })
    .slice(0, limit)
}
