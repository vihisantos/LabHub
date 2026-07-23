import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTickets } from '../hooks/useTickets'
import { TICKET_STATUS_LABELS, TICKET_STATUS_COLORS } from '../types'
import { icons } from '../../../lib/icons'
import type { TicketStatus } from '../types'

export function Dashboard() {
  const navigate = useNavigate()
  const { tickets } = useTickets()

  const stats = useMemo(() => {
    const byStatus: Record<TicketStatus, number> = {
      aberto: 0,
      em_atendimento: 0,
      resolvido: 0,
      fechado: 0,
    }
    for (const t of tickets) {
      byStatus[t.status]++
    }
    return byStatus
  }, [tickets])

  const recentTickets = useMemo(() => {
    return [...tickets].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5)
  }, [tickets])

  const ticketsByRoom = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of tickets) {
      if (t.status === 'aberto' || t.status === 'em_atendimento') {
        map[t.roomName] = (map[t.roomName] || 0) + 1
      }
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
  }, [tickets])

  const avgResolutionTime = useMemo(() => {
    const resolved = tickets.filter((t) => t.resolvedAt)
    if (resolved.length === 0) return null
    const totalMs = resolved.reduce((sum, t) => {
      return sum + (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime())
    }, 0)
    const avgHours = totalMs / resolved.length / (1000 * 60 * 60)
    if (avgHours < 24) return `${Math.round(avgHours)}h`
    return `${Math.round(avgHours / 24)}d`
  }, [tickets])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {(['aberto', 'em_atendimento', 'resolvido', 'fechado'] as TicketStatus[]).map((status) => (
          <div
            key={status}
            className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]"
          >
            <p className="text-2xl font-bold text-fg">{stats[status]}</p>
            <p className="mt-0.5 text-xs text-fg-muted">{TICKET_STATUS_LABELS[status]}</p>
          </div>
        ))}
      </div>

      {avgResolutionTime && (
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">Tempo médio de resolução</span>
            <span className="text-sm font-semibold text-fg">{avgResolutionTime}</span>
          </div>
        </div>
      )}

      {ticketsByRoom.length > 0 && (
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-xs font-semibold text-fg-muted">Chamados abertos por sala</h3>
          <div className="space-y-2">
            {ticketsByRoom.map(([room, count]) => (
              <div key={room} className="flex items-center justify-between">
                <span className="text-sm text-fg">{room}</span>
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold text-fg-muted">Últimos chamados</h3>
          <button
            type="button"
            onClick={() => navigate('/chamados/tickets')}
            className="text-xs font-medium text-amber-500 hover:text-amber-400"
          >
            Ver todos
          </button>
        </div>
        {recentTickets.length === 0 ? (
          <div className="rounded-xl bg-card p-6 text-center shadow-[var(--shadow-card)]">
            <icons.ui.inbox size={32} className="mx-auto text-fg-muted" />
            <p className="mt-2 text-sm text-fg-muted">Nenhum chamado ainda</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => navigate(`/chamados/tickets/${ticket.id}`)}
                className="flex w-full items-center gap-3 rounded-xl bg-card p-3.5 text-left shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-elevated)]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-sm font-bold text-amber-500">
                  #{ticket.ticketNumber}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg truncate">{ticket.assetName}</p>
                  <p className="text-[11px] text-fg-muted">{ticket.roomName} · {ticket.problemCategory}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TICKET_STATUS_COLORS[ticket.status]}`}>
                  {TICKET_STATUS_LABELS[ticket.status]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
