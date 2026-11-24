type NotificationSyncMetric = 'poll' | 'event' | 'coalesced' | 'success' | 'failure'

const startedAt = Date.now()
const counts: Record<NotificationSyncMetric, number> = {
  poll: 0, event: 0, coalesced: 0, success: 0, failure: 0,
}

/** Per-tab aggregate counters only. No payloads, identities, tokens or network. */
export function recordNotificationSync(metric: NotificationSyncMetric): void {
  counts[metric]++
}

export function getNotificationSyncMetrics() {
  return { startedAt, ...counts, requests: counts.poll + counts.event }
}
