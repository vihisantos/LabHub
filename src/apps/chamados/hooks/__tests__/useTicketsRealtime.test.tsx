import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Ticket } from '../../types'

// Canal Realtime simulado (mesmo padrão de src/lib/__tests__/useRealtimeSubscription.test.ts)
const { mockChannelOn, mockChannelSubscribe, mockRemoveChannel } = vi.hoisted(() => ({
  mockChannelOn: vi.fn().mockReturnThis(),
  mockChannelSubscribe: vi.fn().mockReturnThis(),
  mockRemoveChannel: vi.fn(),
}))

const { mockChannel } = vi.hoisted(() => ({
  mockChannel: vi.fn(() => ({ on: mockChannelOn, subscribe: mockChannelSubscribe })),
}))

vi.mock('../../../../lib/supabase', () => ({
  defaultDb: { channel: mockChannel, removeChannel: mockRemoveChannel },
}))

const mockGetAll = vi.hoisted(() => vi.fn())
const mockPullRemote = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockRemove = vi.hoisted(() => vi.fn())
const mockSyncAlerts = vi.hoisted(() => vi.fn())
const mockAlertFor = vi.hoisted(() => vi.fn())
const mockMarkLocal = vi.hoisted(() => vi.fn())
const mockPersistTickets = vi.hoisted(() => vi.fn())

vi.mock('../../services/ticketService', () => ({
  ticketService: {
    getAll: mockGetAll,
    pullRemote: mockPullRemote,
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
    persistTickets: mockPersistTickets,
  },
}))

vi.mock('../../services/ticketAlerts', () => ({
  syncNewTicketAlerts: mockSyncAlerts,
  alertForNewTickets: mockAlertFor,
  markLocalTicket: mockMarkLocal,
}))

const mockGetCol = vi.hoisted(() => vi.fn(() => [] as Ticket[]))
const mockSetCol = vi.hoisted(() => vi.fn())

vi.mock('../../../../lib/db', () => ({
  getCol: mockGetCol,
  setCol: mockSetCol,
}))

import { useTickets } from '../useTickets'

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 't-1',
    ticketNumber: 1,
    workspace_id: 'ws-a',
    roomId: 'room-1',
    roomName: 'Sala 101',
    assetName: '',
    problemCategory: 'Internet',
    problemArea: 'academica',
    problemDescription: 'Sem conexão',
    status: 'aberto',
    priority: 'normal',
    reportedBy: 'Prof. Maria',
    reportedByEmail: '',
    assignedTo: '',
    createdAt: '2026-06-25T10:00:00Z',
    updatedAt: '2026-06-25T10:00:00Z',
    resolvedAt: null,
    ...overrides,
  }
}

function realtimeCallback(): (payload: any) => void {
  const call = mockChannelOn.mock.calls.find((c) => c[0] === 'postgres_changes')
  if (!call) throw new Error('Canal realtime não registrado')
  return call[2]
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSyncAlerts.mockReturnValue([])
  mockPersistTickets.mockImplementation(() => {})
})

describe('useTickets — Realtime (chamado criado em outro navegador aparece sem recarregar)', () => {
  it('INSERT: adiciona o chamado novo do formulário público no topo da lista sem re-fetch', async () => {
    mockGetAll.mockReturnValue([makeTicket()])

    const { result } = renderHook(() => useTickets())
    await act(async () => {})

    expect(mockGetAll).toHaveBeenCalledTimes(1)
    expect(result.current.tickets.map((t) => t.id)).toEqual(['t-1'])

    const novo = makeTicket({
      id: 't-2',
      ticketNumber: 2,
      roomName: 'Lab 2',
      problemCategory: 'Projetor',
      reportedBy: 'Prof. João',
      createdAt: '2026-06-25T11:00:00Z',
      updatedAt: '2026-06-25T11:00:00Z',
    })
    mockSyncAlerts.mockReturnValue([novo])

    act(() => {
      realtimeCallback()({
        schema: 'public',
        table: 'chamados_tickets',
        commit_timestamp: '2026-06-25T11:00:00Z',
        eventType: 'INSERT',
        new: novo,
        old: {},
        errors: [],
      })
    })

    // Aparece na hora, sem nova chamada ao servidor
    expect(result.current.tickets.map((t) => t.id)).toEqual(['t-2', 't-1'])
    expect(result.current.tickets[0].roomName).toBe('Lab 2')
    expect(mockGetAll).toHaveBeenCalledTimes(1)
    // Alerta o TI sobre o chamado novo
    expect(mockAlertFor).toHaveBeenCalledWith([novo])
  })

  it('INSERT duplicado (mesmo id) não duplica o ticket', async () => {
    const ticket = makeTicket()
    mockGetAll.mockReturnValue([ticket])

    const { result } = renderHook(() => useTickets())
    await act(async () => {})

    act(() => {
      realtimeCallback()({
        schema: 'public',
        table: 'chamados_tickets',
        commit_timestamp: '2026-06-25T11:00:00Z',
        eventType: 'INSERT',
        new: ticket,
        old: {},
        errors: [],
      })
    })

    expect(result.current.tickets).toHaveLength(1)
    expect(mockAlertFor).not.toHaveBeenCalled()
  })

  it('UPDATE: reflete mudança de status feita por outro técnico sem esperar o polling', async () => {
    mockGetAll.mockReturnValue([makeTicket()])

    const { result } = renderHook(() => useTickets())
    await act(async () => {})

    act(() => {
      realtimeCallback()({
        schema: 'public',
        table: 'chamados_tickets',
        commit_timestamp: '2026-06-25T12:00:00Z',
        eventType: 'UPDATE',
        new: makeTicket({ status: 'em_atendimento', statusNote: 'Técnico a caminho' }),
        old: { id: 't-1' },
        errors: [],
      })
    })

    expect(result.current.tickets[0].status).toBe('em_atendimento')
    expect(result.current.tickets[0].statusNote).toBe('Técnico a caminho')
    expect(mockGetAll).toHaveBeenCalledTimes(1)
  })

  it('DELETE: remove o chamado da lista em tempo real', async () => {
    mockGetAll.mockReturnValue([
      makeTicket({ id: 't-1' }),
      makeTicket({ id: 't-2', ticketNumber: 2, createdAt: '2026-06-25T11:00:00Z' }),
    ])

    const { result } = renderHook(() => useTickets())
    await act(async () => {})

    act(() => {
      realtimeCallback()({
        schema: 'public',
        table: 'chamados_tickets',
        commit_timestamp: '2026-06-25T12:00:00Z',
        eventType: 'DELETE',
        new: {},
        old: { id: 't-1' },
        errors: [],
      })
    })

    expect(result.current.tickets.map((t) => t.id)).toEqual(['t-2'])
  })
})

