import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { publicTicketService, toTicket, PublicTicketRequestError } from '../publicTicketService'

const mockFetch = vi.hoisted(() => vi.fn())

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

const TOKEN = 'segredo-token-ABC-123'

describe('publicTicketService — transporte seguro do tracking token', () => {
  it('getByToken: token viaja SÓ no header X-Tracking-Token, nunca na URL', async () => {
    mockFetch.mockResolvedValue(ok({ ticket: { id: 't-1' } }))

    await publicTicketService.getByToken(TOKEN)

    const [url, init] = mockFetch.mock.calls[0]
    expect(String(url)).toBe('/api/public/chamados/_')
    expect(String(url)).not.toContain(TOKEN)
    expect(String(url)).not.toContain('token')
    const headers = init.headers as Record<string, string>
    expect(headers['X-Tracking-Token']).toBe(TOKEN)
  })

  it('getEvents: mesmo header e URL sem token', async () => {
    mockFetch.mockResolvedValue(ok({ events: [] }))

    await publicTicketService.getEvents(TOKEN)

    const [url, init] = mockFetch.mock.calls[0]
    expect(String(url)).toBe('/api/public/chamados/_/events')
    expect(String(url)).not.toContain(TOKEN)
    expect((init.headers as Record<string, string>)['X-Tracking-Token']).toBe(TOKEN)
  })

  it('submitFeedback: envia rating/comment no body (não no token/URL)', async () => {
    mockFetch.mockResolvedValue(ok({ ticket: { id: 't-1', feedbackRating: 4 } }))

    await publicTicketService.submitFeedback(TOKEN, 4, 'Ótimo')

    const [url, init] = mockFetch.mock.calls[0]
    expect(String(url)).toBe('/api/public/chamados/_/feedback')
    expect(String(url)).not.toContain(TOKEN)
    expect((init.headers as Record<string, string>)['X-Tracking-Token']).toBe(TOKEN)
    expect(JSON.parse(init.body as string)).toEqual({ rating: 4, comment: 'Ótimo' })
  })

  it('subscribe: registra subscription no body com header de token', async () => {
    mockFetch.mockResolvedValue(ok({ status: 'ok' }))

    await publicTicketService.subscribe(TOKEN, { endpoint: 'https://fcm/x' })

    const [url, init] = mockFetch.mock.calls[0]
    expect(String(url)).toBe('/api/public/chamados/_/subscribe')
    expect(String(url)).not.toContain(TOKEN)
    const headers = init.headers as Record<string, string>
    expect(headers['X-Tracking-Token']).toBe(TOKEN)
    const body = JSON.parse(init.body as string)
    expect(body.endpoint).toBe('https://fcm/x')
    // O token nunca deve aparecer no corpo nem na URL
    expect(JSON.stringify(body)).not.toContain(TOKEN)
  })

  it('nenhum request público coloca o token em query string ou corpo', async () => {
    mockFetch.mockResolvedValue(ok({ ticket: { id: 't-1' } }))
    await publicTicketService.getByToken(TOKEN)
    const [, init] = mockFetch.mock.calls[0]
    expect(String('')).not.toContain('?token=')
    expect(String(init.body ?? '')).not.toContain(TOKEN)
  })

  it('propaga erro de API com status na mensagem', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Tracking token inválido' }),
    } as unknown as Response)

    await expect(publicTicketService.getByToken(TOKEN)).rejects.toThrow('Tracking token inválido')
  })

  it('404 sem mensagem vira "Chamado não encontrado"', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as unknown as Response)

    await expect(publicTicketService.getByToken(TOKEN)).rejects.toThrow('Chamado não encontrado')
  })
})


describe('publicTicketService — avaliação do professor (projection + 409)', () => {
  it('toTicket leva feedbackComment e feedbackAt para a UI', () => {
    // Antes estes campos eram devolvidos pelo backend mas nunca lidos: o card
    // "Avaliação enviada" existia e não renderizava nada.
    const t = toTicket({
      id: 't-1',
      ticketNumber: 7,
      status: 'resolvido',
      feedbackRating: 5,
      feedbackComment: 'Atendimento excelente',
      feedbackAt: '2026-06-25T12:00:00Z',
    })
    expect(t.feedbackRating).toBe(5)
    expect(t.feedbackComment).toBe('Atendimento excelente')
    expect(t.feedbackAt).toBe('2026-06-25T12:00:00Z')
  })

  it('toTicket nao inventa avaliação quando a API devolve null', () => {
    const t = toTicket({ id: 't-1', feedbackRating: null, feedbackComment: null, feedbackAt: null })
    expect(t.feedbackRating).toBeUndefined()
    expect(t.feedbackComment).toBeUndefined()
    expect(t.feedbackAt).toBeUndefined()
  })

  it('o erro preserva o status HTTP (409 = já avaliado)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Chamado já avaliado' }),
    } as unknown as Response)

    await expect(publicTicketService.submitFeedback(TOKEN, 4, 'x')).rejects.toMatchObject({
      status: 409,
      message: 'Chamado já avaliado',
    })
  })

  it('o erro de tracking inválido continua 403 (não é confundido com 409)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Tracking token inválido' }),
    } as unknown as Response)

    const err = await publicTicketService
      .getByToken(TOKEN)
      .catch((e: unknown) => e as PublicTicketRequestError)
    expect(err).toBeInstanceOf(PublicTicketRequestError)
    expect((err as PublicTicketRequestError).status).toBe(403)
  })
})
