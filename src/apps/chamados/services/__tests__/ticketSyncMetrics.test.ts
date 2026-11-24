import { describe, expect, it, vi } from 'vitest'

describe('ticket sync metrics', () => {
  it('counts skipped pulls and aggregates latency without ticket data', async () => {
    vi.resetModules()
    const { recordTicketSync, getTicketSyncMetrics } = await import('../ticketSyncMetrics')
    recordTicketSync('revisionUnchanged')
    recordTicketSync('revisionChanged')
    recordTicketSync('revisionUnavailable')
    recordTicketSync('periodicFull')
    recordTicketSync('fullSuccess', 100)
    recordTicketSync('fullFailure', 300)
    expect(getTicketSyncMetrics()).toMatchObject({
      watchdogFullPullsAvoided: 1,
      revisionChanged: 1,
      revisionUnavailable: 1,
      periodicFull: 1,
      fullAttempts: 2,
      fullSuccess: 1,
      fullFailure: 1,
      meanFullMs: 200,
    })
  })
})
