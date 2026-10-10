import { describe, it, expect, beforeEach } from 'vitest'
import {
  ANON_REMINDER_SCOPE,
  FEEDBACK_REMINDER_MAX,
  canRemindFeedback,
  clearFeedbackReminder,
  feedbackReminderCount,
  isConcluded,
  isPendingFeedback,
  pendingFeedbackTickets,
  recordFeedbackReminder,
  reminderScope,
} from '../pendingFeedback'
import type { Ticket } from '../../types'

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: 't-1',
    ticketNumber: 1050,
    roomId: 'r-1',
    roomName: 'Laboratório 03',
    assetName: 'Projetor Epson',
    problemCategory: 'Projetor',
    problemDescription: 'Não liga',
    status: 'aberto',
    reportedBy: 'Prof. Maria',
    reportedByEmail: '',
    assignedTo: '',
    createdAt: '2026-10-01T10:00:00',
    updatedAt: '2026-10-05T08:42:00',
    resolvedAt: null,
    ...over,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('pendingFeedback — elegibilidade', () => {
  it('considera concluído apenas resolvido e fechado', () => {
    expect(isConcluded('resolvido')).toBe(true)
    expect(isConcluded('fechado')).toBe(true)
    for (const status of ['aberto', 'a_caminho', 'em_atendimento', 'em_espera', 'indeferido'] as const) {
      expect(isConcluded(status)).toBe(false)
    }
  })

  it('é pendente quando concluído e sem nota', () => {
    expect(isPendingFeedback(ticket({ status: 'resolvido', feedbackRating: undefined }))).toBe(true)
    expect(isPendingFeedback(ticket({ status: 'fechado', feedbackRating: undefined }))).toBe(true)
  })

  it('não é pendente quando já avaliado', () => {
    expect(isPendingFeedback(ticket({ status: 'resolvido', feedbackRating: 4 }))).toBe(false)
    expect(isPendingFeedback(ticket({ status: 'fechado', feedbackRating: 1 }))).toBe(false)
  })

  it('nunca considera em andamento, em espera ou indeferido', () => {
    for (const status of ['aberto', 'a_caminho', 'em_atendimento', 'em_espera', 'indeferido'] as const) {
      expect(isPendingFeedback(ticket({ status, feedbackRating: undefined }))).toBe(false)
    }
  })

  it('nota zero/ausente não conta como avaliado', () => {
    expect(isPendingFeedback(ticket({ status: 'resolvido', feedbackRating: 0 }))).toBe(true)
  })
})

describe('pendingFeedback — lista', () => {
  it('filtra só pendentes e ordena da atualização mais recente', () => {
    const lista = [
      ticket({ id: 'a', status: 'em_atendimento' }),
      ticket({ id: 'b', status: 'resolvido', updatedAt: '2026-10-02T10:00:00' }),
      ticket({ id: 'c', status: 'fechado', updatedAt: '2026-10-04T10:00:00' }),
      ticket({ id: 'd', status: 'resolvido', feedbackRating: 5 }),
    ]

    expect(pendingFeedbackTickets(lista).map((t) => t.id)).toEqual(['c', 'b'])
  })

  it('lista vazia quando não há pendências', () => {
    expect(pendingFeedbackTickets([ticket({ status: 'aberto' })])).toEqual([])
  })
})

describe('pendingFeedback — controle de repetição', () => {
  it('limita a dois lembretes por chamado', () => {
    expect(canRemindFeedback('t-1')).toBe(true)
    expect(feedbackReminderCount('t-1')).toBe(0)

    expect(recordFeedbackReminder('t-1')).toBe(1)
    expect(canRemindFeedback('t-1')).toBe(true)

    expect(recordFeedbackReminder('t-1')).toBe(FEEDBACK_REMINDER_MAX)
    expect(canRemindFeedback('t-1')).toBe(false)
  })

  it('não confunde chamados diferentes', () => {
    recordFeedbackReminder('a')
    recordFeedbackReminder('a')
    expect(canRemindFeedback('a')).toBe(false)
    expect(canRemindFeedback('b')).toBe(true)
  })

  it('limpar devolve o chamado ao estado inicial', () => {
    recordFeedbackReminder('t-1')
    recordFeedbackReminder('t-1')
    clearFeedbackReminder('t-1')
    expect(feedbackReminderCount('t-1')).toBe(0)
    expect(canRemindFeedback('t-1')).toBe(true)
  })

  it('memória corrompida é tratada como zero', () => {
    localStorage.setItem('chamado_feedback_reminder_anon_t-1', '{not-json')
    expect(feedbackReminderCount('t-1')).toBe(0)
    expect(canRemindFeedback('t-1')).toBe(true)
  })
})

describe('pendingFeedback — escopo por usuário', () => {
  it('normaliza a identidade ausente para o escopo anônimo', () => {
    expect(reminderScope(undefined)).toBe(ANON_REMINDER_SCOPE)
    expect(reminderScope(null)).toBe(ANON_REMINDER_SCOPE)
    expect(reminderScope('')).toBe(ANON_REMINDER_SCOPE)
    expect(reminderScope('   ')).toBe(ANON_REMINDER_SCOPE)
    expect(reminderScope('user-1')).toBe('user-1')
  })

  it('grava a chave com identidade + chamado', () => {
    recordFeedbackReminder('t-1', 'user-1')
    expect(localStorage.getItem('chamado_feedback_reminder_user-1_t-1')).not.toBeNull()
  })

  it('não mistura contas no mesmo navegador', () => {
    recordFeedbackReminder('t-1', 'user-1')
    recordFeedbackReminder('t-1', 'user-1')
    expect(canRemindFeedback('t-1', 'user-1')).toBe(false)
    // Outra conta no mesmo navegador começa do zero e ainda pode ser lembrada.
    expect(canRemindFeedback('t-1', 'user-2')).toBe(true)
    expect(feedbackReminderCount('t-1', 'user-2')).toBe(0)
  })

  it('limpar um usuário não afeta o outro', () => {
    recordFeedbackReminder('t-1', 'user-1')
    recordFeedbackReminder('t-1', 'user-2')
    clearFeedbackReminder('t-1', 'user-1')
    expect(feedbackReminderCount('t-1', 'user-1')).toBe(0)
    expect(feedbackReminderCount('t-1', 'user-2')).toBe(1)
  })

  it('o escopo anônimo não colide com o de um usuário', () => {
    recordFeedbackReminder('t-1', 'anon')
    expect(feedbackReminderCount('t-1', 'user-1')).toBe(0)
    expect(feedbackReminderCount('t-1')).toBe(1)
  })
})
