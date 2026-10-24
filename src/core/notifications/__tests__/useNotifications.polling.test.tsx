import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

/**
 * Regressão do polling remoto de notificações.
 *
 * Antes: cada instância de `useNotifications` montava seu próprio `setInterval`
 * de 10 s chamando `GET /api/app-notifications`. O sino é usado por vários
 * componentes ao mesmo tempo (Launcher, HomeView, DashboardPage, AdminLayout,
 * AdminDashboard, NotificationCenter, NotificationsSheet, InboxTab...), então
 * uma única aba podia disparar ~10 requisições a cada 10 s.
 *
 * Depois: um runtime compartilhado faz UMA requisição por janela de 10 s,
 * independentemente da quantidade de consumidores. A semântica de leitura
 * (token do usuário, endpoint, ingestão com dedupe por id) não muda.
 */

import type { AppNotification } from '../types'

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(() => [] as AppNotification[]),
  ingestRemote: vi.fn((_item: AppNotification): boolean => false),
  getCurrentUser: vi.fn(() => ({ id: 'user-1', is_super_admin: false }) as any),
  authListeners: [] as Array<(user: any) => void>,
  onAuthChange: vi.fn((callback: (user: any) => void) => {
    mocks.authListeners.push(callback)
    return () => {
      const index = mocks.authListeners.indexOf(callback)
      if (index >= 0) mocks.authListeners.splice(index, 1)
    }
  }),
  getSession: vi.fn(async () => ({
    data: { session: { access_token: 'test-token' } },
    error: null,
  })),
  fetchMock: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  useModuleVisibilities: vi.fn(() => ({ isVisible: () => true })),
}))

vi.mock('../service', () => ({
  notificationService: {
    getAll: mocks.getAll,
    ingestRemote: mocks.ingestRemote,
    create: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    remove: vi.fn(),
    clearAll: vi.fn(),
    snooze: vi.fn(),
  },
  appNotificationFromRow: (row: any) => row,
}))

vi.mock('../../auth/service', () => ({
  authService: {
    getCurrentUser: mocks.getCurrentUser,
    onAuthChange: mocks.onAuthChange,
  },
}))

vi.mock('../../../lib/supabase', () => ({
  defaultDb: { auth: { getSession: mocks.getSession } },
}))

vi.mock('../../workspaces/store', () => ({
  workspaceStore: {
    subscribe: mocks.subscribe,
    matches: () => true,
  },
}))

vi.mock('../../permissions/useModuleVisibility', () => ({
  useModuleVisibilities: mocks.useModuleVisibilities,
}))

vi.mock('../../../appRegistry', () => ({ appRegistry: [] }))

vi.mock('../visibility', () => ({ notificationAppliesTo: () => true }))

import {
  useNotifications,
  __resetNotificationsPollingForTests,
} from '../useNotifications'

