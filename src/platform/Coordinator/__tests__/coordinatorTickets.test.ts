import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Ticket } from '../../../apps/chamados/types'
import {
  filterScopeTickets,
  scopedUnitFilter,
  sortScopeTickets,
  SCOPE_UNIT_ALL,
  SCOPE_TICKETS_DEFAULT_FILTERS,
  type ScopeTicketsFilters,
} from '../coordinatorTickets'

const NOW = new Date('2026-08-13T10:00:00Z')
const HOUR = 1000 * 60 * 60

function mkTicket(over: Partial<Ticket> & Pick<Ticket, 'id'>): Ticket {
  return {
    ticketNumber: 7,
    workspace_id: 'ws1',
    roomId: 'r1',
    roomName: 'Sala 101',
    assetName: 'Computador',
    problemCategory: 'Internet',
    problemDescription: 'sem conexão na rede',
    status: 'aberto',
    priority: 'normal',
    reportedBy: 'Prof. Ana',
    reportedByEmail: 'ana@labhub.local',
    assignedTo: 'Técnico 1',
    createdAt: new Date(NOW.getTime() - 1 * HOUR).toISOString(),
    updatedAt: new Date(NOW.getTime() - 1 * HOUR).toISOString(),
    resolvedAt: null,
    ...over,
  }
}

const baseFilters = (): ScopeTicketsFilters => ({ ...SCOPE_TICKETS_DEFAULT_FILTERS })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('scopedUnitFilter — guard fail-closed do filtro de unidade', () => {
  it('mantém unidade dentro do escopo', () => {
    expect(scopedUnitFilter('ws2', ['ws1', 'ws2'])).toBe('ws2')
  })

  it('unidade fora do escopo / inventada volta para todas', () => {
    expect(scopedUnitFilter('ws99', ['ws1', 'ws2'])).toBe(SCOPE_UNIT_ALL)
    expect(scopedUnitFilter('ws1', ['ws2'])).toBe(SCOPE_UNIT_ALL)
  })

  it('valor "all" permanece "all"', () => {
    expect(scopedUnitFilter(SCOPE_UNIT_ALL, ['ws1'])).toBe(SCOPE_UNIT_ALL)
  })
})

