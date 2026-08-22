import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../lib/useRealtimePresence', () => ({
  useRealtimePresence: vi.fn(() => ({ onlineUsers: [] })),
}))

vi.mock('../../../lib/usePresenceSound', () => ({
  usePresenceSound: vi.fn(() => ({ muted: false, toggleMute: vi.fn(), playBeep: vi.fn() })),
}))

vi.mock('../../../lib/icons', () => ({
  icons: { ui: { userCheck: () => null, volumeX: () => null, volume2: () => null } },
}))

vi.mock('../../../lib/components/ui', () => ({
  Popover: ({ children }: any) => children,
  PopoverTrigger: ({ children }: any) => children,
  PopoverContent: ({ children }: any) => children,
}))

vi.mock('react-router-dom', () => ({
  useLocation: vi.fn(() => ({ pathname: '/pc-care' })),
}))

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('OnlineUsersPresence — sessionStorage resilience', () => {
  it('module import does not throw when sessionStorage is unavailable', async () => {
    vi.stubGlobal('sessionStorage', undefined)

    await expect(import('../OnlineUsersPresence')).resolves.toBeDefined()
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

    await expect(import('../OnlineUsersPresence')).resolves.toBeDefined()
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

    await expect(import('../OnlineUsersPresence')).resolves.toBeDefined()
  })

  it('module import does not throw when crypto.randomUUID is unavailable', async () => {
    const originalCrypto = globalThis.crypto
    // @ts-expect-error testing missing crypto
    delete globalThis.crypto

    await expect(import('../OnlineUsersPresence')).resolves.toBeDefined()

    globalThis.crypto = originalCrypto
  })
})
