import { parseHorario } from './timeUtils'
import type { TabletReserva } from '../types'

export interface LabReservationLike {
  label: string
  horario: string
  responsavel?: string
}

export interface UpcomingCandidate {
  key: string
  kind: 'lab' | 'tablet'
  label: string
  timeLabel: string
  professor?: string
  /** Minutos até o início (0 = começa agora). */
  startsIn: number
}

/**
 * Seleciona a próxima reserva (lab ou tablet) que começa dentro de
 * `windowMinutes`. Retorna null se nenhuma estiver na janela.
 *
 * Compartilhado pelo banner in-app do ReservaLab e pelo pop-up da tela inicial.
 */
export function pickUpcomingReservation(
  labReservas: LabReservationLike[],
  tabletReservas: TabletReserva[],
  windowMinutes = 30,
  now: Date = new Date(),
): UpcomingCandidate | null {
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const candidates: UpcomingCandidate[] = [
    ...labReservas.flatMap((r) => {
      const inicio = parseHorario(r.horario).inicio
      if (inicio === null) return []
      return [{
        key: `lab|${r.label}|${r.horario}|${r.responsavel || ''}`,
        kind: 'lab' as const,
        label: r.label,
        timeLabel: r.horario,
        professor: r.responsavel,
        startsIn: inicio - nowMin,
      }]
    }),
    ...tabletReservas.map((r) => {
      const d = new Date(r.horario_inicio)
      const inicio = d.getHours() * 60 + d.getMinutes()
      return {
        key: `tablet|${r.id}`,
        kind: 'tablet' as const,
        label: r.sala,
        timeLabel: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        professor: r.professor,
        startsIn: inicio - nowMin,
      }
    }),
  ].filter((c) => c.startsIn >= 0 && c.startsIn <= windowMinutes)

  if (candidates.length === 0) return null
  return candidates.reduce((a, b) => (a.startsIn <= b.startsIn ? a : b))
}
