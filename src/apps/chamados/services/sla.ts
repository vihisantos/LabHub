import type { TicketPriority, TicketStatus } from '../types'
import { DEFAULT_SLA_HOURS, TICKET_PRIORITIES } from '../types'

export type SlaState = 'ok' | 'near' | 'overdue'

const HOUR_MS = 1000 * 60 * 60

export function isTicketOpen(status: TicketStatus): boolean {
  return status === 'aberto' || status === 'a_caminho' || status === 'em_atendimento'
}

export function getPriority(priority?: TicketPriority): TicketPriority {
  return priority && TICKET_PRIORITIES.includes(priority) ? priority : 'normal'
}

export function getSlaHours(
  priority: TicketPriority | undefined,
  config?: Record<TicketPriority, number> | null,
): number {
  const p = getPriority(priority)
  const value = config?.[p]
  if (value === undefined || !Number.isFinite(value) || value < 0) return DEFAULT_SLA_HOURS[p]
  return value
}

export function computeSlaDeadline(createdAt: string, hours: number): Date {
  return new Date(new Date(createdAt).getTime() + hours * HOUR_MS)
}

export function getSlaRemainingMs(
  createdAt: string,
  priority: TicketPriority | undefined,
  config?: Record<TicketPriority, number> | null,
): number {
  const hours = getSlaHours(priority, config)
  if (hours <= 0) return 0
  return computeSlaDeadline(createdAt, hours).getTime() - Date.now()
}

export function getSlaState(
  createdAt: string,
  priority: TicketPriority | undefined,
  status: TicketStatus,
  config?: Record<TicketPriority, number> | null,
): SlaState | null {
  if (!isTicketOpen(status)) return null
  const hours = getSlaHours(priority, config)
  if (hours <= 0) return null
  const remaining = getSlaRemainingMs(createdAt, priority, config)
  if (remaining <= 0) return 'overdue'
  if (remaining < hours * HOUR_MS * 0.25) return 'near'
  return 'ok'
}

export function isSlaOverdue(
  createdAt: string,
  priority: TicketPriority | undefined,
  status: TicketStatus,
  config?: Record<TicketPriority, number> | null,
): boolean {
  return getSlaState(createdAt, priority, status, config) === 'overdue'
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(Math.abs(ms) / 60000)
  if (totalMinutes < 60) return `${totalMinutes}min`
  const hours = Math.floor(totalMinutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`
}

export interface SlaInfo {
  state: SlaState
  label: string
  deadline: Date
}

export function getSlaInfo(
  createdAt: string,
  priority: TicketPriority | undefined,
  status: TicketStatus,
  config?: Record<TicketPriority, number> | null,
): SlaInfo | null {
  const state = getSlaState(createdAt, priority, status, config)
  if (!state) return null
  const hours = getSlaHours(priority, config)
  const deadline = computeSlaDeadline(createdAt, hours)
  const remaining = getSlaRemainingMs(createdAt, priority, config)
  const label =
    state === 'overdue'
      ? `Atrasado há ${formatDuration(-remaining)}`
      : `${formatDuration(remaining)} restantes`
  return { state, label, deadline }
}
