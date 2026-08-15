import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTickets } from '../hooks/useTickets'
import { analyzeSla, formatDuration, getSlaHours } from '../services/sla'
import { slaConfigService } from '../services/slaConfigService'
import { TICKET_PRIORITIES, TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS } from '../types'
import { icons } from '../../../lib/icons'

type Period = 7 | 30 | 0

const DAY_MS = 24 * 60 * 60 * 1000

const PERIODS: { value: Period; label: string }[] = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 0, label: 'Tudo' },
]

function formatHours(hours: number): string {
  if (hours <= 0) return '—'
  return formatDuration(hours * 60 * 60 * 1000)
}

export function SlaDashboard() {
  const navigate = useNavigate()
  const { tickets } = useTickets()
  const [period, setPeriod] = useState<Period>(30)

  const sinceMs = period > 0 ? Date.now() - period * DAY_MS : 0

  const configs = useMemo(() => slaConfigService.getHoursForTickets(), [])

  const filtered = useMemo(() => {
    if (sinceMs === 0) return tickets
    return tickets.filter((t) => new Date(t.createdAt).getTime() >= sinceMs)
  }, [tickets, sinceMs])

  const analysis = useMemo(() => analyzeSla(filtered, configs), [filtered, configs])

  const breachedTickets = useMemo(() => {
    return filtered
      .map((t) => {
        if (!t.resolvedAt) return null
        const slaHours = getSlaHours(t.priority, configs[t.workspace_id ?? ''])
        if (slaHours <= 0) return null
        const created = new Date(t.createdAt).getTime()
        const resolved = new Date(t.resolvedAt).getTime()
        const delayMs = resolved - (created + slaHours * 60 * 60 * 1000)
        if (delayMs <= 0) return null
        return { ticket: t, delayMs }
      })
      .filter((x): x is { ticket: (typeof filtered)[number]; delayMs: number } => x !== null)
      .sort((a, b) => b.delayMs - a.delayMs)
      .slice(0, 5)
  }, [filtered, configs])

  const rateColor =
    analysis.total === 0 ? 'text-fg-muted' : analysis.rate >= 80 ? 'text-emerald-500' : analysis.rate >= 50 ? 'text-amber-500' : 'text-red-500'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/chamados')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-fg-muted shadow-[var(--shadow-card)] transition-colors hover:text-fg"
        >
          <icons.ui.back size={18} />
        </button>
        <div>
          <h1 className="text-sm font-semibold text-fg">SLA de atendimento</h1>
          <p className="text-[11px] text-fg-muted">Cumprimento dos prazos por chamado resolvido</p>
        </div>
      </div>

      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              period === p.value
                ? 'bg-amber-500 text-white'
                : 'bg-card text-fg-muted shadow-[var(--shadow-card)] hover:text-fg'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between">
          <span className="text-xs text-fg-muted">Taxa de cumprimento</span>
          <span className={`text-sm font-semibold ${rateColor}`}>
            {analysis.total > 0 ? `${analysis.met}/${analysis.total} no prazo` : 'Sem dados'}
          </span>
        </div>
        <p className={`mt-1 text-4xl font-bold ${rateColor}`}>{analysis.rate}%</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-fg-dim/20">
          <div
            className={`h-full rounded-full transition-all ${
              analysis.total === 0 ? 'bg-fg-muted/30' : analysis.rate >= 80 ? 'bg-emerald-500' : analysis.rate >= 50 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${analysis.total === 0 ? 0 : analysis.rate}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-card p-3.5 shadow-[var(--shadow-card)]">
          <p className="text-xl font-bold text-fg">{analysis.total}</p>
          <p className="text-[10px] font-medium text-fg-muted">Resolvidos</p>
        </div>
        <div className="rounded-xl bg-card p-3.5 shadow-[var(--shadow-card)]">
          <p className={`text-xl font-bold ${analysis.breached > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{analysis.breached}</p>
          <p className="text-[10px] font-medium text-fg-muted">Estouraram o prazo</p>
        </div>
        <div className="rounded-xl bg-card p-3.5 shadow-[var(--shadow-card)]">
          <p className="text-xl font-bold text-fg">{formatHours(analysis.avgHours)}</p>
          <p className="text-[10px] font-medium text-fg-muted">Tempo médio</p>
        </div>
      </div>

      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <h3 className="mb-3 text-xs font-semibold text-fg-muted">Por prioridade</h3>
        {TICKET_PRIORITIES.filter((p) => analysis.byPriority[p].total > 0).length === 0 ? (
          <p className="py-4 text-center text-sm text-fg-muted">Nenhum chamado resolvido no período</p>
        ) : (
          <div className="space-y-3">
            {TICKET_PRIORITIES.map((p) => {
              const s = analysis.byPriority[p]
              if (s.total === 0) return null
              const rate = Math.round((s.met / s.total) * 100)
              return (
                <div key={p} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TICKET_PRIORITY_COLORS[p]}`}>
                        {TICKET_PRIORITY_LABELS[p]}
                      </span>
                      <span className="text-xs text-fg-muted">
                        {s.met}/{s.total}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-fg">{rate}%</span>
                      <span className="text-[10px] text-fg-muted">média {formatHours(s.avgHours)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-fg-dim/20">
                    <div
                      className={`h-full rounded-full ${rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {breachedTickets.length > 0 && (
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-xs font-semibold text-red-600 dark:text-red-400">Resolvidos fora do prazo</h3>
          <div className="space-y-2">
            {breachedTickets.map(({ ticket, delayMs }) => (
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
                  +{formatDuration(delayMs)} de atraso
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
