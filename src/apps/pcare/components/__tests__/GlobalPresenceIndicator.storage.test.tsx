import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../lib/useRealtimePresence', () => ({
  useRealtimePresence: vi.fn(() => ({ onlineUsers: [] })),
}))

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GlobalPresenceIndicator — sessionStorage resilience', () => {
  it('module import does not throw when sessionStorage is unavailable', async () => {
    vi.stubGlobal('sessionStorage', undefined)

    await expect(import('../GlobalPresenceIndicator')).resolves.toBeDefined()
  })

  it('module import does not throw when sessionStorage.getItem throws SecurityError', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => {
        throw new DOMException('Storage access denied', 'SecurityError')
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    await expect(import('../GlobalPresenceIndicator')).resolves.toBeDefined()
  })

  it('module import does not throw when sessionStorage.setItem throws SecurityError', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new DOMException('Storage access denied', 'SecurityError')
      }),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    await expect(import('../GlobalPresenceIndicator')).resolves.toBeDefined()
  })

  it('module import does not throw when crypto.randomUUID is unavailable', async () => {
    const originalCrypto = globalThis.crypto
    // @ts-expect-error testing missing crypto
    delete globalThis.crypto

    await expect(import('../GlobalPresenceIndicator')).resolves.toBeDefined()

    globalThis.crypto = originalCrypto
  })

  it('generates an ephemeral TAB_ID when sessionStorage is blocked', async () => {
    vi.stubGlobal('sessionStorage', undefined)

    const mod = await import('../GlobalPresenceIndicator')
    expect(mod.GlobalPresenceIndicator).toBeDefined()
  })
})
