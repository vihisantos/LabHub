import type { Ticket } from '../types'

/**
 * Lembrete de avaliação — elegibilidade e controle de repetição (issue #370).
 *
 * Tudo aqui opera sobre a coleção PESSOAL já autorizada pelo servidor
 * (`GET /api/chamados?mine=true`). Nenhuma função consulta a rede nem decide
 * autorização: a fronteira de acesso ao conjunto é o endpoint, como em
 * `myTickets.ts`. A memória local abaixo NUNCA é prova de avaliação nem de
 * posse — é só controle de quantas vezes um aviso já apareceu.
 *
 * ── Elegibilidade ─────────────────────────────────────────────────────────────
 * Um chamado gera lembrete quando está EFETIVAMENTE CONCLUÍDO e ainda sem nota.
 * "Concluído" é a mesma definição do gate de feedback do backend
 * (`status in (resolvido, fechado)`), então em andamento, em espera, indeferido
 * e cancelado nunca entram — a pendência é derivada do estado real do chamado,
 * não de uma heurística de UI. Depois de avaliado o servidor devolve
 * `feedbackRating`, e o chamado sai da lista sozinho.
 *
 * ── Controle de repetição ─────────────────────────────────────────────────────
 * O aviso não pode reaparecer a cada visita/login. A memória fica em
 * `localStorage`, chaveada por USUÁRIO + chamado, e limita a DOIS lembretes por
 * chamado: o inicial e um adicional. Atingido o limite, o chamado deixa de ser
 * lembrado até ser avaliado.
 *
 * Por que a chave inclui o usuário: o navegador pode ser compartilhado. Sem a
 * identidade no escopo, o limite (ou uma dispensa) de uma conta esconderia o
 * lembrete de outra pessoa no mesmo computador. Como a chave é
 * `chamado_feedback_reminder_<userId|anon>_<ticketId>`, trocar de conta não
 * herda memória nenhuma. É a infraestrutura já existente; não há tabela,
 * migration ou serviço novo.
 */
const REMINDER_KEY_PREFIX = 'chamado_feedback_reminder_'

/** Rótulo de escopo quando não há identidade (ex.: testes, sessão ausente). */
export const ANON_REMINDER_SCOPE = 'anon'

/** Lembretes por chamado: o inicial mais um adicional. */
export const FEEDBACK_REMINDER_MAX = 2

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

/** Escopo de memória local: a identidade autenticada ou `anon`. */
export function reminderScope(userId?: string | null): string {
  const id = (userId ?? '').trim()
  return id || ANON_REMINDER_SCOPE
}

function reminderKey(ticketId: string, userId?: string | null): string {
  return `${REMINDER_KEY_PREFIX}${reminderScope(userId)}_${ticketId}`
}

/** Chamado em estado que libera avaliação: `resolvido` ou `fechado`. */
export function isConcluded(status: Ticket['status']): boolean {
  return status === 'resolvido' || status === 'fechado'
}

/** Concluído e ainda sem nota — o que o lembrete deve mostrar. */
export function isPendingFeedback(ticket: Ticket): boolean {
  return isConcluded(ticket.status) && !ticket.feedbackRating
}

/**
 * Chamados pendentes de avaliação, do mais recente para o mais antigo.
 * Só o que veio do servidor entra: a função filtra e ordena, não amplia escopo.
 */
export function pendingFeedbackTickets(tickets: Ticket[]): Ticket[] {
  return tickets
    .filter(isPendingFeedback)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
}

/** Quantas vezes este chamado já foi lembrado para este usuário (0..MAX). */
export function feedbackReminderCount(ticketId: string, userId?: string | null): number {
  const store = storage()
  if (!store) return 0
  try {
    const raw = store.getItem(reminderKey(ticketId, userId))
    if (!raw) return 0
    const parsed = JSON.parse(raw) as { count?: unknown }
    const count = Number(parsed?.count)
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
  } catch {
    return 0
  }
}

/** O chamado ainda pode gerar lembrete para este usuário (não atingiu o limite). */
export function canRemindFeedback(ticketId: string, userId?: string | null): boolean {
  return feedbackReminderCount(ticketId, userId) < FEEDBACK_REMINDER_MAX
}

/**
 * Registra que um lembrete foi exibido para este usuário + chamado.
 * Devolve o novo contador. Storage indisponível: o aviso ainda aparece na sessão.
 */
export function recordFeedbackReminder(ticketId: string, userId?: string | null): number {
  const next = feedbackReminderCount(ticketId, userId) + 1
  const store = storage()
  if (!store) return next
  try {
    store.setItem(
      reminderKey(ticketId, userId),
      JSON.stringify({ count: next, at: new Date().toISOString() }),
    )
  } catch {
    // Storage indisponível — sem memória persistente, mas sem quebrar a tela.
  }
  return next
}

/** Remove a memória do lembrete deste usuário (chamado avaliado ou pendência cessada). */
export function clearFeedbackReminder(ticketId: string, userId?: string | null): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(reminderKey(ticketId, userId))
  } catch {
    // silencioso
  }
}
