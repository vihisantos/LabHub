import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePushNotifications } from '../usePushNotifications'

const mockGetSubscription = vi.fn()
const mockSubscribe = vi.fn()

const mockRegistration = {
  pushManager: {
    getSubscription: mockGetSubscription,
    subscribe: mockSubscribe,
  },
}

beforeEach(() => {
  mockGetSubscription.mockResolvedValue(null)
  mockSubscribe.mockResolvedValue({
    toJSON: () => ({
      endpoint: 'https://fcm/send/abc',
      keys: { p256dh: 'key', auth: 'auth' },
    }),
  })

  vi.stubGlobal('navigator', {
    serviceWorker: {
      ready: Promise.resolve(mockRegistration),
    },
  })
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn(),
  })
  vi.stubGlobal('PushManager', {})
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Aguarda o useEffect de detecção completar */
async function flushDetect() {
  await act(async () => {})
}

describe('usePushNotifications', () => {
  it('retorna supported: false quando não há serviceWorker', () => {
    vi.stubGlobal('navigator', {})
    const { result } = renderHook(() => usePushNotifications())
    expect(result.current.supported).toBe(false)
    expect(result.current.loading).toBe(false)
  })

  it('retorna supported: false quando PushManager não existe', () => {
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

  it('retorna supported: true quando serviceWorker e PushManager existem', async () => {
    const { result } = renderHook(() => usePushNotifications())
    await flushDetect()
    expect(result.current.supported).toBe(true)
    expect(result.current.loading).toBe(false)
  })

  it('permission reflete Notification.permission', async () => {
    const { result } = renderHook(() => usePushNotifications())
    await flushDetect()
    expect(result.current.permission).toBe('default')
  })

  it('subscribed é true quando já existe subscription', async () => {
    mockGetSubscription.mockResolvedValue({ endpoint: 'https://fcm/send/existing' })
    const { result } = renderHook(() => usePushNotifications())
    await flushDetect()
    expect(result.current.subscribed).toBe(true)
  })

  it('subscribed é false quando não existe subscription', async () => {
    mockGetSubscription.mockResolvedValue(null)
    const { result } = renderHook(() => usePushNotifications())
    await flushDetect()
    expect(result.current.subscribed).toBe(false)
  })

  it('reenvia a inscrição quando a segmentação do usuário muda', async () => {
    // Subscription existente: o snapshot guardado no backend precisa ser atualizado
    mockGetSubscription.mockResolvedValue({
      endpoint: 'https://fcm/send/abc',
      toJSON: () => ({ endpoint: 'https://fcm/send/abc', keys: { p256dh: 'k', auth: 'a' } }),
    })

    const initialUser = { id: 'u1', name: 'U', role: 'r', apps: { chamados: false } } as any
    const { rerender } = renderHook(
      ({ user }) => usePushNotifications('/api/push/subscribe', user),
      { initialProps: { user: initialUser } },
    )
    await flushDetect()
    await act(async () => {}) // deixa o effect de refresh completar

    expect(fetch).toHaveBeenCalledTimes(1)
    const firstBody = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(firstBody.user.apps.chamados).toBe(false)

    // Usuário ganhou acesso ao chamados → snapshot deve ser reenviado
    rerender({ user: { ...initialUser, apps: { chamados: 'full' } } as any })
    await act(async () => {})

    expect(fetch).toHaveBeenCalledTimes(2)
    const secondBody = JSON.parse((fetch as any).mock.calls[1][1].body)
    expect(secondBody.user.apps.chamados).toBe('full')
    expect(secondBody.endpoint).toBe('https://fcm/send/abc')
  })

  it('não reenvia quando a segmentação não mudou', async () => {
    mockGetSubscription.mockResolvedValue({
      endpoint: 'https://fcm/send/abc',
      toJSON: () => ({ endpoint: 'https://fcm/send/abc', keys: { p256dh: 'k', auth: 'a' } }),
    })
    const user = { id: 'u1', name: 'U', role: 'r', apps: { chamados: 'full' } } as any
    const { rerender } = renderHook(
      ({ user }) => usePushNotifications('/api/push/subscribe', user),
      { initialProps: { user } },
    )
    await flushDetect()
    await act(async () => {})
    expect(fetch).toHaveBeenCalledTimes(1)

    // Mesma segmentação, outra instância de objeto → não deve reenviar
    rerender({ user: { ...user } as any })
    await act(async () => {})
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('não tenta atualizar snapshot quando não há subscription', async () => {
    mockGetSubscription.mockResolvedValue(null)
    const user = { id: 'u1', name: 'U', role: 'r', apps: { chamados: 'full' } } as any
    renderHook(() => usePushNotifications('/api/push/subscribe', user))
    await flushDetect()
    await act(async () => {})
    expect(fetch).not.toHaveBeenCalled()
  })

  it('error é null inicialmente', async () => {
    const { result } = renderHook(() => usePushNotifications())
    await flushDetect()
    expect(result.current.error).toBeNull()
  })

  it('subscribe retorna erro quando not supported', async () => {
    vi.stubGlobal('navigator', {})
    const { result } = renderHook(() => usePushNotifications())
    await flushDetect()
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
    const { result } = renderHook(() => usePushNotifications())
    await flushDetect()
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
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')

    const { result } = renderHook(() => usePushNotifications())
    await flushDetect()
    await act(async () => {
      await result.current.subscribe()
    })
    expect(result.current.error).toBe('VAPID key não configurada')
    expect(result.current.subscribed).toBe(false)

    vi.unstubAllEnvs()
  })

  it('subscribe reutiliza subscription existente (não chama subscribe() novamente)', async () => {
    const existing = {
      endpoint: 'https://fcm/send/existing',
      toJSON: () => ({ endpoint: 'https://fcm/send/existing', keys: {} }),
    }
    mockGetSubscription.mockResolvedValue(existing)

    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission,
    })
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'test-key')

    const { result } = renderHook(() => usePushNotifications('/api/push/subscribe'))
    await flushDetect()

    await act(async () => {
      await result.current.subscribe()
    })

    expect(mockSubscribe).not.toHaveBeenCalled()
    expect(result.current.subscribed).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/api/push/subscribe', expect.anything())

    vi.unstubAllEnvs()
  })

  it('aceita subscribeUrl como string', async () => {
    const { result } = renderHook(() => usePushNotifications('/custom/endpoint'))
    await flushDetect()
    expect(result.current.supported).toBe(true)
    expect(result.current.error).toBeNull()
  })
})
