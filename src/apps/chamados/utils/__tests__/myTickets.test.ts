import { describe, it, expect } from 'vitest'
import {
  dateGroupLabel,
  filterTicketsByQuery,
  formatUpdatedLabel,
  groupTicketsByUpdateDate,
  matchesTicketQuery,
  ticketSubject,
  ticketUpdatedAt,
} from '../myTickets'
import type { Ticket } from '../../types'

/**
 * helpers de apresentação de Meus Chamados.
 *
 * Fixam as duas garantias da tela que mais importam e que são fáceis de
 * quebrar sem querer: o agrupamento por data de ATUALIZAÇÃO (não de criação) e
 * a pesquisa SEMPRE contida no conjunto já autorizado pelo servidor.
 */

const NOW = new Date(2026, 9, 5, 14, 30) // 05/10/2026 14:30 — horário local

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: 't-1',
    ticketNumber: 1042,
    workspace_id: 'ws-a',
    roomId: 'r-1',
    roomName: 'Laboratório 03',
    assetName: 'Notebook Dell',
    problemCategory: 'Computador',
    problemDescription: 'Não liga',
    status: 'em_atendimento',
    priority: 'normal',
    reportedBy: 'Prof. Maria',
    reportedByEmail: '',
    reportedByUserId: 'user-meu',
    assignedTo: 'Técnico 1',
    assignedToUserId: 'user-tec',
    createdAt: '2026-10-01T10:00:00',
    updatedAt: '2026-10-05T08:42:00',
    resolvedAt: null,
    ...over,
  }
}

// ── Data relevante ───────────────────────────────────────────────────────────

describe('ticketUpdatedAt', () => {
  it('usa a data de atualização', () => {
    expect(ticketUpdatedAt(ticket())).toBe('2026-10-05T08:42:00')
  })

  it('cai para createdAt quando o servidor não devolveu updatedAt', () => {
    const t = ticket({ updatedAt: '' })
    expect(ticketUpdatedAt(t)).toBe('2026-10-01T10:00:00')
  })

  it('data inútil vira null em vez de NaN', () => {
    expect(ticketUpdatedAt(ticket({ updatedAt: 'nao-e-data', createdAt: '' }))).toBeNull()
  })
})

// ── Rótulos de data ──────────────────────────────────────────────────────────

describe('dateGroupLabel', () => {
  it('hoje', () => {
    expect(dateGroupLabel('2026-10-05T08:42:00', NOW)).toBe('Hoje')
  })

  it('ontem', () => {
    expect(dateGroupLabel('2026-10-04T23:59:00', NOW)).toBe('Ontem')
  })

  it('data anterior em DD/MM/AAAA', () => {
    expect(dateGroupLabel('2026-09-30T14:00:00', NOW)).toBe('30/09/2026')
  })

  it('vira o dia antes com base no dia LOCAL, não em UTC', () => {
    // 21h no horário local ainda é "hoje" para quem está olhando a tela.
    expect(dateGroupLabel('2026-10-05T21:00:00', NOW)).toBe('Hoje')
  })

  it('data inválida não vira grupo', () => {
    expect(dateGroupLabel('lixo', NOW)).toBeNull()
  })
})

describe('formatUpdatedLabel', () => {
  it('hoje mostra hora', () => {
    const label = formatUpdatedLabel('2026-10-05T08:42:00', NOW)
    expect(label).toMatch(/^Atualizado hoje às /)
    expect(label).toContain('08:42')
  })

  it('ontem mostra hora', () => {
    expect(formatUpdatedLabel('2026-10-04T14:20:00', NOW)).toMatch(/^Atualizado ontem às /)
  })

  it('data antiga mostra a data, sem timestamp cru', () => {
    expect(formatUpdatedLabel('2026-09-30T14:20:00', NOW)).toBe('Atualizado em 30/09/2026')
  })

  it('sem data utilizável não quebra a linha', () => {
    expect(formatUpdatedLabel(null, NOW)).toBe('Atualização não informada')
    expect(formatUpdatedLabel('lixo', NOW)).toBe('Atualização não informada')
  })
})

// ── Agrupamento ──────────────────────────────────────────────────────────────

