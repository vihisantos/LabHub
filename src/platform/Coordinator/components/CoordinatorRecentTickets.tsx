import type { Ticket } from '../../../apps/chamados/types'
import { TICKET_STATUS_COLORS, TICKET_STATUS_LABELS } from '../../../apps/chamados/types'
import { cn } from '../../../lib/components/ui/utils'
import { CoordinatorPanel } from './CoordinatorPanel'

/**
 * C2 (PR B #236) — Lista apresentacional de chamados recentes da Central.
 *
 * Puramente apresentacional: recebe os tickets recentes (já ordenados e
 * limitados pelo chamador — C5), uma função para resolver o nome da unidade e
 * um callback opcional de abertura. Não busca dados, não conhece `scopeUnitIds`
 * nem workspace, e não implementa autorização.
 *
 * Fail-safe: com `onOpenTicket` presente os itens viram `<button>`; sem ele,
 * ficam `<span>` estático. Preserva a estrutura, os textos e os testids
 * `overview-recents` / `overview-recent-{id}` da visão geral existente.
 */

interface CoordinatorRecentTicketsProps {
  tickets: Ticket[]
  /** Resolve o nome da unidade de um workspace (undefined → sem badge). */
  resolveUnitName?: (workspaceId?: string) => string
  /** Abre o detail EXISTENTE do chamado; ausente → itens estáticos. */
  onOpenTicket?: (ticketId: string) => void
}

export function CoordinatorRecentTickets({
  tickets,
  resolveUnitName,
  onOpenTicket,
}: CoordinatorRecentTicketsProps) {
  return (
    <CoordinatorPanel
      title="Chamados recentes"
      description="Últimos chamados do cache local dentro do seu escopo."
      data-testid="overview-recents"
    >
      {tickets.length === 0 ? (
        <p className="text-[10px] leading-relaxed text-fg-muted">
          Nenhum chamado no cache ainda — os números aparecem assim que o app de chamados
          sincronizar sua unidade.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {tickets.map((ticket) => {
            const row = (
              <>
                <span className="min-w-[9rem] flex-1 truncate sm:min-w-0">
                  {ticket.roomName || 'Chamado'}
                  {ticket.problemCategory ? ` — ${ticket.problemCategory}` : ''}
                </span>
                {ticket.ticketNumber > 0 && (
                  <span className="shrink-0 rounded-full bg-input px-1.5 py-0.5 text-[10px] font-semibold text-fg-dim">
                    #{ticket.ticketNumber}
                  </span>
                )}
                <span
                  className={cn(
                    'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    TICKET_STATUS_COLORS[ticket.status],
                  )}
                >
                  {TICKET_STATUS_LABELS[ticket.status]}
                </span>
                {resolveUnitName && (
                  <span className="hidden shrink-0 rounded-full bg-fg-muted/10 px-1.5 py-0.5 text-[10px] font-semibold text-fg-muted sm:inline">
                    {resolveUnitName(ticket.workspace_id)}
                  </span>
                )}
              </>
            )
            return (
              <li key={ticket.id} className="text-[10px] leading-relaxed text-fg-muted">
                {onOpenTicket ? (
                  <button
                    type="button"
                    onClick={() => onOpenTicket(ticket.id)}
                    className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left transition-colors hover:text-fg"
                    data-testid={`overview-recent-${ticket.id}`}
                  >
                    {row}
                  </button>
                ) : (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid={`overview-recent-${ticket.id}`}>
                    {row}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </CoordinatorPanel>
  )
}