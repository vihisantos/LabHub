import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Ticket } from '../../types'

const mockGetCol = vi.hoisted(() => vi.fn(() => [] as Ticket[]))
const mockPersistTickets = vi.hoisted(() => vi.fn())

vi.mock('../../services/ticketService', () => ({
  ticketService: {
    persistTickets: mockPersistTickets,
  },
}))

vi.mock('../../../../lib/db', () => ({
  getCol: mockGetCol,
}))

import { sanitizeStaleTickets } from '../useTickets'

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
  mockPersistTickets.mockImplementation(() => {})
})

describe('sanitizeStaleTickets', () => {
  it('não altera tickets com dados válidos', () => {
    const ticket = makeTicket()
    mockGetCol.mockReturnValue([ticket])

    sanitizeStaleTickets()

    expect(mockPersistTickets).not.toHaveBeenCalled()
    expect(ticket.createdAt).toBe('2026-06-25T10:00:00Z')
    expect(ticket.ticketNumber).toBe(1)
  })

  it('corrige ticket com createdAt inválido (Invalid Date)', () => {
    const ticket = makeTicket({ createdAt: 'invalid-date' })
    mockGetCol.mockReturnValue([ticket])

    sanitizeStaleTickets()

    expect(mockPersistTickets).toHaveBeenCalledTimes(1)
    const persisted = mockPersistTickets.mock.calls[0][0] as Ticket[]
    expect(persisted[0].createdAt).not.toBe('invalid-date')
    expect(isNaN(new Date(persisted[0].createdAt).getTime())).toBe(false)
  })

  it('corrige ticket com createdAt vazio', () => {
    const ticket = makeTicket({ createdAt: '' })
    mockGetCol.mockReturnValue([ticket])

    sanitizeStaleTickets()

    expect(mockPersistTickets).toHaveBeenCalledTimes(1)
    const persisted = mockPersistTickets.mock.calls[0][0] as Ticket[]
    expect(isNaN(new Date(persisted[0].createdAt).getTime())).toBe(false)
  })

  it('corrige ticket com createdAt undefined', () => {
    const ticket = makeTicket({ createdAt: undefined as any })
    mockGetCol.mockReturnValue([ticket])

    sanitizeStaleTickets()

    expect(mockPersistTickets).toHaveBeenCalledTimes(1)
    const persisted = mockPersistTickets.mock.calls[0][0] as Ticket[]
    expect(isNaN(new Date(persisted[0].createdAt).getTime())).toBe(false)
  })

  it('corrige ticket com ticketNumber null', () => {
    const ticket = makeTicket({ ticketNumber: null as any })
    mockGetCol.mockReturnValue([ticket])

    sanitizeStaleTickets()

    expect(mockPersistTickets).toHaveBeenCalledTimes(1)
    const persisted = mockPersistTickets.mock.calls[0][0] as Ticket[]
    expect(persisted[0].ticketNumber).toBe(0)
  })

  it('corrige ticket com ticketNumber undefined', () => {
    const ticket = makeTicket({ ticketNumber: undefined as any })
    mockGetCol.mockReturnValue([ticket])

    sanitizeStaleTickets()

    expect(mockPersistTickets).toHaveBeenCalledTimes(1)
    const persisted = mockPersistTickets.mock.calls[0][0] as Ticket[]
    expect(persisted[0].ticketNumber).toBe(0)
  })

  it('corrige múltiplos tickets com problemas', () => {
    const valid = makeTicket({ id: 't-valid', ticketNumber: 1 })
    const invalidDate = makeTicket({ id: 't-invalid-date', ticketNumber: 2, createdAt: 'bad' })
    const missingNumber = makeTicket({ id: 't-missing-num', ticketNumber: null as any, createdAt: '2026-06-25T10:00:00Z' })
    const both = makeTicket({ id: 't-both', ticketNumber: undefined as any, createdAt: '' })

    mockGetCol.mockReturnValue([valid, invalidDate, missingNumber, both])

    sanitizeStaleTickets()

    expect(mockPersistTickets).toHaveBeenCalledTimes(1)
    const persisted = mockPersistTickets.mock.calls[0][0] as Ticket[]

    // Válido permanece inalterado
    expect(persisted.find((t) => t.id === 't-valid')!.createdAt).toBe('2026-06-25T10:00:00Z')
    expect(persisted.find((t) => t.id === 't-valid')!.ticketNumber).toBe(1)

    // Data inválida corrigida
    expect(isNaN(new Date(persisted.find((t) => t.id === 't-invalid-date')!.createdAt).getTime())).toBe(false)
    expect(persisted.find((t) => t.id === 't-invalid-date')!.ticketNumber).toBe(2)

    // Número faltando corrigido
    expect(persisted.find((t) => t.id === 't-missing-num')!.ticketNumber).toBe(0)

    // Ambos corrigidos
    expect(isNaN(new Date(persisted.find((t) => t.id === 't-both')!.createdAt).getTime())).toBe(false)
    expect(persisted.find((t) => t.id === 't-both')!.ticketNumber).toBe(0)
  })

  it('não grava no IndexedDB quando não há tickets para corrigir', () => {
    mockGetCol.mockReturnValue([])

    sanitizeStaleTickets()

    expect(mockPersistTickets).not.toHaveBeenCalled()
  })

  it('usa timestamp atual para tickets com data inválida', () => {
    const before = Date.now()
    const ticket = makeTicket({ createdAt: 'not-a-date' })
    mockGetCol.mockReturnValue([ticket])

    sanitizeStaleTickets()

    const after = Date.now()
    const persisted = mockPersistTickets.mock.calls[0][0] as Ticket[]
    const fixedDate = new Date(persisted[0].createdAt).getTime()
    expect(fixedDate).toBeGreaterThanOrEqual(before)
    expect(fixedDate).toBeLessThanOrEqual(after)
  })
})
