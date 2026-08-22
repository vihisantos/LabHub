/**
 * Testes mínimos do Service Worker unificado (src/sw.ts).
 *
 * Cobre:
 * - push handler: parse de payload, defaults, actions
 * - notificationclick handler: focus existente, openWindow, normalização de URL
 * - Deep link de feedback: /chamados-publico/feedback/{id}
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const listeners: Record<string, Function[]> = {}

const fakeSelf = {
  addEventListener: vi.fn((event: string, handler: Function) => {
    if (!listeners[event]) listeners[event] = []
    listeners[event].push(handler)
  }),
  registration: {
    showNotification: vi.fn().mockResolvedValue(undefined),
  },
  clients: {
    matchAll: vi.fn().mockResolvedValue([]),
    openWindow: vi.fn().mockResolvedValue({ focus: vi.fn() }),
  },
  __WB_MANIFEST: [],
}

vi.mock('workbox-precaching', () => ({
  precacheAndRoute: vi.fn(),
}))

beforeEach(() => {
  for (const key of Object.keys(listeners)) delete listeners[key]
  vi.clearAllMocks()
  vi.stubGlobal('self', fakeSelf)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function importSW() {
  vi.resetModules()
  return import('../sw')
}

function makePushEvent(data: object) {
  return {
    data: { json: () => data },
    waitUntil: vi.fn(),
  }
}

function makeNotificationClickEvent(action: string, notificationData: object) {
  return {
    action,
    notification: {
      close: vi.fn(),
      data: notificationData,
    },
    waitUntil: vi.fn(),
  }
}

// ── Push handler ──────────────────────────────────────────────────────────

describe('sw.ts — push handler', () => {
  beforeEach(async () => {
    await importSW()
  })

  it('exibe notificação com payload completo', async () => {
    const handler = listeners['push']?.[0]
    expect(handler).toBeDefined()

    const event = makePushEvent({
      title: 'Chamado #42',
      body: 'Sala 101 · Internet',
      url: '/chamados-publico/success/t-1',
    })

    handler(event)

    expect(fakeSelf.registration.showNotification).toHaveBeenCalledWith(
      'Chamado #42',
      expect.objectContaining({
        body: 'Sala 101 · Internet',
        data: { url: '/chamados-publico/success/t-1', userId: null },
      }),
    )
  })

  it('usa title fallback "LabHub" quando title não existe', async () => {
    const handler = listeners['push']?.[0]

    const event = makePushEvent({ body: 'teste' })
    handler(event)

    expect(fakeSelf.registration.showNotification).toHaveBeenCalledWith(
      'LabHub',
      expect.anything(),
    )
  })

  it('usa body fallback vazio', async () => {
    const handler = listeners['push']?.[0]

    const event = makePushEvent({ title: 'T' })
    handler(event)

    expect(fakeSelf.registration.showNotification).toHaveBeenCalledWith(
      'T',
      expect.objectContaining({ body: '' }),
    )
  })

  it('usa url fallback "/"', async () => {
    const handler = listeners['push']?.[0]

    const event = makePushEvent({ title: 'T' })
    handler(event)

    expect(fakeSelf.registration.showNotification).toHaveBeenCalledWith(
      'T',
      expect.objectContaining({
        data: expect.objectContaining({ url: '/' }),
      }),
    )
  })

  it('inclui actions quando presentes no payload', async () => {
    const handler = listeners['push']?.[0]

    const event = makePushEvent({
      title: 'Teste',
      actions: [
        { action: 'approve', title: 'Aprovar' },
        { action: 'reject', title: 'Recusar' },
      ],
    })

    handler(event)

    expect(fakeSelf.registration.showNotification).toHaveBeenCalledWith(
      'Teste',
      expect.objectContaining({
        actions: [
          { action: 'approve', title: 'Aprovar' },
          { action: 'reject', title: 'Recusar' },
        ],
      }),
    )
  })

  it('limita actions a 2', async () => {
    const handler = listeners['push']?.[0]

    const event = makePushEvent({
      title: 'T',
      actions: [
        { action: 'a1', title: 'A1' },
        { action: 'a2', title: 'A2' },
        { action: 'a3', title: 'A3' },
      ],
    })

    handler(event)

    const call = fakeSelf.registration.showNotification.mock.calls[0]
    expect(call[1].actions).toHaveLength(2)
  })

  it('não inclui actions quando array vazio', async () => {
    const handler = listeners['push']?.[0]

    const event = makePushEvent({ title: 'T', actions: [] })
    handler(event)

    expect(fakeSelf.registration.showNotification).toHaveBeenCalledWith(
      'T',
      expect.not.objectContaining({ actions: expect.anything() }),
    )
  })

  it('preserva userId do payload', async () => {
    const handler = listeners['push']?.[0]

    const event = makePushEvent({ title: 'T', userId: 'user-abc' })
    handler(event)

    expect(fakeSelf.registration.showNotification).toHaveBeenCalledWith(
      'T',
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-abc' }),
      }),
    )
  })
})

// ── Notificationclick handler ─────────────────────────────────────────────

describe('sw.ts — notificationclick handler', () => {
  beforeEach(async () => {
    await importSW()
  })

  it('fecha a notificação', async () => {
    const handler = listeners['notificationclick']?.[0]
    expect(handler).toBeDefined()

    const event = makeNotificationClickEvent('', { url: '/' })
    handler(event)

    expect(event.notification.close).toHaveBeenCalled()
  })

  it('foca janela existente quando path coincide', async () => {
    const fakeClient = {
      url: 'https://app.local/chamados-publico/feedback/t-1',
      focus: vi.fn(),
    }
    fakeSelf.clients.matchAll.mockResolvedValue([fakeClient])

    const handler = listeners['notificationclick']?.[0]
    const event = makeNotificationClickEvent('', {
      url: '/chamados-publico/feedback/t-1',
    })

    handler(event)
    await event.waitUntil.mock.calls[0]?.[0]

    expect(fakeClient.focus).toHaveBeenCalled()
    expect(fakeSelf.clients.openWindow).not.toHaveBeenCalled()
  })

  it('abre nova janela quando nenhum client combina', async () => {
    fakeSelf.clients.matchAll.mockResolvedValue([])

    const handler = listeners['notificationclick']?.[0]
    const event = makeNotificationClickEvent('', {
      url: '/chamados-publico/feedback/t-1',
    })

    handler(event)
    await event.waitUntil.mock.calls[0]?.[0]

    expect(fakeSelf.clients.openWindow).toHaveBeenCalledWith('/chamados-publico/feedback/t-1')
  })

  it('normaliza URL completa extraindo pathname', async () => {
    fakeSelf.clients.matchAll.mockResolvedValue([])

    const handler = listeners['notificationclick']?.[0]
    const event = makeNotificationClickEvent('', {
      url: 'https://app.local/chamados-publico/feedback/t-1',
    })

    handler(event)
    await event.waitUntil.mock.calls[0]?.[0]

    expect(fakeSelf.clients.openWindow).toHaveBeenCalledWith(
      'https://app.local/chamados-publico/feedback/t-1',
    )
  })

  it('foca client com path diferente e abre nova janela para path diferente', async () => {
    const fakeClient = {
      url: 'https://app.local/chamados-publico/ticket/t-2',
      focus: vi.fn(),
    }
    fakeSelf.clients.matchAll.mockResolvedValue([fakeClient])

    const handler = listeners['notificationclick']?.[0]
    const event = makeNotificationClickEvent('', {
      url: '/chamados-publico/feedback/t-1',
    })

    handler(event)
    await event.waitUntil.mock.calls[0]?.[0]

    expect(fakeClient.focus).not.toHaveBeenCalled()
    expect(fakeSelf.clients.openWindow).toHaveBeenCalledWith('/chamados-publico/feedback/t-1')
  })
})

// ── Notificationclick: approve/reject ─────────────────────────────────────

describe('sw.ts — notificationclick approve/reject', () => {
  beforeEach(async () => {
    await importSW()
  })

  it('action "approve" envia POST para /api/push/action', async () => {
    const handler = listeners['notificationclick']?.[0]
    const event = makeNotificationClickEvent('approve', { userId: 'u-1' })

    handler(event)
    await event.waitUntil.mock.calls[0]?.[0]

    expect(fetch).toHaveBeenCalledWith('/api/push/action', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'approve', userId: 'u-1' }),
    }))
  })

  it('action "reject" envia POST para /api/push/action', async () => {
    const handler = listeners['notificationclick']?.[0]
    const event = makeNotificationClickEvent('reject', { userId: 'u-2' })

    handler(event)
    await event.waitUntil.mock.calls[0]?.[0]

    expect(fetch).toHaveBeenCalledWith('/api/push/action', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'reject', userId: 'u-2' }),
    }))
  })

  it('action "approve" sem userId não envia fetch', async () => {
    const handler = listeners['notificationclick']?.[0]
    const event = makeNotificationClickEvent('approve', {})

    handler(event)

    expect(fetch).not.toHaveBeenCalled()
  })
})

// ── Deep link feedback ────────────────────────────────────────────────────

describe('sw.ts — deep link de feedback', () => {
  beforeEach(async () => {
    await importSW()
  })

  it('abre /chamados-publico/feedback/{uuid} corretamente', async () => {
    fakeSelf.clients.matchAll.mockResolvedValue([])

    const handler = listeners['notificationclick']?.[0]
    const event = makeNotificationClickEvent('', {
      url: '/chamados-publico/feedback/550e8400-e29b-41d4-a716-446655440000',
    })

    handler(event)
    await event.waitUntil.mock.calls[0]?.[0]

    expect(fakeSelf.clients.openWindow).toHaveBeenCalledWith(
      '/chamados-publico/feedback/550e8400-e29b-41d4-a716-446655440000',
    )
  })

  it('abre /chamados-publico/success/{uuid} corretamente', async () => {
    fakeSelf.clients.matchAll.mockResolvedValue([])

    const handler = listeners['notificationclick']?.[0]
    const event = makeNotificationClickEvent('', {
      url: '/chamados-publico/success/t-1',
    })

    handler(event)
    await event.waitUntil.mock.calls[0]?.[0]

    expect(fakeSelf.clients.openWindow).toHaveBeenCalledWith(
      '/chamados-publico/success/t-1',
    )
  })

  it('foca janela existente de feedback quando já aberta', async () => {
    const fakeClient = {
      url: 'https://app.local/chamados-publico/feedback/t-1',
      focus: vi.fn(),
    }
    fakeSelf.clients.matchAll.mockResolvedValue([fakeClient])

    const handler = listeners['notificationclick']?.[0]
    const event = makeNotificationClickEvent('', {
      url: '/chamados-publico/feedback/t-1',
    })

    handler(event)
    await event.waitUntil.mock.calls[0]?.[0]

    expect(fakeClient.focus).toHaveBeenCalled()
    expect(fakeSelf.clients.openWindow).not.toHaveBeenCalled()
  })
})
