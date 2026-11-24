import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Ticket, TicketFormData } from '../../types'

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
const mockCachedTickets = vi.hoisted(() => vi.fn(() => [] as Ticket[]))
const mockPullRemote = vi.hoisted(() => vi.fn())
const mockRevision = vi.hoisted(() => vi.fn())
const mockBroadcast = vi.hoisted(() => vi.fn())
vi.mock('../useTicketInvalidationBroadcast', () => ({ useTicketInvalidationBroadcast: mockBroadcast }))
vi.mock('../../services/ticketQueueRevision', () => ({ readTicketQueueRevision: mockRevision }))
const mockAutoArchiveResolved = vi.hoisted(() => vi.fn())
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
    autoArchiveResolved: mockAutoArchiveResolved,
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
  },
  // #344: o Realtime e o saneamento leem `cachedTickets()` — a fila do usuário da
  // sessão (`chamados:<userId>`), não a chave literal compartilhada.
  cachedTickets: mockCachedTickets,
}))
vi.mock('../../services/ticketAlerts', () => ({
  syncNewTicketAlerts: mockSyncAlerts,
  alertForNewTickets: mockAlertFor,
  markLocalTicket: mockMarkLocal,
  syncSlaAlerts: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks()
  mockSyncAlerts.mockReturnValue([])
  mockPullRemote.mockResolvedValue(undefined)
  mockRevision.mockReset().mockResolvedValue(null)
  mockAutoArchiveResolved.mockResolvedValue(0)
})

describe('useTickets — CRUD base', () => {
  it('verifica o arquivamento automático uma vez na abertura, fora do polling', async () => {
    mockGetAll.mockReturnValue([])
    const { unmount } = renderHook(() => useTickets())
    await act(async () => {})

    expect(mockAutoArchiveResolved).toHaveBeenCalledTimes(1)
    expect(mockPullRemote).not.toHaveBeenCalled()

    unmount()
  })

  it('carrega e ordena os chamados do mais novo ao mais antigo', async () => {
    mockGetAll.mockReturnValue([
      makeTicket({ id: 'a', createdAt: '2026-06-25T09:00:00Z' }),
      makeTicket({ id: 'b', createdAt: '2026-06-25T11:00:00Z' }),
    ])

    const { result } = renderHook(() => useTickets())
    await act(async () => {})

    expect(mockGetAll).toHaveBeenCalledTimes(1)
    expect(result.current.tickets.map((t) => t.id)).toEqual(['b', 'a'])
    expect(result.current.loading).toBe(false)
  })

  it('create: persiste, marca como local e adiciona ao estado', async () => {
    mockGetAll.mockReturnValue([])
    mockCreate.mockResolvedValue(makeTicket({ id: 'novo' }))

    const { result } = renderHook(() => useTickets())
    await act(async () => {})

    let created: Ticket | undefined
    await act(async () => {
      created = await result.current.create({
        roomId: 'room-1',
        roomName: 'Sala 101',
        assetName: '',
        problemCategory: 'Internet',
        reportedBy: 'Prof. Maria',
        reportedByEmail: '',
        assignedTo: '',
        status: 'aberto',
      } as TicketFormData)
    })

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockMarkLocal).toHaveBeenCalledWith('novo')
    expect(created?.id).toBe('novo')
    expect(result.current.tickets.map((t) => t.id)).toContain('novo')
  })

  it('update: atualiza o estado com o retorno do serviço', async () => {
    const ticket = makeTicket()
    mockGetAll.mockReturnValue([ticket])
    mockUpdate.mockReturnValue({ ...ticket, status: 'em_atendimento' })

    const { result } = renderHook(() => useTickets())
    await act(async () => {})

    act(() => {
      result.current.update('t-1', { status: 'em_atendimento' })
    })

    expect(mockUpdate).toHaveBeenCalledWith('t-1', { status: 'em_atendimento' })
    expect(result.current.tickets[0].status).toBe('em_atendimento')
  })

  it('updateStatus resolvido: grava resolvedAt e limpa statusNote', async () => {
    const ticket = makeTicket({ statusNote: 'Atendendo agora' })
    mockGetAll.mockReturnValue([ticket])
    mockUpdate.mockImplementation((_id: string, data: Partial<Ticket>) => ({ ...ticket, ...data }))

    const { result } = renderHook(() => useTickets())
    await act(async () => {})

    act(() => {
      result.current.updateStatus('t-1', 'resolvido')
    })

    expect(mockUpdate).toHaveBeenCalledWith(
      't-1',
      expect.objectContaining({ status: 'resolvido', statusNote: '' }),
    )
    expect(result.current.tickets[0].resolvedAt).toBeTruthy()
  })

  it('updateStatus fechado: arquiva e grava closedAt', async () => {
    const ticket = makeTicket()
    mockGetAll.mockReturnValue([ticket])
    mockUpdate.mockImplementation((_id: string, data: Partial<Ticket>) => ({ ...ticket, ...data }))

    const { result } = renderHook(() => useTickets())
    await act(async () => {})

    act(() => {
      result.current.updateStatus('t-1', 'fechado')
    })

    expect(mockUpdate).toHaveBeenCalledWith(
      't-1',
      expect.objectContaining({ status: 'fechado', archived: true }),
    )
    expect(result.current.tickets[0].closedAt).toBeTruthy()
  })

  it('remove: remove do estado quando o serviço confirma', async () => {
    mockGetAll.mockReturnValue([makeTicket()])
    mockRemove.mockReturnValue(true)

    const { result } = renderHook(() => useTickets())
    await act(async () => {})

    act(() => {
      result.current.remove('t-1')
    })

    expect(mockRemove).toHaveBeenCalledWith('t-1')
    expect(result.current.tickets).toHaveLength(0)
  })

  it('remove: mantém o chamado se o serviço recusar', async () => {
    mockGetAll.mockReturnValue([makeTicket()])
    mockRemove.mockReturnValue(false)

    const { result } = renderHook(() => useTickets())
    await act(async () => {})

    act(() => {
      result.current.remove('t-1')
    })

    expect(result.current.tickets).toHaveLength(1)
  })

  it('polling de contingência sincroniza quando o Realtime não está conectado', async () => {
    mockGetAll.mockReturnValue([])
    const { result } = renderHook(() => useTickets())
    await act(async () => {})

    expect(mockPullRemote).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(60000)
    })
    await act(async () => {})

    expect(mockPullRemote).toHaveBeenCalled()
    expect(result.current.tickets).toHaveLength(0)
  })
})

