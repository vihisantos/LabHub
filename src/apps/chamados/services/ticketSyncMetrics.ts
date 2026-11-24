/**
 * Local, aggregate instrumentation for Performance 2.0.
 * No identifiers, ticket contents, network requests or persistent storage.
 * Counters reset on reload; these are client observations, not provider billing.
 */
type Outcome = 'revisionUnchanged' | 'revisionChanged' | 'revisionUnavailable' | 'periodicFull' | 'fullSuccess' | 'fullFailure'
const counts: Record<Outcome, number> = {
  revisionUnchanged: 0,
  revisionChanged: 0,
  revisionUnavailable: 0,
  periodicFull: 0,
  fullSuccess: 0,
  fullFailure: 0,
}
const startedAt = Date.now()
let totalFullMs = 0

export function recordTicketSync(outcome: Outcome, durationMs = 0): void {
  counts[outcome]++
  if (outcome === 'fullSuccess' || outcome === 'fullFailure') {
    totalFullMs += Math.max(0, durationMs)
  }
}

export function getTicketSyncMetrics() {
  const fullAttempts = counts.fullSuccess + counts.fullFailure
  return {
    startedAt,
    ...counts,
    fullAttempts,
    meanFullMs: fullAttempts ? totalFullMs / fullAttempts : null,
    // Each unchanged check skipped one potential full watchdog pull.
    watchdogFullPullsAvoided: counts.revisionUnchanged,
  }
}
