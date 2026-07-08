import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePushNotifications } from '../usePushNotifications'

const mockSubscribe = vi.fn()

beforeEach(() => {
  vi.stubGlobal('navigator', {
    serviceWorker: {
      register: vi.fn().mockResolvedValue({
        pushManager: {
          subscribe: mockSubscribe,
        },
      }),
    },
  })
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn(),
  })
  vi.stubGlobal('PushManager', {})
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('usePushNotifications', () => {
  it('retorna supported: false quando não há serviceWorker', () => {
    vi.stubGlobal('navigator', {})
    const { result } = renderHook(() => usePushNotifications())
    expect(result.current.supported).toBe(false)
    expect(result.current.loading).toBe(false)
  })

  it('retorna supported: false quando PushManager não existe', () => {
    // Remove PushManager completamente do global scope
    const prevPushManager = (globalThis as any).PushManager
    delete (globalThis as any).PushManager
    try {
      const { result } = renderHook(() => usePushNotifications())
      expect(result.current.supported).toBe(false)
      expect(result.current.loading).toBe(false)
    } finally {
      ;(globalThis as any).PushManager = prevPushManager
    }
  })

  it('retorna supported: true quando serviceWorker e PushManager existem', () => {
    const { result } = renderHook(() => usePushNotifications())
    expect(result.current.supported).toBe(true)
    expect(result.current.loading).toBe(false)
  })

  it('permission reflete Notification.permission', () => {
    const { result } = renderHook(() => usePushNotifications())
    expect(result.current.permission).toBe('default')
  })

  it('subscribed é false inicialmente', () => {
    const { result } = renderHook(() => usePushNotifications())
    expect(result.current.subscribed).toBe(false)
  })

  it('error é null inicialmente', () => {
    const { result } = renderHook(() => usePushNotifications())
    expect(result.current.error).toBeNull()
  })

  it('subscribe retorna erro quando not supported', async () => {
    vi.stubGlobal('navigator', {})
    const { result } = renderHook(() => usePushNotifications())
    await act(async () => {
      await result.current.subscribe()
    })
    expect(result.current.error).toBe('Push não suportado')
  })

  it('subscribe retorna subscribed: false se permissão negada', async () => {
    const requestPermission = vi.fn().mockResolvedValue('denied')
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission,
    })
    const { result } = renderHook(() => usePushNotifications([]))
    await act(async () => {
      await result.current.subscribe()
    })
    expect(result.current.subscribed).toBe(false)
    expect(result.current.permission).toBe('denied')
  })

  it('subscribe retorna erro de VAPID key quando permission é granted mas VAPID não configurada', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission,
    })
    // Usar vi.stubEnv para garantir que VAPID key não está configurada
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')

    const { result } = renderHook(() => usePushNotifications([]))
    await act(async () => {
      await result.current.subscribe()
    })
    expect(result.current.error).toBe('VAPID key não configurada')
    expect(result.current.subscribed).toBe(false)

    vi.unstubAllEnvs()
  })

  it('aceita lista de apps vazia', () => {
    const { result } = renderHook(() => usePushNotifications([]))
    expect(result.current.supported).toBe(true)
    expect(result.current.error).toBeNull()
  })
})