describe('useTickets — watchdog de versão', () => {
  async function tick() {
    await act(async () => { await vi.advanceTimersByTimeAsync(45000) })
  }

  it('sincroniza a primeira versão, ignora versão igual e busca versão alterada', async () => {
    mockGetAll.mockReturnValue([])
    mockRevision.mockResolvedValue('v1')
    const { unmount } = renderHook(() => useTickets())
    await act(async () => {})
    mockPullRemote.mockClear()
    await tick()
    expect(mockPullRemote).toHaveBeenCalledTimes(1)
    await tick()
    expect(mockPullRemote).toHaveBeenCalledTimes(1)
    mockRevision.mockResolvedValue('v2')
    await tick()
    expect(mockPullRemote).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('consulta a fila em aba oculta quando a versão é indisponível', async () => {
    mockGetAll.mockReturnValue([])
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const { unmount } = renderHook(() => useTickets())
    try {
      await act(async () => {})
      mockPullRemote.mockClear()
      await tick()
      expect(mockPullRemote).toHaveBeenCalledTimes(1)
      expect(mockAutoArchiveResolved).toHaveBeenCalledTimes(1)
    } finally {
      unmount()
      visibility.mockRestore()
    }
    mockPullRemote.mockClear()
    await tick()
    expect(mockPullRemote).not.toHaveBeenCalled()
  })

  it('não confirma a versão de uma sincronização que falhou', async () => {
    mockGetAll.mockReturnValue([])
    mockRevision.mockResolvedValue('v1')
    const { unmount } = renderHook(() => useTickets())
    await act(async () => {})
    mockPullRemote.mockClear().mockRejectedValueOnce(new Error('offline'))
    await tick()
    await tick()
    expect(mockPullRemote).toHaveBeenCalledTimes(2)
    unmount()
  })
})

describe('useTickets — background events and Worker failure', () => {
  it('processa invalidação Broadcast com a aba oculta', async () => {
    mockGetAll.mockReturnValue([])
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const { unmount } = renderHook(() => useTickets())
    try {
      await act(async () => {})
      mockPullRemote.mockClear()
      const calls = mockBroadcast.mock.calls
      const invalidate = calls[calls.length - 1][1] as () => void
      await act(async () => {
        invalidate()
        await vi.advanceTimersByTimeAsync(250)
      })
      expect(mockPullRemote).toHaveBeenCalledTimes(1)
    } finally {
      unmount()
      visibility.mockRestore()
    }
  })

  it('substitui Worker com erro por timer e limpa o timer ao desmontar', async () => {
    mockGetAll.mockReturnValue([])
    const terminate = vi.fn()
    let worker: FakeWorker | undefined
    class FakeWorker {
      onmessage: (() => void) | null = null
      onerror: (() => void) | null = null
      terminate = terminate
      constructor() { worker = this }
    }
    vi.stubGlobal('Worker', FakeWorker)
    const { unmount } = renderHook(() => useTickets())
    try {
      await act(async () => {})
      mockPullRemote.mockClear()
      expect(worker?.onerror).toBeTypeOf('function')
      act(() => { worker?.onerror?.() })
      expect(terminate).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(45000) })
      expect(mockPullRemote).toHaveBeenCalledTimes(1)
    } finally {
      unmount()
      vi.unstubAllGlobals()
    }
    mockPullRemote.mockClear()
    await act(async () => { await vi.advanceTimersByTimeAsync(90000) })
    expect(mockPullRemote).not.toHaveBeenCalled()
  })
})
