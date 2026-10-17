import { describe, it, expect } from 'vitest'
import { deviceStatus } from '../deviceStatus'

describe('deviceStatus', () => {
  const base = new Date('2026-01-01T12:00:00Z').getTime()

  it('online quando visto há menos de 2 min', () => {
    const seen = new Date(base - 60_000).toISOString() // 1 min
    expect(deviceStatus(seen, base)).toBe('online')
  })

  it('instável entre 2 e 10 min', () => {
    const seen = new Date(base - 5 * 60_000).toISOString()
    expect(deviceStatus(seen, base)).toBe('unstable')
  })

  it('offline após 10 min', () => {
    const seen = new Date(base - 11 * 60_000).toISOString()
    expect(deviceStatus(seen, base)).toBe('offline')
  })

  it('offline se nunca visto', () => {
    expect(deviceStatus(null, base)).toBe('offline')
  })

  it('offline para data inválida', () => {
    expect(deviceStatus('not-a-date', base)).toBe('offline')
  })
})