describe('useTickets — Realtime persiste no IndexedDB', () => {
  it('INSERT: persiste o novo ticket no cache local', async () => {
    mockGetAll.mockReturnValue([makeTicket()])

    renderHook(() => useTickets())
    await act(async () => {})

    mockPersistTickets.mockClear()

    const novo = makeTicket({
      id: 't-2',
      ticketNumber: 2,
      createdAt: '2026-06-25T11:00:00Z',
      updatedAt: '2026-06-25T11:00:00Z',
    })

    act(() => {
      realtimeCallback()({
        schema: 'public',
        table: 'chamados_tickets',
        commit_timestamp: '2026-06-25T11:00:00Z',
        eventType: 'INSERT',
        new: novo,
        old: {},
        errors: [],
      })
    })

    expect(mockPersistTickets).toHaveBeenCalledTimes(1)
    const persisted = mockPersistTickets.mock.calls[0][0] as Ticket[]
    expect(persisted.some((t) => t.id === 't-2')).toBe(true)
  })

  it('UPDATE: persiste a mudança no cache local', async () => {
    mockGetAll.mockReturnValue([makeTicket()])
    mockGetCol.mockReturnValue([makeTicket()])

    renderHook(() => useTickets())
    await act(async () => {})

    mockPersistTickets.mockClear()

    act(() => {
      realtimeCallback()({
        schema: 'public',
        table: 'chamados_tickets',
        commit_timestamp: '2026-06-25T12:00:00Z',
        eventType: 'UPDATE',
        new: makeTicket({ status: 'em_atendimento' }),
        old: { id: 't-1' },
        errors: [],
      })
    })

    expect(mockPersistTickets).toHaveBeenCalledTimes(1)
    const persisted = mockPersistTickets.mock.calls[0][0] as Ticket[]
    expect(persisted[0].status).toBe('em_atendimento')
  })

  it('DELETE: remove do cache local', async () => {
    mockGetAll.mockReturnValue([
      makeTicket({ id: 't-1' }),
      makeTicket({ id: 't-2', ticketNumber: 2, createdAt: '2026-06-25T11:00:00Z' }),
    ])

    renderHook(() => useTickets())
    await act(async () => {})

    mockPersistTickets.mockClear()

    act(() => {
      realtimeCallback()({
        schema: 'public',
        table: 'chamados_tickets',
        commit_timestamp: '2026-06-25T12:00:00Z',
        eventType: 'DELETE',
        new: {},
        old: { id: 't-1' },
        errors: [],
      })
    })

    expect(mockPersistTickets).toHaveBeenCalledTimes(1)
    const persisted = mockPersistTickets.mock.calls[0][0] as Ticket[]
    expect(persisted.every((t) => t.id !== 't-1')).toBe(true)
  })

  it('UPDATERealtime + reabura: ticket mantém valor atualizado', async () => {
    mockGetAll.mockReturnValue([makeTicket()])
    mockGetCol.mockReturnValue([makeTicket()])

    const { unmount } = renderHook(() => useTickets())
    await act(async () => {})

    // Simula mudança via Realtime
    act(() => {
      realtimeCallback()({
        schema: 'public',
        table: 'chamados_tickets',
        commit_timestamp: '2026-06-25T12:00:00Z',
        eventType: 'UPDATE',
        new: makeTicket({ status: 'em_atendimento', updatedAt: '2026-06-25T12:00:00Z' }),
        old: { id: 't-1' },
        errors: [],
      })
    })

    // Verifica que persistiu
    expect(mockPersistTickets).toHaveBeenCalled()
    const persisted = mockPersistTickets.mock.calls[mockPersistTickets.mock.calls.length - 1][0] as Ticket[]
    expect(persisted[0].status).toBe('em_atendimento')

    unmount()

    // Simula reabertura: getAll retorna dados do cache (que foi persistido)
    mockGetAll.mockReturnValue(persisted)
    mockPersistTickets.mockClear()

    const { result: result2 } = renderHook(() => useTickets())
    await act(async () => {})

    expect(result2.current.tickets[0].status).toBe('em_atendimento')
  })
})

describe('useTickets — syncRemote e reload', () => {
  it('syncRemote atualiza syncing durante a operação', async () => {
    mockGetAll.mockReturnValue([])
    let resolvePull!: () => void
    mockPullRemote.mockImplementation(() => new Promise<void>((r) => { resolvePull = r }))

    const { result } = renderHook(() => useTickets())
    await act(async () => {})

    expect(result.current.syncing).toBe(false)

    act(() => {
      result.current.reload()
    })

    // Durante a promise, syncing deve ser true
    expect(result.current.syncing).toBe(true)

    await act(async () => { resolvePull() })

    expect(result.current.syncing).toBe(false)
  })
})
