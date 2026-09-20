import type { Ticket, TicketPriority, TicketStatus } from '../types'
import { isTicketOpen } from './sla'
import { ticketService } from './ticketService'

/**
 * C1 — Helper puro de estatísticas operacionais de chamados (PR B, #236).
 *
 * Recebe um array de tickets JÁ autorizado e JÁ filtrado pelo chamador (por
 * exemplo, o cache do escopo de coordenação). Não consulta Supabase, API,
 * workspace, JWT, membership, RPC, cache global nem hooks — nenhuma
 * autorização é criada dentro do helper. A função é pura e determinística:
 * depende apenas do array fornecido.
 *
 * Semântica espelhada da Visão geral do `CoordinatorHome.tsx` (PR B) usando
 * as mesmas fontes de verdade:
 * - arquivado ⇔ `ticketService.isArchived` (`archived === true || status === 'fechado'`);
 * - aberto ⇔ `sla.isTicketOpen` (`aberto | a_caminho | em_atendimento`).
 *
 * O conjunto-base operacional (`active`) é o array com os tickets
 * arquivados/fechados removidos — idêntico ao `scopeTickets` não-arquivado do
 * shell. `abertos` e `emAtendimento` são contados sobre os tickets abertos
 * (`active ∩ isTicketOpen`), igual ao `openScopeTickets` do shell.
 *
 * - `total`: tickets operacionais do array (não arquivados e não fechados).
 * - `semResponsavel`: operacionais sem `assignedToUserId` (todo ticket de
 *   status aberto a `resolvido` — não exclui `resolvido`, igual ao shell).
 * - `altaPrioridade`/`urgentes`: operacionais com `priority === 'alta'` /
 *   `priority === 'urgente'` (comparação crua, sem normalizar).
 * - `byStatus`/`byPriority`: contagens do conjunto-base com todos os buckets
 *   conhecidos presentes (zero preenchido) — determinístico para alimentar
 *   gráficos sem acoplar a lib de chart. Tickets sem prioridade não entram em
 *   `byPriority` (zero honesto, sem inventar prioridade).
 */

export interface TicketStatsSummary {
  total: number
  abertos: number
  emAtendimento: number
  semResponsavel: number
  altaPrioridade: number
  urgentes: number
  byStatus: Record<TicketStatus, number>
  byPriority: Record<TicketPriority, number>
}

const EMPTY_STATUSES: Record<TicketStatus, number> = {
  aberto: 0,
  a_caminho: 0,
  em_atendimento: 0,
  resolvido: 0,
  fechado: 0,
}

const EMPTY_PRIORITIES: Record<TicketPriority, number> = {
  baixa: 0,
  normal: 0,
  alta: 0,
  urgente: 0,
}

export function analyzeTickets(tickets: Ticket[]): TicketStatsSummary {
  const byStatus: Record<TicketStatus, number> = { ...EMPTY_STATUSES }
  const byPriority: Record<TicketPriority, number> = { ...EMPTY_PRIORITIES }

  let total = 0
  let abertos = 0
  let emAtendimento = 0
  let semResponsavel = 0
  let altaPrioridade = 0
  let urgentes = 0

  for (const ticket of tickets) {
    if (ticketService.isArchived(ticket)) continue

    total += 1
    byStatus[ticket.status] += 1

    const priority = ticket.priority
    if (priority) byPriority[priority] += 1

    if (!ticket.assignedToUserId) semResponsavel += 1
    if (priority === 'alta') altaPrioridade += 1
    if (priority === 'urgente') urgentes += 1

    if (isTicketOpen(ticket.status)) {
      if (ticket.status === 'aberto') abertos += 1
      else if (ticket.status === 'a_caminho' || ticket.status === 'em_atendimento')
        emAtendimento += 1
    }
  }

  return {
    total,
    abertos,
    emAtendimento,
    semResponsavel,
    altaPrioridade,
    urgentes,
    byStatus,
    byPriority,
  }
}