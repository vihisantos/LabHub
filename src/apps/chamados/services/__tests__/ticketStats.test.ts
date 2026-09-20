import { describe, it, expect } from 'vitest'
import { analyzeTickets } from '../ticketStats'
import type { Ticket } from '../../types'

function ticket(id: string, over: Partial<Ticket> = {}): Ticket {
  return {
    id,
    ticketNumber: 1,
    workspace_id: 'ws1',
    roomId: 'r1',
    roomName: 'Sala 101',
    assetName: 'Computador',
    problemCategory: 'Internet',
    problemDescription: '',
    status: 'aberto',
    priority: 'normal',
    reportedBy: '',
    reportedByEmail: '',
    assignedTo: '',
    assignedToUserId: 'u-tech',
    archived: false,
    resolvedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function emptySummary() {
  return {
    total: 0,
    abertos: 0,
    emAtendimento: 0,
    semResponsavel: 0,
    altaPrioridade: 0,
    urgentes: 0,
    byStatus: { aberto: 0, a_caminho: 0, em_atendimento: 0, resolvido: 0, fechado: 0 },
    byPriority: { baixa: 0, normal: 0, alta: 0, urgente: 0 },
  }
}

describe('analyzeTickets (C1, PR B #236)', () => {
  it('conjunto completo: conta todas as métricas do escopo fornecido', () => {
    const tickets = [
      ticket('t1', { status: 'aberto', priority: 'alta' }),
      ticket('t2', { status: 'em_atendimento', priority: 'urgente', assignedToUserId: '' }),
      ticket('t3', { status: 'a_caminho', priority: 'normal' }),
      ticket('t4', { status: 'resolvido', priority: 'baixa', assignedToUserId: '' }),
    ]

    const summary = analyzeTickets(tickets)

    expect(summary.total).toBe(4)
    expect(summary.abertos).toBe(1)
    expect(summary.emAtendimento).toBe(2)
    expect(summary.semResponsavel).toBe(2)
    expect(summary.altaPrioridade).toBe(1)
    expect(summary.urgentes).toBe(1)
    expect(summary.byStatus).toEqual({
      aberto: 1,
      a_caminho: 1,
      em_atendimento: 1,
      resolvido: 1,
      fechado: 0,
    })
    expect(summary.byPriority).toEqual({
      baixa: 1,
      normal: 1,
      alta: 1,
      urgente: 1,
    })
  })

  it('arquivados são excluídos de todas as métricas e distribuições', () => {
    const summary = analyzeTickets([
      ticket('t1', { archived: true, status: 'aberto', priority: 'urgente' }),
      ticket('t2', { status: 'aberto' }),
    ])

    expect(summary).toEqual({
      total: 1,
      abertos: 1,
      emAtendimento: 0,
      semResponsavel: 0,
      altaPrioridade: 0,
      urgentes: 0,
      byStatus: { aberto: 1, a_caminho: 0, em_atendimento: 0, resolvido: 0, fechado: 0 },
      byPriority: { baixa: 0, normal: 1, alta: 0, urgente: 0 },
    })
  })

  it('fechados são excluídos das métricas abertas (e do conjunto operacional)', () => {
    const summary = analyzeTickets([
      ticket('t-fechado', { status: 'fechado' }),
      ticket('t-outro-fechado', { status: 'fechado', priority: 'urgente' }),
      ticket('t-aberto', { status: 'aberto' }),
    ])

    expect(summary.total).toBe(1)
    expect(summary.abertos).toBe(1)
    expect(summary.emAtendimento).toBe(0)
    expect(summary.urgentes).toBe(0)
    expect(summary.byStatus.fechado).toBe(0)
    expect(summary.byStatus.aberto).toBe(1)
  })

  it('a_caminho e em_atendimento alimentam a métrica emAtendimento', () => {
    const summary = analyzeTickets([
      ticket('t1', { status: 'a_caminho' }),
      ticket('t2', { status: 'em_atendimento' }),
      ticket('t3', { status: 'em_atendimento' }),
    ])

    expect(summary.emAtendimento).toBe(3)
    expect(summary.abertos).toBe(0)
    expect(summary.byStatus).toMatchObject({ a_caminho: 1, em_atendimento: 2 })
  })

  it('sem responsável: sem assignedToUserId (inclui resolvido), ignora arquivados', () => {
    const summary = analyzeTickets([
      ticket('t1', { assignedToUserId: '' }),
      ticket('t2', { assignedToUserId: undefined }),
      ticket('t3', { assignedToUserId: 'u-tech' }),
      ticket('t4', { status: 'resolvido', assignedToUserId: '' }),
      ticket('t5', { archived: true, assignedToUserId: '' }),
    ])

    expect(summary.semResponsavel).toBe(3)
    expect(summary.total).toBe(4)
  })

  it('alta prioridade conta operacionais com priority alta (qualquer status aberto/resolvido)', () => {
    const summary = analyzeTickets([
      ticket('t1', { priority: 'alta', status: 'aberto' }),
      ticket('t2', { priority: 'alta', status: 'resolvido' }),
      ticket('t3', { priority: 'alta', archived: true }),
    ])

    expect(summary.altaPrioridade).toBe(2)
    expect(summary.total).toBe(2)
  })

  it('urgentes conta operacionais com priority urgente, excluindo arquivados/fechados', () => {
    const summary = analyzeTickets([
      ticket('t1', { priority: 'urgente' }),
      ticket('t2', { priority: 'urgente', status: 'resolvido' }),
      ticket('t3', { priority: 'urgente', status: 'fechado' }),
      ticket('t4', { priority: 'urgente', archived: true }),
    ])

    expect(summary.urgentes).toBe(2)
  })

  it('distribuição por status: todos os buckets conhecidos presentes (zero preenchido)', () => {
    const summary = analyzeTickets([
      ticket('t1', { status: 'aberto' }),
      ticket('t2', { status: 'resolvido' }),
      ticket('t3', { status: 'resolvido' }),
    ])

    expect(summary.byStatus).toEqual({
      aberto: 1,
      a_caminho: 0,
      em_atendimento: 0,
      resolvido: 2,
      fechado: 0,
    })
  })

  it('distribuição por prioridade: buckets determinísticos, sem prioridade não entra', () => {
    const summary = analyzeTickets([
      ticket('t1', { priority: 'baixa' }),
      ticket('t2', { priority: 'urgente' }),
      ticket('t3', { priority: undefined }),
      ticket('t4', { priority: 'urgente', archived: true }),
    ])

    expect(summary.byPriority).toEqual({
      baixa: 1,
      normal: 0,
      alta: 0,
      urgente: 1,
    })
    expect(summary.total).toBe(3)
  })

  it('array vazio: tudo zero, todos os buckets presentes', () => {
    expect(analyzeTickets([])).toEqual(emptySummary())
  })

  it('zeros honestos: métricas que não se aplicam são exatamente zero', () => {
    const summary = analyzeTickets([ticket('t1', { status: 'aberto', priority: 'normal' })])

    expect(summary.total).toBe(1)
    expect(summary.abertos).toBe(1)
    expect(summary.emAtendimento).toBe(0)
    expect(summary.semResponsavel).toBe(0)
    expect(summary.altaPrioridade).toBe(0)
    expect(summary.urgentes).toBe(0)
    expect(summary.byStatus).toEqual({
      aberto: 1,
      a_caminho: 0,
      em_atendimento: 0,
      resolvido: 0,
      fechado: 0,
    })
    expect(summary.byPriority).toEqual({
      baixa: 0,
      normal: 1,
      alta: 0,
      urgente: 0,
    })
  })

  it('é determinística: mesma entrada produz o mesmo resultado (instâncias novas)', () => {
    const tickets = [
      ticket('t1', { status: 'aberto', priority: 'urgente' }),
      ticket('t2', { status: 'em_atendimento', priority: 'alta' }),
    ]

    const first = analyzeTickets(tickets)
    const second = analyzeTickets(tickets)

    expect(second).toEqual(first)
    expect(second).not.toBe(first)
  })

  it('é determinística: ordem de entrada não altera o resultado', () => {
    const a = [ticket('t1', { status: 'aberto' }), ticket('t2', { status: 'fechado' })]
    const b = [ticket('t2', { status: 'fechado' }), ticket('t1', { status: 'aberto' })]

    expect(analyzeTickets(b)).toEqual(analyzeTickets(a))
  })

  it('não depende de workspace: calcula somente sobre o array fornecido', () => {
    const summary = analyzeTickets([
      ticket('t1', { workspace_id: 'ws1', status: 'aberto' }),
      ticket('t2', { workspace_id: 'ws2', status: 'aberto' }),
      ticket('t3', { workspace_id: undefined, status: 'aberto' }),
    ])

    expect(summary.total).toBe(3)
    expect(summary.abertos).toBe(3)
    expect(summary.semResponsavel).toBe(0)
  })

  it('não muta o array de entrada', () => {
    const tickets = [
      ticket('t1', { status: 'aberto' }),
      ticket('t2', { status: 'em_atendimento', priority: 'urgente' }),
    ]
    const snapshot = tickets.map((t) => ({ ...t }))

    analyzeTickets(tickets)

    expect(tickets).toEqual(snapshot)
  })
})