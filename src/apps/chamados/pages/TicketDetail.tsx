import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useTickets } from '../hooks/useTickets'
import { TICKET_STATUS_LABELS, TICKET_STATUS_COLORS } from '../types'
import { icons } from '../../../lib/icons'
import type { TicketStatus } from '../types'

const STATUS_FLOW: TicketStatus[] = ['aberto', 'em_atendimento', 'resolvido', 'fechado']

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function TicketDetail() {
  const { id } = useParams<{ id: string }>()
  const { tickets, updateStatus } = useTickets()
  const ticket = tickets.find((t) => t.id === id)

  const history = useMemo(() => {
    if (!ticket) return []
    return tickets
      .filter((t) => t.assetId === ticket.assetId && t.assetSource === ticket.assetSource && t.id !== ticket.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
  }, [ticket, tickets])

  if (!ticket) {
    return (
      <div className="flex flex-col items-center py-12">
        <icons.ui.alertCircle size={40} className="text-fg-muted" />
        <p className="mt-3 text-sm text-fg-muted">Chamado não encontrado</p>
      </div>
    )
  }

  const currentIndex = STATUS_FLOW.indexOf(ticket.status)
  const nextStatus = currentIndex < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIndex + 1] : null

  function handleAdvanceStatus() {
    if (!nextStatus || !ticket) return
    updateStatus(ticket.id, nextStatus)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-2xl font-bold text-amber-500">#{ticket.ticketNumber}</span>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TICKET_STATUS_COLORS[ticket.status]}`}>
            {TICKET_STATUS_LABELS[ticket.status]}
          </span>
        </div>

        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex items-start gap-3">
            <icons.ui.home size={16} className="mt-0.5 shrink-0 text-fg-muted" />
            <div>
              <p className="text-xs text-fg-muted">Sala</p>
              <p className="text-sm font-medium text-fg">{ticket.roomName}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <icons.nav.pcs size={16} className="mt-0.5 shrink-0 text-fg-muted" />
            <div>
              <p className="text-xs text-fg-muted">Equipamento</p>
              <p className="text-sm font-medium text-fg">{ticket.assetName}</p>
              {ticket.assetPatrimony && (
                <p className="text-[11px] text-fg-dim">Patrimônio: {ticket.assetPatrimony}</p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <icons.ui.alertCircle size={16} className="mt-0.5 shrink-0 text-fg-muted" />
            <div>
              <p className="text-xs text-fg-muted">Problema</p>
              <p className="text-sm font-medium text-fg">{ticket.problemCategory}</p>
            </div>
          </div>
          {ticket.problemDescription && (
            <div className="flex items-start gap-3">
              <icons.ui.fileBarChart size={16} className="mt-0.5 shrink-0 text-fg-muted" />
              <div>
                <p className="text-xs text-fg-muted">Descrição</p>
                <p className="text-sm text-fg">{ticket.problemDescription}</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3">
            <icons.ui.user size={16} className="mt-0.5 shrink-0 text-fg-muted" />
            <div>
              <p className="text-xs text-fg-muted">Reportado por</p>
              <p className="text-sm font-medium text-fg">{ticket.reportedBy}</p>
              {ticket.reportedByEmail && (
                <p className="text-[11px] text-fg-dim">{ticket.reportedByEmail}</p>
              )}
            </div>
          </div>
          {ticket.assignedTo && (
            <div className="flex items-start gap-3">
              <icons.ui.userCheck size={16} className="mt-0.5 shrink-0 text-fg-muted" />
              <div>
                <p className="text-xs text-fg-muted">Responsável</p>
                <p className="text-sm font-medium text-fg">{ticket.assignedTo}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <h3 className="mb-3 text-xs font-semibold text-fg-muted">Timeline</h3>
        <div className="space-y-3">
          {STATUS_FLOW.map((status, i) => {
            const isPast = i <= currentIndex
            const isCurrent = i === currentIndex
            return (
              <div key={status} className="flex items-center gap-3">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  isCurrent ? 'bg-amber-500 text-white' : isPast ? 'bg-emerald-500/20 text-emerald-500' : 'bg-input text-fg-muted'
                }`}>
                  {isPast ? <icons.ui.check size={12} /> : i + 1}
                </div>
                <div className="flex-1">
                  <p className={`text-xs font-medium ${isCurrent ? 'text-fg' : isPast ? 'text-fg-muted' : 'text-fg-dim'}`}>
                    {TICKET_STATUS_LABELS[status]}
                  </p>
                </div>
                {isCurrent && ticket.resolvedAt && status === 'resolvido' && (
                  <span className="text-[10px] text-fg-dim">{formatDate(ticket.resolvedAt)}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {nextStatus && (
        <button
          type="button"
          onClick={handleAdvanceStatus}
          className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
        >
          {nextStatus === 'em_atendimento' && 'Iniciar Atendimento'}
          {nextStatus === 'resolvido' && 'Marcar como Resolvido'}
          {nextStatus === 'fechado' && 'Fechar Chamado'}
        </button>
      )}

      {history.length > 0 && (
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-xs font-semibold text-fg-muted">Histórico deste equipamento</h3>
          <div className="space-y-2">
            {history.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span className="text-fg-muted">#{t.ticketNumber} — {t.problemCategory}</span>
                <span className="text-[10px] text-fg-dim">
                  {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
