import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMyTickets } from '../hooks/useMyTickets'
import {
  filterTicketsByQuery,
  formatUpdatedLabel,
  groupTicketsByUpdateDate,
  ticketSubject,
  ticketUpdatedAt,
} from '../utils/myTickets'
import { pendingFeedbackTickets } from '../utils/pendingFeedback'
import { FeedbackReminder } from '../components/FeedbackReminder'
import { useAuth } from '../../../core/auth/useAuth'
import { ErrorState } from '../../../platform/Coordinator/components/ErrorState'
import { EmptyState } from '../../../platform/Coordinator/components/EmptyState'
import { icons } from '../../../lib/icons'
import { TICKET_STATUS_COLORS, TICKET_STATUS_LABELS } from '../types'
import type { Ticket } from '../types'

/**
 * Meus Chamados — ÁREA PESSOAL do solicitante.
 *
 * Não é a fila operacional com um filtro a mais. São duas experiências
 * diferentes e esta é a do solicitante:
 *
 *   · **Chamados** (`/chamados/tickets`) — a fila de trabalho da equipe de TI,
 *     com filtros, ordenação, prioridade e ações de atendimento.
 *   · **Meus Chamados** (`/chamados/meus`) — o histórico do que EU solicitei.
 *
 * ── Fonte dos dados ──────────────────────────────────────────────────────────
 * A coleção vem inteira de `ticketService.listMine()` /
 * `GET /api/chamados?mine=true` (PR #331): o servidor já aplicou
 * `reportedByUserId = <identidade do JWT>`. Aqui não existe `reportedByUserId`,
 * nem chamada à fila, nem fallback — se a consulta falhar, a tela mostra o erro.
 *
 * ── O que esta tela NÃO é ────────────────────────────────────────────────────
 * · Sem filtros operacionais (status, prioridade, responsável, sala, SLA).
 * · Sem semântica de autorização: a pesquisa é apresentação sobre um conjunto já
 *   autorizado e, no máximo, o esvazia.
 * · Sem nada da fila: `mine` e a fila nunca coexistem nesta tela.
 */
export function MyTickets() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const { tickets, loading, error, reload } = useMyTickets(true)

  const visibleTickets = useMemo(() => filterTicketsByQuery(tickets, search), [tickets, search])
  const groups = useMemo(() => groupTicketsByUpdateDate(visibleTickets), [visibleTickets])
  const pending = useMemo(() => pendingFeedbackTickets(tickets), [tickets])
  const isSearching = search.trim().length > 0

  function openTicket(ticket: Ticket) {
    if (!ticket.id) return
    navigate(`/chamados/tickets/${ticket.id}`)
  }

  return (
    <div className="space-y-4">
      {/* Lembrete discreto e não bloqueante de avaliação (issue #370). A
          avaliação acontece pelo endpoint AUTENTICADO — não depende do token
          deste navegador. Ao confirmar, recarregamos a lista pessoal. */}
      <FeedbackReminder
        pending={pending}
        userId={user?.id ?? null}
        onRated={() => void reload()}
      />

      {/* A distinção fica explícita na própria tela: isto não é a fila. */}
      <p className="text-[11px] leading-relaxed text-fg-muted">
        Chamados que <span className="font-medium text-fg">você abriu</span> e o
        andamento de cada um. A fila de trabalho da equipe de TI fica em{' '}
        <span className="font-medium text-fg">Chamados</span>.
      </p>

      <div className="relative">
        <icons.ui.search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar chamado..."
          aria-label="Pesquisar chamado"
          inputMode="search"
          className="w-full appearance-none rounded-xl border border-line bg-card py-2.5 pl-9 pr-9 text-sm text-fg placeholder:text-fg-dim focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 [&::-webkit-search-cancel-button]:hidden"
        />
        {isSearching && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Limpar pesquisa"
            title="Limpar pesquisa"
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-input hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
          >
            <icons.ui.close size={14} />
          </button>
        )}
      </div>

      {loading ? (
        <ul className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-start gap-3 rounded-xl bg-card p-3.5 shadow-[var(--shadow-card)]">
              <div className="skeleton-shimmer h-10 w-10 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="skeleton-shimmer h-3.5 w-3/5 rounded-full" />
                <div className="skeleton-shimmer h-2.5 w-2/5 rounded-full" />
                <div className="skeleton-shimmer h-2.5 w-1/2 rounded-full" />
              </div>
            </li>
          ))}
        </ul>
      ) : error ? (
        <div className="space-y-2">
          <ErrorState
            message="Não foi possível carregar seus chamados."
            onRetry={() => void reload()}
          />
          {error && <p className="px-1 text-[11px] leading-relaxed text-fg-muted">{error}</p>}
          <p className="px-1 text-[11px] leading-relaxed text-fg-muted">
            Seus chamados não foram substituídos pela fila de atendimento — esta área
            mostra apenas o que o servidor confirmou como seu.
          </p>
        </div>
      ) : groups.length === 0 ? (
        isSearching ? (
          <EmptyState
            icon={<icons.ui.search size={20} className="text-fg-muted" />}
            title="Nenhum chamado corresponde à sua pesquisa."
            description={`Nada corresponde a "${search.trim()}". A pesquisa só filtra os chamados que você já abriu.`}
          />
        ) : (
          <div className="space-y-3">
            <EmptyState
              title="Você ainda não abriu nenhum chamado."
              description="Quando precisar de suporte, registre uma solicitação e acompanhe o atendimento por aqui."
            />
            {/* CTA para o fluxo de abertura JÁ EXISTENTE — nada novo é criado aqui. */}
            <button
              type="button"
              onClick={() => navigate('/chamados-publico/new')}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
            >
              <icons.ui.plus size={16} />
              Abrir chamado
            </button>
          </div>
        )
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.label} aria-labelledby={`grupo-${group.label}`}>
              <h2
                id={`grupo-${group.label}`}
                className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-fg-muted"
              >
                {group.label}
              </h2>
              <ul className="space-y-2">
                {group.tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <MyTicketItem ticket={ticket} onOpen={() => openTicket(ticket)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Item do chamado na área pessoal: número, assunto, local, status e última
 * atualização. É deliberadamente mais simples que a linha operacional — nada de
 * prioridade, responsável, SLA ou nota de status, que são ferramenta de trabalho
 * do técnico, não informação necessária para quem abriu o pedido.
 */
function MyTicketItem({ ticket, onOpen }: { ticket: Ticket; onOpen: () => void }) {
  const status = ticket.status
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 rounded-xl bg-card p-3.5 text-left shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 active:scale-[0.99]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-[13px] font-bold text-amber-500">
        #{ticket.ticketNumber || '?'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-snug text-fg">
          {ticketSubject(ticket)}
        </span>
        {ticket.roomName && (
          <span className="mt-0.5 block truncate text-[11px] text-fg-muted">{ticket.roomName}</span>
        )}
        {/* flex-wrap + gap: em 320px o status e a data quebram linha em vez de estourar o card. */}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TICKET_STATUS_COLORS[status]}`}
          >
            <icons.ui.dot size={8} className="shrink-0" />
            {TICKET_STATUS_LABELS[status]}
          </span>
          <span className="text-[10px] text-fg-dim">{formatUpdatedLabel(ticketUpdatedAt(ticket))}</span>
        </span>
      </span>
      <icons.ui.chevronRight size={16} className="mt-3 shrink-0 text-fg-dim" />
    </button>
  )
}


