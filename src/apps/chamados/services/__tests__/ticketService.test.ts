import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { ticketService } from '../ticketService'
import { logService } from '../../../../core/logs/service'
import { setCol } from '../../../../lib/db'
import type { Ticket, TicketFormData, ChamadosReport } from '../../types'

// Mock the Supabase client so request() can obtain the access token
const mockGetSession = vi.fn().mockResolvedValue({ data: { session: null } })
vi.mock('../../../../lib/supabase', () => ({
  defaultDb: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
  },
}))

// Mock permissionService so requireWrite does not throw in unit tests
vi.mock('../../../../core/permissions/service', () => ({
  permissionService: {
    requireWrite: vi.fn(),
  },
}))

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 't1',
    ticketNumber: 7,
    workspace_id: 'ws-a',
    roomId: 'room-1',
    roomName: 'Lab 2',
    assetId: 'asset-1',
    assetSource: 'stock',
    assetName: 'PC-02',
    problemCategory: 'Internet',
    problemArea: 'academica',
    problemDescription: 'Sem conexão',
    status: 'aberto',
    priority: 'normal',
    reportedBy: 'Prof. Maria',
    reportedByEmail: 'maria@labhub.app',
    assignedTo: '',
    createdAt: '2026-06-25T12:00:00Z',
    updatedAt: '2026-06-25T12:00:00Z',
    resolvedAt: null,
    ...overrides,
  }
}

function mockFetchOk(body: unknown, ok = true, status = 200) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status,
    json: async () => body,
  } as Response)
}

beforeEach(() => {
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue({ data: { session: null } })
})

