import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { hasPendingPushRecovery, recoverMissingPushSubscription } from '../pushRecovery'

const mockGetSession = vi.fn()
vi.mock('../supabase', () => ({
  defaultDb: { auth: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}))

const makeUser = (id: string) => ({ id, name: 'QA Push', role: 'tecnico', workspace_ids: ['ws-qa'] })
const sub = {
  endpoint: 'https://push.example/qa',
  toJSON: () => ({ endpoint: 'https://push.example/qa', keys: { p256dh: 'a', auth: 'b' } }),
}
const makeRegistration = () => ({
  pushManager: {
    getSubscription: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockResolvedValue(sub),
  },
}) as unknown as ServiceWorkerRegistration

beforeEach(() => {
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'dGVzdA')
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'jwt-qa' } } })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
})
afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('recuperação automática de inscrições Push', () => {
  it('recupera após perda com permissão já concedida e registra no backend autenticado', async () => {
    const registration = makeRegistration()
    expect(await recoverMissingPushSubscription('/api/push/subscribe', makeUser('recovery-1'), registration)).toBe(true)
    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/push/subscribe')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer jwt-qa' })
    const body = JSON.parse(String(init?.body))
    expect(body.user.id).toBe('recovery-1')
    expect(body.endpoint).toBe(sub.endpoint)
    expect(Notification.requestPermission).not.toHaveBeenCalled()
  })

  it('não tenta nada sem usuário nem quando permissão não está concedida', async () => {
    const registration = makeRegistration()
    expect(await recoverMissingPushSubscription('/api/push/subscribe', null, registration)).toBe(false)
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() })
    expect(await recoverMissingPushSubscription('/api/push/subscribe', makeUser('recovery-2'), registration)).toBe(false)
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('falha fechado se não houver sessão autenticada, sem criar inscrição', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const registration = makeRegistration()
    await expect(recoverMissingPushSubscription('/api/push/subscribe', makeUser('recovery-3'), registration))
      .rejects.toThrow('Sessão indisponível')
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('duas instâncias do hook compartilham a mesma recuperação sem duplicar POST', async () => {
    const registration = makeRegistration()
    const user = makeUser('recovery-4')
    const [a, b] = await Promise.all([
      recoverMissingPushSubscription('/api/push/subscribe', user, registration),
      recoverMissingPushSubscription('/api/push/subscribe', user, registration),
    ])
    expect(a).toBe(true)
    expect(b).toBe(true)
    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('se o POST falhar, retenta sincronização sem criar segunda inscrição', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(100_000)
    const registration = makeRegistration()
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response)
    const user = makeUser('recovery-5')
    await expect(recoverMissingPushSubscription('/api/push/subscribe', user, registration))
      .rejects.toThrow('HTTP 503')
    expect(hasPendingPushRecovery('/api/push/subscribe', user.id)).toBe(true)

    // Backoff evita tempestade de requisições após falha.
    expect(await recoverMissingPushSubscription('/api/push/subscribe', user, registration)).toBe(false)
    now.mockReturnValue(116_000)
    // Browser já possui a inscrição, mas backend não confirmou persistência.
    registration.pushManager.getSubscription = vi.fn().mockResolvedValue(sub)
    expect(await recoverMissingPushSubscription('/api/push/subscribe', user, registration)).toBe(true)
    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(hasPendingPushRecovery('/api/push/subscribe', user.id)).toBe(false)
  })

  it('persiste o registro pendente após reinício do PWA e sincroniza sem criar segunda inscrição', async () => {
    const registration = makeRegistration()
    const user = makeUser('recovery-restart')
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response)
    await expect(recoverMissingPushSubscription('/api/push/subscribe', user, registration))
      .rejects.toThrow('HTTP 503')
    expect(hasPendingPushRecovery('/api/push/subscribe', user.id)).toBe(true)

    // Simula recarga do app (novo módulo sem o Map anterior, mesmo storage).
    vi.resetModules()
    const reloaded = await import('../pushRecovery')
    expect(reloaded.hasPendingPushRecovery('/api/push/subscribe', user.id)).toBe(true)
    registration.pushManager.getSubscription = vi.fn().mockResolvedValue(sub)
    expect(await reloaded.recoverMissingPushSubscription('/api/push/subscribe', user, registration)).toBe(true)
    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(reloaded.hasPendingPushRecovery('/api/push/subscribe', user.id)).toBe(false)
  })

  it('limita falhas repetidas a três tentativas por sessão', async () => {
    const now = vi.spyOn(Date, 'now')
    const registration = makeRegistration()
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const user = makeUser('recovery-6')
    for (let n = 0; n < 3; n++) {
      now.mockReturnValue(100_000 + n * 16_000)
      await expect(recoverMissingPushSubscription('/api/push/subscribe', user, registration))
        .rejects.toThrow('Sessão indisponível')
    }
    now.mockReturnValue(200_000)
    expect(await recoverMissingPushSubscription('/api/push/subscribe', user, registration)).toBe(false)
    expect(mockGetSession).toHaveBeenCalledTimes(3)
  })
})