describe('filterScopeTickets — filtros locais sobre o conjunto já escopado', () => {
  it('sem filtros ativos devolve todos (mesma ordem do input)', () => {
    const list = [mkTicket({ id: 'a' }), mkTicket({ id: 'b', workspace_id: 'ws2' })]
    expect(filterScopeTickets(list, baseFilters()).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('filtra por unidade', () => {
    const list = [mkTicket({ id: 'a' }), mkTicket({ id: 'b', workspace_id: 'ws2' })]
    const out = filterScopeTickets(list, { ...baseFilters(), unit: 'ws2' })
    expect(out.map((t) => t.id)).toEqual(['b'])
  })

  it('filtra por status', () => {
    const list = [
      mkTicket({ id: 'a' }),
      mkTicket({ id: 'b', status: 'em_atendimento' }),
      mkTicket({ id: 'c', status: 'fechado' }),
    ]
    expect(filterScopeTickets(list, { ...baseFilters(), status: 'em_atendimento' }).map((t) => t.id)).toEqual(['b'])
  })

  it('filtra por prioridade normalizando ausência para "normal"', () => {
    const list = [
      mkTicket({ id: 'sem-prioridade', priority: undefined }),
      mkTicket({ id: 'alta', priority: 'alta' }),
      mkTicket({ id: 'urgente', priority: 'urgente' }),
    ]
    expect(filterScopeTickets(list, { ...baseFilters(), priority: 'normal' }).map((t) => t.id)).toEqual(['sem-prioridade'])
    expect(filterScopeTickets(list, { ...baseFilters(), priority: 'alta' }).map((t) => t.id)).toEqual(['alta'])
    expect(filterScopeTickets(list, { ...baseFilters(), priority: 'urgente' }).map((t) => t.id)).toEqual(['urgente'])
  })

  it('filtra por SLA seguindo a FONTE ÚNICA (getSlaState) com near/overdue/ok', () => {
    const list = [
      mkTicket({ id: 'ok', createdAt: new Date(NOW.getTime() - 1 * HOUR).toISOString() }),
      mkTicket({ id: 'near', createdAt: new Date(NOW.getTime() - 20 * HOUR).toISOString() }),
      mkTicket({ id: 'overdue', createdAt: new Date(NOW.getTime() - 30 * HOUR).toISOString() }),
      // status fora do fluxo aberto nunca participa de um filtro de SLA
      mkTicket({ id: 'fechado', status: 'fechado', createdAt: new Date(NOW.getTime() - 30 * HOUR).toISOString() }),
    ]
    expect(filterScopeTickets(list, { ...baseFilters(), sla: 'ok' }).map((t) => t.id)).toEqual(['ok'])
    expect(filterScopeTickets(list, { ...baseFilters(), sla: 'near' }).map((t) => t.id)).toEqual(['near'])
    expect(filterScopeTickets(list, { ...baseFilters(), sla: 'overdue' }).map((t) => t.id)).toEqual(['overdue'])
  })

  it('busca local case-insensitive por número, local, categoria, descrição, solicitante e responsável', () => {
    const list = [
      mkTicket({ id: 'num', ticketNumber: 404 }),
      mkTicket({ id: 'local', assetName: 'Projetor X1' }),
      mkTicket({ id: 'categoria', problemCategory: 'Áudio' }),
      mkTicket({ id: 'descricao', problemDescription: 'tela azul ao iniciar' }),
      mkTicket({ id: 'solicitante', reportedBy: 'Prof. Bruno' }),
      mkTicket({ id: 'email', reportedByEmail: 'bruno@labhub.local' }),
      mkTicket({ id: 'responsavel', assignedTo: 'Técnico 2' }),
    ]
    const cases: Array<[string, string]> = [
      ['num', '404'],
      ['local', 'projetor'],
      ['categoria', 'áudio'],
      ['descricao', 'AZUL'],
      ['solicitante', 'prof. bruno'],
      ['email', 'BRUNO@LABHUB'],
      ['responsavel', 'técnico 2'],
    ]
    for (const [expectedId, q] of cases) {
      expect(filterScopeTickets(list, { ...baseFilters(), query: q }).map((t) => t.id)).toEqual([expectedId])
    }
  })

  it('combina unidade + status + prioridade (cruzamento)', () => {
    const list = [
      mkTicket({ id: 'a1', workspace_id: 'ws1', status: 'aberto', priority: 'alta' }),
      mkTicket({ id: 'a2', workspace_id: 'ws1', status: 'aberto', priority: 'normal' }),
      mkTicket({ id: 'b1', workspace_id: 'ws2', status: 'aberto', priority: 'alta' }),
    ]
    const out = filterScopeTickets(list, {
      unit: 'ws1',
      status: 'aberto',
      priority: 'alta',
      sla: 'all',
      query: '',
    })
    expect(out.map((t) => t.id)).toEqual(['a1'])
  })

  it('busca sem correspondência devolve lista vazia', () => {
    const list = [mkTicket({ id: 'a' })]
    expect(filterScopeTickets(list, { ...baseFilters(), query: 'não existe' })).toEqual([])
  })
})

describe('sortScopeTickets — ordenação por updatedAt desc, sem mutar input', () => {
  it('mais recente primeiro e array original preservado', () => {
    const older = mkTicket({ id: 'old', updatedAt: new Date(NOW.getTime() - 5 * HOUR).toISOString() })
    const newer = mkTicket({ id: 'new', updatedAt: NOW.toISOString() })
    const input = [older, newer]
    const out = sortScopeTickets(input)
    expect(out.map((t) => t.id)).toEqual(['new', 'old'])
    expect(input.map((t) => t.id)).toEqual(['old', 'new'])
    expect(out).not.toBe(input)
  })
})
