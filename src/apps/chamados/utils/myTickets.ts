import type { Ticket } from '../types'

/**
 * Meus Chamados — apresentação da coleção pessoal.
 *
 * Tudo aqui é PURAMENTE de apresentação sobre um conjunto que o servidor já
 * autorizou (`GET /api/chamados?mine=true`). Nenhuma função decide o que é
 * "meu chamado": elas apenas filtram, agrupam e formatam o que veio pronto.
 * Por isso nenhuma delas aceita — nem lê — `reportedByUserId`: a fronteira de
 * autorização é o endpoint, não o React.
 *
 * ── Por que data de ATUALIZAÇÃO ──────────────────────────────────────────────
 * O agrupamento responde "o que aconteceu comigo hoje?". A pergunta é sobre a
 * última MOVIMENTAÇÃO do chamado, não sobre quando ele foi aberto — por isso a
 * chave é `updatedAt`, com `createdAt` como recurso quando o servidor não
 * devolveu `updatedAt`. Nenhuma coluna nova, nenhuma migration.
 */

/** Data relevante do chamado para agrupar/exibir: última atualização. */
export function ticketUpdatedAt(ticket: Ticket): string | null {
  const raw = ticket.updatedAt || ticket.createdAt
  if (!raw) return null
  const time = new Date(raw).getTime()
  return Number.isNaN(time) ? null : raw
}

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
}

/** Milissegundos da meia-noite local do dia em que `iso` cai (ou `null`). */
function dayKeyOf(iso: string): number | null {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  return startOfDay(parsed)
}

/**
 * Rótulo do grupo: `Hoje`, `Ontem` ou a data em `DD/MM/AAAA`.
 *
 * A comparação é por dia LOCAL (meia-noite do fuso do navegador), que é como o
 * usuário vive "hoje" — comparar por UTC devolveria "Ontem" para chamado
 * atualizado às 21h de Brasília.
 */
export function dateGroupLabel(iso: string, now: Date = new Date()): string | null {
  const day = dayKeyOf(iso)
  if (day === null) return null
  const today = startOfDay(now)
  if (day === today) return 'Hoje'
  if (day === today - 86_400_000) return 'Ontem'
  return new Date(day).toLocaleDateString('pt-BR')
}

/**
 * "Última atualização" no formato que o solicitante entende:
 * `Atualizado hoje às 08:42`, `Atualizado ontem às 14:20` ou
 * `Atualizado em 30/09/2026`. Sem timestamp técnico cru (ISO) na interface.
 */
export function formatUpdatedLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'Atualização não informada'
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return 'Atualização não informada'
  const group = dateGroupLabel(iso, now)
  if (group === 'Hoje') {
    return `Atualizado hoje às ${parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }
  if (group === 'Ontem') {
    return `Atualizado ontem às ${parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }
  return `Atualizado em ${group ?? parsed.toLocaleDateString('pt-BR')}`
}

export interface TicketDateGroup {
  /** `Hoje` | `Ontem` | `DD/MM/AAAA`. */
  label: string
  /** Mais recente primeiro; usado para ordenar os grupos entre si. */
  dayKey: number
  /** Atualização mais recente → mais antiga dentro do grupo. */
  tickets: Ticket[]
}

/**
 * Agrupa por data de atualização, do grupo mais recente para o mais antigo, e
 * ordena cada grupo da atualização mais recente para a mais antiga.
 *
 * Chamado sem data utilizável não é escondido: vai para um grupo `Sem data` no
 * fim da lista, para que a contagem da tela bata com o que o servidor devolveu.
 */
export function groupTicketsByUpdateDate(
  tickets: Ticket[],
  now: Date = new Date(),
): TicketDateGroup[] {
  const groups = new Map<string, TicketDateGroup>()

  for (const ticket of tickets) {
    const iso = ticketUpdatedAt(ticket)
    const label = iso ? dateGroupLabel(iso, now) : null
    const dayKey = iso ? (dayKeyOf(iso) as number) : Number.NEGATIVE_INFINITY
    const key = label ?? 'Sem data'
    const bucket = groups.get(key)
    if (bucket) bucket.tickets.push(ticket)
    else groups.set(key, { label: key, dayKey, tickets: [ticket] })
  }

  return [...groups.values()]
    .sort((a, b) => b.dayKey - a.dayKey)
    .map((group) => ({
      ...group,
      tickets: [...group.tickets].sort((a, b) => {
        const at = new Date(ticketUpdatedAt(a) ?? 0).getTime()
        const bt = new Date(ticketUpdatedAt(b) ?? 0).getTime()
        if (bt !== at) return bt - at
        return (b.ticketNumber || 0) - (a.ticketNumber || 0)
      }),
    }))
}

/** Assunto do chamado — a mesma linha de título que a fila operacional usa. */
export function ticketSubject(ticket: Ticket): string {
  return ticket.assetName || ticket.problemCategory || `Chamado #${ticket.ticketNumber}`
}

/**
 * Pesquisa simples: número, assunto e local.
 *
 * "Assunto" cobre o que descreve o problema (ativo, categoria e descrição) — o
 * mesmo texto que a fila operacional usa para busca, sem os filtros dela.
 *
 * Filtra APENAS o conjunto já autorizado pelo servidor. Um texto digitado aqui
 * não amplia nem reduz o escopo — no máximo esvazia a lista, jamais traz um
 * chamado de outra pessoa.
 */
export function matchesTicketQuery(ticket: Ticket, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  // "#1042" e "1042" devem achar o mesmo chamado.
  const digits = q.replace(/^#+/, '').trim()

  if (digits && String(ticket.ticketNumber ?? '').toLowerCase().includes(digits)) return true
  if (ticketSubject(ticket).toLowerCase().includes(q)) return true
  if ((ticket.problemCategory || '').toLowerCase().includes(q)) return true
  if ((ticket.problemDescription || '').toLowerCase().includes(q)) return true
  if ((ticket.roomName || '').toLowerCase().includes(q)) return true
  return false
}

/** Aplica a pesquisa simples sobre a coleção pessoal. */
export function filterTicketsByQuery(tickets: Ticket[], query: string): Ticket[] {
  const q = query.trim()
  if (!q) return tickets
  return tickets.filter((ticket) => matchesTicketQuery(ticket, q))
}
