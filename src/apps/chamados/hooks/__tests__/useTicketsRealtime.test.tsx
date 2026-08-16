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

vi.mock('../../services/ticketService', () => ({
  ticketService: {
    getAll: mockGetAll,
    pullRemote: mockPullRemote,
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
  },
}))

vi.mock('../../services/ticketAlerts', () => ({
  syncNewTicketAlerts: mockSyncAlerts,
  alertForNewTickets: mockAlertFor,
  markLocalTicket: mockMarkLocal,
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
