import type { TicketPriority, TicketStatus } from '../types'
import { getPriority, getSlaHours, isTicketOpen } from '../services/sla'

export interface RoomRiskTicket {
  roomName: string
  status: string
  priority?: TicketPriority
  createdAt: string
  resolvedAt: string | null
  workspaceId?: string | null
}

export interface RoomRiskRow {
  room: string
  total: number
  highPriority: number
  urgent: number
  overdue: number
  score: number
}

/**
 * Classifica salas por volume, urgência e violações de SLA.
 * Pontuação: 1 por chamado, +2 por prioridade alta, +4 por urgente e +3 por fora do SLA.
 */
export function rankProblemRooms(
  byRoom: [string, number][],
  tickets: RoomRiskTicket[],
  configs: Record<string, Record<TicketPriority, number>>,
  now = Date.now(),
): RoomRiskRow[] {
  const rooms = new Map<string, RoomRiskRow>()
  const hasTicketDetails = tickets.length > 0
  for (const [room, total] of byRoom) {
    rooms.set(room, { room, total: hasTicketDetails ? 0 : total, highPriority: 0, urgent: 0, overdue: 0, score: total })
  }

  for (const ticket of tickets) {
    if (!ticket.roomName) continue
    const row = rooms.get(ticket.roomName) ?? {
      room: ticket.roomName,
      total: 0,
      highPriority: 0,
      urgent: 0,
      overdue: 0,
      score: 0,
    }
    rooms.set(ticket.roomName, row)
    if (hasTicketDetails) row.total += 1

    const priority = getPriority(ticket.priority)
    if (priority === 'alta') row.highPriority += 1
    if (priority === 'urgente') row.urgent += 1

    const slaHours = getSlaHours(priority, configs[ticket.workspaceId ?? ''])
    const createdAt = new Date(ticket.createdAt).getTime()
    const endedAt = ticket.resolvedAt
      ? new Date(ticket.resolvedAt).getTime()
      : isTicketOpen(ticket.status as TicketStatus) ? now : null
    if (slaHours > 0 && Number.isFinite(createdAt) && endedAt !== null && endedAt > createdAt + slaHours * 60 * 60 * 1000) {
      row.overdue += 1
    }
  }

  return [...rooms.values()]
    .map((row) => ({
      ...row,
      score: row.total + row.highPriority * 2 + row.urgent * 4 + row.overdue * 3,
    }))
    .sort((a, b) => b.score - a.score || b.overdue - a.overdue || b.urgent - a.urgent || b.total - a.total || a.room.localeCompare(b.room, 'pt-BR'))
}
