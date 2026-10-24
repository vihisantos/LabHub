export type TvDeviceStatus = 'online' | 'unstable' | 'offline'

/**
 * Classifica a conectividade de uma TV a partir de `last_seen`.
 * - < 2 min  => online
 * - 2–10 min => instável
 * - > 10 min  => offline
 * `now` injetável para testes.
 */
export function deviceStatus(lastSeen: string | null, now: number = Date.now()): TvDeviceStatus {
  if (!lastSeen) return 'offline'
  const diff = now - new Date(lastSeen).getTime()
  if (Number.isNaN(diff) || diff < 0) return 'offline'
  const min = diff / 60_000
  if (min < 2) return 'online'
  if (min <= 10) return 'unstable'
  return 'offline'
}