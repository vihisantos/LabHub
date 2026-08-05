export const EXPIRY_ALERT_WINDOW_DAYS = 30

export type ExpiryStatus = 'expired' | 'soon' | 'ok'

export interface ExpiryState {
  status: ExpiryStatus
  days: number
}

/** Interpreta "YYYY-MM-DD" como data de calendário em fuso local (evita off-by-one do UTC). */
function toLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Dias (inteiros) entre hoje e a data de validade. Negativo = vencido. */
export function daysUntil(date: string): number {
  const target = toLocalDate(date).getTime()
  const today = startOfToday().getTime()
  return Math.round((target - today) / 86400000)
}

export function getExpiryState(date: string): ExpiryState {
  const days = daysUntil(date)
  if (days < 0) return { status: 'expired', days }
  if (days <= EXPIRY_ALERT_WINDOW_DAYS) return { status: 'soon', days }
  return { status: 'ok', days }
}

export function formatExpiryDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('pt-BR')
}