describe('ticketService — consultas locais', () => {
  it('começa vazio e reflete a base local', () => {
    expect(ticketService.getAll()).toHaveLength(0)
    setCol('chamados', [makeTicket(), makeTicket({ id: 't2', status: 'fechado' })])
    expect(ticketService.getAll()).toHaveLength(2)
  })

  it('isArchived / getActive / getArchived separam por estado', () => {
    setCol('chamados', [
      makeTicket({ id: 'a', status: 'aberto' }),
      makeTicket({ id: 'b', status: 'em_atendimento' }),
      makeTicket({ id: 'c', status: 'fechado' }),
      makeTicket({ id: 'd', status: 'resolvido', archived: true }),
    ])
    expect(ticketService.getActive().map((t) => t.id)).toEqual(['a', 'b'])
    expect(ticketService.getArchived().map((t) => t.id)).toEqual(['c', 'd'])
    expect(ticketService.isArchived(makeTicket({ status: 'fechado' }))).toBe(true)
    expect(ticketService.isArchived(makeTicket({ status: 'aberto' }))).toBe(false)
  })

  it('getById e getByIdNoFilter', () => {
    setCol('chamados', [makeTicket({ id: 'x' })])
    expect(ticketService.getById('x')?.id).toBe('x')
    expect(ticketService.getByIdNoFilter('x')?.id).toBe('x')
    expect(ticketService.getById('nao-existe')).toBeUndefined()
  })

  it('filtra por ativo e por sala com status em aberto', () => {
    setCol('chamados', [
      makeTicket({ id: 'a', roomId: 'r1', status: 'aberto' }),
      makeTicket({ id: 'b', roomId: 'r1', status: 'fechado' }),
      makeTicket({ id: 'c', roomId: 'r2', assetId: 'asset-2', status: 'em_atendimento' }),
    ])
    expect(ticketService.getOpenByRoom('r1').map((t) => t.id)).toEqual(['a'])
    expect(ticketService.getOpenByAsset('asset-1', 'stock').map((t) => t.id)).toEqual(['a'])
    expect(ticketService.getHistoryByAsset('asset-1', 'stock').map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('ticketService — API', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('create: POST e persiste localmente', async () => {
    const created = makeTicket({ id: 't-new' })
    mockFetchOk({ ticket: created })

    const result = await ticketService.create({
      roomId: 'room-1',
      roomName: 'Lab 2',
      assetName: '',
      problemCategory: 'Internet',
      problemArea: 'academica',
      problemDescription: 'Sem conexão',
      status: 'aberto',
      reportedBy: 'Prof. Maria',
      reportedByEmail: '',
      assignedTo: '',
      workspace_id: 'ws-a',
    } as TicketFormData)

    expect(result.id).toBe('t-new')
    expect(fetch).toHaveBeenCalledWith('/api/chamados', expect.objectContaining({ method: 'POST' }))
    expect(ticketService.getById('t-new')).toBeDefined()
  })

  it('create: registra auditoria', async () => {
    mockFetchOk({ ticket: makeTicket({ id: 't-new', ticketNumber: 99 }) })
    await ticketService.create({
      roomId: 'room-1',
      roomName: 'Lab 2',
      assetName: '',
      problemCategory: 'Internet',
      reportedBy: 'Prof. Maria',
      reportedByEmail: '',
      assignedTo: '',
      status: 'aberto',
    } as TicketFormData)
    const logs = logService.getAll()
    expect(logs[0].entity).toBe('ticket')
    expect(logs[0].entityLabel).toBe('#99')
  })

  it('update: atualiza local e envia PATCH', async () => {
    setCol('chamados', [makeTicket({ id: 't1', status: 'aberto' })])
    mockFetchOk({ ticket: makeTicket({ id: 't1', status: 'em_atendimento' }) })

    ticketService.update('t1', { status: 'em_atendimento' })

    expect(ticketService.getById('t1')?.status).toBe('em_atendimento')
    // update() fires request() async (getAuthHeaders → getSession); flush microtasks
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/chamados/t1', expect.objectContaining({ method: 'PATCH' }))
    })
  })

  it('getByIdRemote: busca na API e persiste', async () => {
    mockFetchOk({ ticket: makeTicket({ id: 'remote-1' }) })
    const t = await ticketService.getByIdRemote('remote-1')
    expect(t.id).toBe('remote-1')
    expect(ticketService.getByIdNoFilter('remote-1')).toBeDefined()
  })

  it('getByReporter: codifica o nome na query', async () => {
    mockFetchOk({ tickets: [makeTicket()] })
    const list = await ticketService.getByReporter('Maria Souza')
    expect(list).toHaveLength(1)
    expect(fetch).toHaveBeenCalledWith(
      '/api/chamados?reportedBy=Maria%20Souza',
      expect.anything(),
    )
  })

  it('submitFeedback: POST com nota e comentário', async () => {
    mockFetchOk({ ticket: makeTicket({ feedbackRating: 5, feedbackComment: 'Ótimo' }) })
    const t = await ticketService.submitFeedback('t1', 5, 'Ótimo')
    expect(t.feedbackRating).toBe(5)
    expect(fetch).toHaveBeenCalledWith(
      '/api/chamados/t1/feedback',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('getEvents / addEvent', async () => {
    mockFetchOk({ events: [{ id: 'ev-1', type: 'comentario', content: 'ok', author: 'A', photos: [], createdAt: 'x' }] })
    const events = await ticketService.getEvents('t1')
    expect(events).toHaveLength(1)

    mockFetchOk({ event: { id: 'ev-2', type: 'comentario', content: 'novo', author: 'A', photos: [], createdAt: 'x' } })
    const ev = await ticketService.addEvent('t1', { content: 'novo', author: 'A', photos: [] })
    expect(ev.id).toBe('ev-2')
  })

  it('getReports: monta query string com os filtros', async () => {
    const report = {
      total: 1,
      period: { from: 'a', to: 'b' },
      byStatus: {},
      byPriority: {},
      byCategory: {},
      byArea: {},
      byRoom: [],
      byTechnician: [],
      avgResolutionHours: null,
      feedback: { count: 0, average: null },
    } as ChamadosReport
    mockFetchOk({ report })

    const withParams = await ticketService.getReports({ from: '2026-01-01', to: '2026-02-01', workspace_id: 'ws-a' })
    expect(withParams.total).toBe(1)
    expect(fetch).toHaveBeenCalledWith(
      '/api/chamados/reports?from=2026-01-01&to=2026-02-01&workspace_id=ws-a',
      expect.anything(),
    )

    await ticketService.getReports({})
    expect(fetch).toHaveBeenLastCalledWith('/api/chamados/reports', expect.anything())
  })

  it('pullRemote: envia Authorization header quando há sessão', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token-abc' } },
    })
    mockFetchOk({ tickets: [] })
    await ticketService.pullRemote()
    expect(fetch).toHaveBeenCalledWith(
      '/api/chamados',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-abc',
        }),
      }),
    )
  })

  it('pullRemote: funciona sem sessão (sem header Authorization)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    mockFetchOk({ tickets: [] })
    await ticketService.pullRemote()
    const callHeaders = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]?.headers
    expect(callHeaders?.Authorization).toBeUndefined()
    expect(callHeaders?.['Content-Type']).toBe('application/json')
  })

  it('pullRemote: mescla com updatedAt mais recente', async () => {
    setCol('chamados', [makeTicket({ id: 'a', updatedAt: '2026-06-25T10:00:00Z', assignedTo: 'local' })])
    mockFetchOk({
      tickets: [
        makeTicket({ id: 'a', updatedAt: '2026-06-25T11:00:00Z', assignedTo: 'remoto' }),
        makeTicket({ id: 'b', updatedAt: '2026-06-25T09:00:00Z' }),
      ],
    })
    await ticketService.pullRemote()
    expect(ticketService.getById('a')?.assignedTo).toBe('remoto')
    expect(ticketService.getById('b')).toBeDefined()
  })

  it('erro de API lança a mensagem do servidor', async () => {
    mockFetchOk({ error: 'Sala inexistente' }, false, 400)
    await expect(ticketService.getByReporter('X')).rejects.toThrow('Sala inexistente')
  })
})