describe('groupTicketsByUpdateDate', () => {
  const hoje = ticket({ id: 'hoje', ticketNumber: 1, updatedAt: '2026-10-05T08:42:00' })
  const hojeMaisNovo = ticket({ id: 'hoje-2', ticketNumber: 2, updatedAt: '2026-10-05T13:05:00' })
  const ontem = ticket({ id: 'ontem', ticketNumber: 3, updatedAt: '2026-10-04T22:00:00' })
  const antigo1 = ticket({ id: 'antigo-1', ticketNumber: 4, updatedAt: '2026-10-03T10:00:00' })
  const antigo2 = ticket({ id: 'antigo-2', ticketNumber: 5, updatedAt: '2026-10-03T18:00:00' })

  it('separa Hoje, Ontem e datas anteriores', () => {
    const groups = groupTicketsByUpdateDate([hoje, ontem, antigo1], NOW)
    expect(groups.map((g) => g.label)).toEqual(['Hoje', 'Ontem', '03/10/2026'])
  })

  it('ordena dentro do grupo da atualização mais recente para a mais antiga', () => {
    const groups = groupTicketsByUpdateDate([antigo1, hoje, ontem, antigo2, hojeMaisNovo], NOW)
    expect(groups.map((g) => g.label)).toEqual(['Hoje', 'Ontem', '03/10/2026'])
    expect(groups[0].tickets.map((t) => t.id)).toEqual(['hoje-2', 'hoje'])
    expect(groups[1].tickets.map((t) => t.id)).toEqual(['ontem'])
    expect(groups[2].tickets.map((t) => t.id)).toEqual(['antigo-2', 'antigo-1'])
  })

  it('agrupa pela ATUALIZAÇÃO, não pela criação', () => {
    // Aberto em 01/10, atualizado hoje: vai para "Hoje".
    const t = ticket({ createdAt: '2026-10-01T10:00:00', updatedAt: '2026-10-05T09:00:00' })
    const groups = groupTicketsByUpdateDate([t], NOW)
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Hoje')
  })

  it('empate de horário desempata pelo número mais alto', () => {
    const a = ticket({ id: 'a', ticketNumber: 7, updatedAt: '2026-10-05T10:00:00' })
    const b = ticket({ id: 'b', ticketNumber: 8, updatedAt: '2026-10-05T10:00:00' })
    const groups = groupTicketsByUpdateDate([a, b], NOW)
    expect(groups[0].tickets.map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('chamado sem data não some: vai para o grupo final', () => {
    const semData = ticket({ id: 'sem-data', updatedAt: '', createdAt: '' })
    const groups = groupTicketsByUpdateDate([hoje, semData], NOW)
    expect(groups.map((g) => g.label)).toEqual(['Hoje', 'Sem data'])
    expect(groups[1].tickets).toHaveLength(1)
  })

  it('lista vazia não gera grupo', () => {
    expect(groupTicketsByUpdateDate([], NOW)).toEqual([])
  })
})

// ── Pesquisa ─────────────────────────────────────────────────────────────────

describe('matchesTicketQuery', () => {
  it('pesquisa por número', () => {
    expect(matchesTicketQuery(ticket(), '1042')).toBe(true)
    expect(matchesTicketQuery(ticket(), '#1042')).toBe(true)
    expect(matchesTicketQuery(ticket(), '104')).toBe(true)
    expect(matchesTicketQuery(ticket(), '9999')).toBe(false)
  })

  it('pesquisa por assunto', () => {
    expect(matchesTicketQuery(ticket(), 'notebook')).toBe(true)
    expect(matchesTicketQuery(ticket(), 'COMPUTADOR')).toBe(true)
    expect(matchesTicketQuery(ticket({ assetName: '' }), 'Computador')).toBe(true)
    expect(matchesTicketQuery(ticket(), 'impressora')).toBe(false)
  })

  it('pesquisa por local', () => {
    expect(matchesTicketQuery(ticket(), 'laboratório')).toBe(true)
    expect(matchesTicketQuery(ticket(), 'Laboratório 03')).toBe(true)
    expect(matchesTicketQuery(ticket(), 'sala 204')).toBe(false)
  })

  it('pesquisa vazia (ou só espaços) aceita tudo', () => {
    expect(matchesTicketQuery(ticket(), '')).toBe(true)
    expect(matchesTicketQuery(ticket(), '   ')).toBe(true)
  })
})

describe('filterTicketsByQuery', () => {
  const lista = [
    ticket({ id: 'a', ticketNumber: 1042, roomName: 'Laboratório 03', assetName: 'Notebook Dell' }),
    ticket({ id: 'b', ticketNumber: 1038, roomName: 'Sala 204', assetName: 'Projetor Epson', problemCategory: 'Projetor' }),
  ]

  it('filtra dentro do conjunto recebido', () => {
    expect(filterTicketsByQuery(lista, 'Sala 204').map((t) => t.id)).toEqual(['b'])
    expect(filterTicketsByQuery(lista, '1038').map((t) => t.id)).toEqual(['b'])
    expect(filterTicketsByQuery(lista, 'Projetor').map((t) => t.id)).toEqual(['b'])
  })

  it('pesquisa vazia devolve tudo', () => {
    expect(filterTicketsByQuery(lista, '')).toHaveLength(2)
    expect(filterTicketsByQuery(lista, '  ')).toHaveLength(2)
  })

  it('nada encontrado devolve lista vazia, nunca amplia o escopo', () => {
    expect(filterTicketsByQuery(lista, 'inexistente')).toEqual([])
  })
})

describe('ticketSubject', () => {
  it('usa o ativo quando existe, senão a categoria', () => {
    expect(ticketSubject(ticket())).toBe('Notebook Dell')
    expect(ticketSubject(ticket({ assetName: '' }))).toBe('Computador')
  })
})
