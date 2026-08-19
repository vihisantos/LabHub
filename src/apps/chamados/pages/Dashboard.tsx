import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTicketsContext } from '../contexts/TicketsContext'
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
} from '../types'
import { slaConfigService } from '../services/slaConfigService'
import {
  formatDuration,
  getPriority,
  getSlaRemainingMs,
  getSlaState,
  isSlaOverdue,
  isTicketOpen,
} from '../services/sla'
import { icons } from '../../../lib/icons'
import type { Ticket, TicketStatus } from '../types'

function slaConfigFor(ticket: Ticket) {
  return slaConfigService.getHoursForTickets()[ticket.workspace_id ?? ''] ?? null
}

export function Dashboard() {
  const navigate = useNavigate()
  const { tickets } = useTicketsContext()

  const stats = useMemo(() => {
    const byStatus: Record<TicketStatus, number> = {
      aberto: 0,
      a_caminho: 0,
      em_atendimento: 0,
      resolvido: 0,
      fechado: 0,
    }
    for (const t of tickets) {
      byStatus[t.status]++
    }
    return byStatus
  }, [tickets])

  const slaStats = useMemo(() => {
    let overdue = 0
    let near = 0
    let urgent = 0
    for (const t of tickets) {
      if (!isTicketOpen(t.status)) continue
      const config = slaConfigFor(t)
      const state = getSlaState(t.createdAt, t.priority, t.status, config)
      if (state === 'overdue') overdue++
      else if (state === 'near') near++
      if (getPriority(t.priority) === 'urgente') urgent++
    }
    return { overdue, near, urgent }
  }, [tickets])

  const overdueTickets = useMemo(() => {
    return tickets
      .filter((t) => isTicketOpen(t.status) && isSlaOverdue(t.createdAt, t.priority, t.status, slaConfigFor(t)))
      .sort((a, b) => {
        const ma = getSlaRemainingMs(a.createdAt, a.priority, slaConfigFor(a))
        const mb = getSlaRemainingMs(b.createdAt, b.priority, slaConfigFor(b))
        return ma - mb
      })
      .slice(0, 5)
  }, [tickets])

  const feedbackStats = useMemo(() => {
    const rated = tickets.filter((t) => t.feedbackRating)
    if (rated.length === 0) return null
    const sum = rated.reduce((acc, t) => acc + (t.feedbackRating || 0), 0)
    return { count: rated.length, average: sum / rated.length }
  }, [tickets])

  const recentTickets = useMemo(() => {
    return [...tickets].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5)
  }, [tickets])

  const ticketsByRoom = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of tickets) {
      if (t.status === 'aberto' || t.status === 'a_caminho' || t.status === 'em_atendimento') {
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
        {(['aberto', 'a_caminho', 'em_atendimento', 'resolvido', 'fechado'] as TicketStatus[]).map((status) => (
          <div
            key={status}
            className={`rounded-xl bg-card p-4 shadow-[var(--shadow-card)] ${
              status === 'fechado' ? 'col-span-2' : ''
            }`}
          >
            <p className="text-2xl font-bold text-fg">{stats[status]}</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              {status === 'fechado' ? 'Arquivados' : TICKET_STATUS_LABELS[status]}
            </p>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => navigate('/chamados/qr')}
        className="flex w-full items-center gap-3 rounded-xl bg-amber-500 p-4 text-left text-white shadow-[var(--shadow-card)] transition-colors hover:bg-amber-400"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <icons.ui.qrCode size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">QR Code de chamados</p>
          <p className="text-[11px] text-amber-100/80">Imprima um único QR para a escola</p>
        </div>
        <icons.ui.chevronRight size={18} className="shrink-0" />
      </button>

      <button
        type="button"
        onClick={() => navigate('/chamados/reports')}
        className="flex w-full items-center gap-3 rounded-xl bg-emerald-500 p-4 text-left text-white shadow-[var(--shadow-card)] transition-colors hover:bg-emerald-400"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <icons.nav.reports size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Relatórios</p>
          <p className="text-[11px] text-emerald-100/80">Estatísticas de chamados por período</p>
        </div>
        <icons.ui.chevronRight size={18} className="shrink-0" />
      </button>

      <button
        type="button"
        onClick={() => navigate('/chamados/ranking')}
        className="flex w-full items-center gap-3 rounded-xl bg-card p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:border hover:border-red-500/40"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
          <icons.ui.fileBarChart size={22} className="text-red-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">Ranking de salas problemáticas</p>
          <p className="text-[11px] text-fg-muted">Quais salas mais geram chamados</p>
        </div>
        <icons.ui.chevronRight size={18} className="shrink-0 text-fg-dim" />
      </button>

      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between">
          <span className="text-xs text-fg-muted">SLA de atendimento</span>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${slaStats.overdue > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
              {slaStats.overdue > 0 ? `${slaStats.overdue} em atraso` : 'Sem atrasos'}
            </span>
            <button
              type="button"
              onClick={() => navigate('/chamados/sla')}
              className="flex items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-600 transition-colors hover:bg-amber-500/25 dark:text-amber-400"
            >
              Análise
              <icons.ui.chevronRight size={12} />
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-red-500/10 py-2.5">
            <p className="text-lg font-bold text-red-600 dark:text-red-400">{slaStats.overdue}</p>
            <p className="text-[10px] font-medium text-fg-muted">Em atraso</p>
          </div>
          <div className="rounded-xl bg-amber-500/10 py-2.5">
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{slaStats.near}</p>
            <p className="text-[10px] font-medium text-fg-muted">Próximo do prazo</p>
          </div>
          <div className="rounded-xl bg-red-500/10 py-2.5">
            <p className="text-lg font-bold text-red-600 dark:text-red-400">{slaStats.urgent}</p>
            <p className="text-[10px] font-medium text-fg-muted">Prioridade urgente</p>
          </div>
        </div>
      </div>

      {overdueTickets.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-xs font-semibold text-red-600 dark:text-red-400">Chamados em atraso</h3>
          <div className="space-y-2">
            {overdueTickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => navigate(`/chamados/tickets/${ticket.id}`)}
                className="flex w-full items-center gap-3 rounded-xl bg-red-500/5 p-3 text-left transition-colors hover:bg-red-500/10"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-xs font-bold text-red-500">
                  #{ticket.ticketNumber}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{ticket.assetName || ticket.problemCategory}</p>
                  <p className="text-[11px] text-fg-muted">{ticket.roomName}</p>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-red-500">
                  Atrasado há {formatDuration(-getSlaRemainingMs(ticket.createdAt, ticket.priority, slaConfigFor(ticket)))}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {feedbackStats && (
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">Satisfação dos professores</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <icons.ui.star
                    key={n}
                    size={13}
                    className={n <= Math.round(feedbackStats.average) ? 'fill-amber-500 text-amber-500' : 'text-fg-dim'}
                  />
                ))}
              </div>
              <span className="text-sm font-semibold text-fg">{feedbackStats.average.toFixed(1)}</span>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-fg-dim">{feedbackStats.count} avaliaç{feedbackStats.count !== 1 ? 'ões' : 'ão'} recebida{feedbackStats.count !== 1 ? 's' : ''}</p>
        </div>
      )}

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
            {recentTickets.map((ticket) => {
              const overdue = isSlaOverdue(ticket.createdAt, ticket.priority, ticket.status, slaConfigFor(ticket))
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => navigate(`/chamados/tickets/${ticket.id}`)}
                  className={`flex w-full items-center gap-3 rounded-xl bg-card p-3.5 text-left shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-elevated)] ${
                    overdue ? 'ring-1 ring-red-500/50' : ''
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-sm font-bold text-amber-500">
                    #{ticket.ticketNumber}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg truncate">{ticket.assetName || ticket.problemCategory}</p>
                    <p className="text-[11px] text-fg-muted">{ticket.roomName} · {ticket.problemCategory}</p>
                  </div>
                  {overdue && (
                    <span className="shrink-0 text-[10px] font-bold text-red-500">Em atraso</span>
                  )}
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TICKET_PRIORITY_COLORS[getPriority(ticket.priority)]}`}>
                    {TICKET_PRIORITY_LABELS[getPriority(ticket.priority)]}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TICKET_STATUS_COLORS[ticket.status]}`}>
                    {TICKET_STATUS_LABELS[ticket.status]}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
