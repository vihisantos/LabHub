import type { Ticket, TicketPriority, TicketStatus } from '../../apps/chamados/types'
import { getPriority, getSlaState, type SlaState } from '../../apps/chamados/services/sla'

/**
 * Helpers puros da LISTAGEM de chamados da aba Chamados da Central do
 * Coordenador (PR C + feat listagem por escopo).
 *
 * Mesmo princípio dos demais helpers do Coordenador: nenhum deles decide
 * autorização — recebem SOMENTE o conjunto que a camada superior já escopou
 * (`scopeTickets`, derivado do cache bruto autorizado em `CoordinatorHome`) e
 * projetam filtro/ordenação de exibição. A regra de segurança
 * `ticket.workspace_id ∈ escopo` é reforçada aqui (fail-closed: fora do escopo
 * nunca vira linha), e o filtro de unidade é limitado às unidades recebidas.
 *
 * Não há ciclo de dados novo: é computação síncrona sobre dados em memória,
 * reutilizando exclusivamente `getPriority`/`getSlaState` de services/sla.ts
 * (fonte única de SLA).
 */

/** Valor de "todas as unidades" no seletor de unidade da listagem. */
export const SCOPE_UNIT_ALL = 'all'

/** Filtro por unidade: 'all' ou um `workspace_id` do escopo. */
export type ScopeUnitFilter = string
/** Filtro por status: 'all' ou um `TicketStatus`. */
export type ScopeStatusFilter = TicketStatus | 'all'
/** Filtro por prioridade (normalizado via `getPriority`): 'all' ou uma `TicketPriority`. */
export type ScopePriorityFilter = TicketPriority | 'all'
/** Filtro por SLA (mesma semântica de `getSlaState`): 'all' ou um `SlaState`. */
export type ScopeSlaFilter = SlaState | 'all'

export interface ScopeTicketsFilters {
  unit: ScopeUnitFilter
  status: ScopeStatusFilter
  priority: ScopePriorityFilter
  sla: ScopeSlaFilter
  query: string
}

/** Config de SLA por workspace no formato entendido por services/sla.ts. */
export type ScopeSlaConfigs = Record<string, Record<TicketPriority, number>>

/** Estado inicial dos filtros da listagem (tudo aberto, sem busca). */
export const SCOPE_TICKETS_DEFAULT_FILTERS: ScopeTicketsFilters = {
  unit: SCOPE_UNIT_ALL,
  status: 'all',
  priority: 'all',
  sla: 'all',
  query: '',
}

/**
 * Guard do filtro de unidade (fail-closed): só aceita o valor se ele pertencer
 * às unidades do escopo informadas; qualquer valor stale/inventado/fora do
 * escopo volta para 'all'. NUNCA confia em `workspace_id` vindo de query string
 * — a UI só oferece as unidades do escopo e este guard garante o valor efetivo.
 */
export function scopedUnitFilter(
  unit: ScopeUnitFilter,
  scopeUnitIds: readonly string[],
): ScopeUnitFilter {
  if (unit !== SCOPE_UNIT_ALL && scopeUnitIds.includes(unit)) return unit
  return SCOPE_UNIT_ALL
}

/**
 * Filtro da listagem (client-side, sobre dados JÁ escopados): unidade, status,
 * prioridade (normalizada via `getPriority`), SLA (via `getSlaState` — só
 * chamados do fluxo aberto participam) e busca local (número, local, categoria,
 * descrição, solicitante, e-mail do solicitante e responsável; case-insensitive
 * pt-BR). Filtros inativos não restringem nada. NUNCA decide autorização.
 */
export function filterScopeTickets(
  tickets: Ticket[],
  filters: ScopeTicketsFilters,
  slaConfigs?: ScopeSlaConfigs,
): Ticket[] {
  const q = filters.query.trim().toLocaleLowerCase('pt-BR')
  return tickets.filter((ticket) => {
    if (filters.unit !== SCOPE_UNIT_ALL && ticket.workspace_id !== filters.unit) return false
    if (filters.status !== 'all' && ticket.status !== filters.status) return false
    if (filters.priority !== 'all' && getPriority(ticket.priority) !== filters.priority) {
      return false
    }
    if (filters.sla !== 'all') {
      const config = slaConfigs?.[ticket.workspace_id ?? '']
      const state = getSlaState(ticket.createdAt, ticket.priority, ticket.status, config)
      if (state !== filters.sla) return false
    }
    if (q === '') return true
    const searchable = [
      String(ticket.ticketNumber),
      ticket.assetName,
      ticket.roomName,
      ticket.problemCategory,
      ticket.problemDescription,
      ticket.reportedBy,
      ticket.reportedByEmail,
      ticket.assignedTo,
    ]
      .join(' ')
      .toLocaleLowerCase('pt-BR')
    return searchable.includes(q)
  })
}

/**
 * Ordena a listagem por `updatedAt` descendente (mais recentes no topo — mesma
 * ordem dos "recentes" do shell). Devolve uma cópia: nunca muta o input.
 */
export function sortScopeTickets(tickets: Ticket[]): Ticket[] {
  return [...tickets].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}
