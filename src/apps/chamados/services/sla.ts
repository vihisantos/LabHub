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

/** Verifica se a string de data é parseável. */
function isValidDate(dateStr: string): boolean {
  return !isNaN(new Date(dateStr).getTime())
}

export function computeSlaDeadline(createdAt: string, hours: number): Date {
  if (!isValidDate(createdAt)) return new Date(NaN)
  return new Date(new Date(createdAt).getTime() + hours * HOUR_MS)
}

export function getSlaRemainingMs(
  createdAt: string,
  priority: TicketPriority | undefined,
  config?: Record<TicketPriority, number> | null,
): number {
  if (!isValidDate(createdAt)) return 0
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
  if (!isValidDate(createdAt)) return null
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

export interface SlaPriorityStats {
  total: number
  met: number
  breached: number
  avgHours: number
}

export interface SlaAnalysis {
  total: number
  met: number
  breached: number
  rate: number
  avgHours: number
  byPriority: Record<TicketPriority, SlaPriorityStats>
}

export interface SlaResolvedTicket {
  id: string
  workspace_id?: string | null
  createdAt: string
  resolvedAt?: string | null
  priority?: TicketPriority
}

function emptyPriorityStats(): Record<TicketPriority, SlaPriorityStats> {
  return {
    baixa: { total: 0, met: 0, breached: 0, avgHours: 0 },
    normal: { total: 0, met: 0, breached: 0, avgHours: 0 },
    alta: { total: 0, met: 0, breached: 0, avgHours: 0 },
    urgente: { total: 0, met: 0, breached: 0, avgHours: 0 },
  }
}

export function analyzeSla(
  tickets: SlaResolvedTicket[],
  configs?: Record<string, Record<TicketPriority, number>>,
): SlaAnalysis {
  const byPriority = emptyPriorityStats()
  let total = 0
  let met = 0
  let sumHours = 0

  for (const t of tickets) {
    if (!t.resolvedAt) continue
    const created = new Date(t.createdAt).getTime()
    const resolved = new Date(t.resolvedAt).getTime()
    if (!Number.isFinite(created) || !Number.isFinite(resolved)) continue

    const p = getPriority(t.priority)
    const slaHours = getSlaHours(p, configs?.[t.workspace_id ?? ''])
    if (slaHours <= 0) continue

    const durationHours = (resolved - created) / HOUR_MS
    if (durationHours < 0) continue

    const ok = durationHours <= slaHours
    total++
    sumHours += durationHours
    if (ok) met++

    const s = byPriority[p]
    s.total++
    s.avgHours += durationHours
    if (ok) s.met++
    else s.breached++
  }

  for (const p of Object.keys(byPriority) as TicketPriority[]) {
    const s = byPriority[p]
    if (s.total > 0) s.avgHours = Math.round((s.avgHours / s.total) * 10) / 10
  }

  return {
    total,
    met,
    breached: total - met,
    rate: total > 0 ? Math.round((met / total) * 100) : 0,
    avgHours: total > 0 ? Math.round((sumHours / total) * 10) / 10 : 0,
    byPriority,
  }
}