function flushFetch() {
  // Resolve a cadeia de promises do poll (getSession → fetch → json).
  return act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

function advance(ms: number) {
  return act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  __resetNotificationsPollingForTests()
  vi.clearAllMocks()
  mocks.getCurrentUser.mockReturnValue({ id: 'user-1', is_super_admin: false } as any)
  mocks.getAll.mockReturnValue([])
  mocks.ingestRemote.mockReturnValue(false)
  mocks.fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ notifications: [] }),
  })
  vi.stubGlobal('fetch', mocks.fetchMock)
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  __resetNotificationsPollingForTests()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useNotifications — polling remoto compartilhado', () => {
  it('múltiplas instâncias do hook fazem UMA requisição por janela de 10 s', async () => {
    const hooks = [
      renderHook(() => useNotifications()),
      renderHook(() => useNotifications()),
      renderHook(() => useNotifications()),
    ]
    await flushFetch()

    expect(mocks.fetchMock).toHaveBeenCalledTimes(1)

    await advance(10_000)
    expect(mocks.fetchMock).toHaveBeenCalledTimes(2)

    await advance(10_000)
    expect(mocks.fetchMock).toHaveBeenCalledTimes(3)

    hooks.forEach((h) => h.unmount())
  })

  it('polling concorrente não duplica a requisição (single-flight)', async () => {
    // Deixa a primeira requisição pendente.
    let resolveFetch!: (value: any) => void
    mocks.fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )

    const a = renderHook(() => useNotifications())
    const b = renderHook(() => useNotifications())
    await flushFetch()

    expect(mocks.fetchMock).toHaveBeenCalledTimes(1)

    // Um novo tick (ex.: re-mount/trigger) não abre outra requisição enquanto
    // a primeira continua pendente.
    await advance(10_000)
    expect(mocks.fetchMock).toHaveBeenCalledTimes(1)

    resolveFetch({ ok: true, json: async () => ({ notifications: [] }) })
    await flushFetch()

    // Após concluir, a próxima janela volta a consultar.
    await advance(10_000)
    expect(mocks.fetchMock).toHaveBeenCalledTimes(2)

    a.unmount()
    b.unmount()
  })

  it('desmontar o último consumidor encerra o polling; desmontar um mantém', async () => {
    const a = renderHook(() => useNotifications())
    const b = renderHook(() => useNotifications())
    await flushFetch()
    expect(mocks.fetchMock).toHaveBeenCalledTimes(1)

    a.unmount()
    await advance(10_000)
    expect(mocks.fetchMock).toHaveBeenCalledTimes(2)

    b.unmount()
    await advance(30_000)
    expect(mocks.fetchMock).toHaveBeenCalledTimes(2)
  })

  it('offline não faz requisição; ao voltar online a próxima janela consulta', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    })

    const { unmount } = renderHook(() => useNotifications())
    await flushFetch()
    await advance(20_000)
    expect(mocks.fetchMock).not.toHaveBeenCalled()

    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    })
    await advance(10_000)
    expect(mocks.fetchMock).toHaveBeenCalledTimes(1)

    unmount()
  })

  it('sem usuário autenticado não consulta o servidor', async () => {
    mocks.getCurrentUser.mockReturnValue(null)

    const { unmount } = renderHook(() => useNotifications())
    await flushFetch()
    await advance(30_000)

    expect(mocks.fetchMock).not.toHaveBeenCalled()
    unmount()
  })

  it('requisição usa o token da sessão atual (sem expor o token em log)', async () => {
    const { unmount } = renderHook(() => useNotifications())
    await flushFetch()

    expect(mocks.fetchMock).toHaveBeenCalledWith(
      '/api/app-notifications',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    )
    unmount()
  })

  it('ingere cada notificação remota uma única vez e recarrega o estado local', async () => {
    mocks.fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        notifications: [
          { id: 'n1', title: 'A' },
          { id: 'n2', title: 'B' },
        ],
      }),
    })
    mocks.ingestRemote.mockReturnValue(true)

    const a = renderHook(() => useNotifications())
    const b = renderHook(() => useNotifications())
    await flushFetch()

    // Cada linha é ingerida exatamente uma vez, mesmo com dois consumidores.
    expect(mocks.ingestRemote).toHaveBeenCalledTimes(2)
    const ingestedIds = mocks.ingestRemote.mock.calls
      .map((c) => {
        const item = c[0] as AppNotification
        return item.id
      })
      .sort()
    expect(ingestedIds).toEqual(['n1', 'n2'])

    // O estado local é recarregado em todas as instâncias após a ingestão.
    // 2 no mount + 2 após o notify.
    expect(mocks.getAll.mock.calls.length).toBeGreaterThanOrEqual(4)

    a.unmount()
    b.unmount()
  })


  it('descarta resposta pendente da sessão anterior após troca de usuário', async () => {
    const pending: Array<(value: any) => void> = []
    mocks.fetchMock.mockImplementation(
      () => new Promise((resolve) => { pending.push(resolve) }),
    )

    const { unmount } = renderHook(() => useNotifications())
    await flushFetch()
    expect(pending).toHaveLength(1)

    // Troca de identidade enquanto o GET do usuário anterior está pendente.
    act(() => {
      mocks.getCurrentUser.mockReturnValue({ id: 'user-2', is_super_admin: false } as any)
      mocks.authListeners.forEach((listener) => listener({ id: 'user-2', is_super_admin: false }))
    })
    await flushFetch()
    expect(pending).toHaveLength(2)

    pending[0]({ ok: true, json: async () => ({ notifications: [{ id: 'stale-user-1' }] }) })
    await flushFetch()
    expect(mocks.ingestRemote).not.toHaveBeenCalled()

    pending[1]({ ok: true, json: async () => ({ notifications: [{ id: 'current-user-2' }] }) })
    await flushFetch()
    expect(mocks.ingestRemote).toHaveBeenCalledTimes(1)
    expect(mocks.ingestRemote).toHaveBeenCalledWith({ id: 'current-user-2' })
    unmount()
  })

  it('descarta resposta pendente após logout', async () => {
    let resolveFetch!: (value: any) => void
    mocks.fetchMock.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve }),
    )

    const { unmount } = renderHook(() => useNotifications())
    await flushFetch()
    expect(mocks.fetchMock).toHaveBeenCalledTimes(1)

    act(() => {
      mocks.getCurrentUser.mockReturnValue(null)
      mocks.authListeners.forEach((listener) => listener(null))
    })
    resolveFetch({ ok: true, json: async () => ({ notifications: [{ id: 'after-logout' }] }) })
    await flushFetch()

    expect(mocks.ingestRemote).not.toHaveBeenCalled()
    unmount()
  })

  it('resposta não-ok não ingere nada e não derruba o polling', async () => {
    mocks.fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })

    const { unmount } = renderHook(() => useNotifications())
    await flushFetch()
    await advance(10_000)

    expect(mocks.ingestRemote).not.toHaveBeenCalled()
    expect(mocks.fetchMock).toHaveBeenCalledTimes(2)

    unmount()
  })
})
