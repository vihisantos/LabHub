import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ticketService } from '../services/ticketService'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { BarChart } from '../../../lib/charts/BarChart'
import { icons } from '../../../lib/icons'
import type { ChamadosReport, ReportPeriodDays } from '../types'

const PERIOD_OPTIONS: { label: string; days: ReportPeriodDays }[] = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
]

const TOP = 10

export function Ranking() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const [days, setDays] = useState<ReportPeriodDays>(30)
  const [report, setReport] = useState<ChamadosReport | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(
    async (d: ReportPeriodDays) => {
      setLoading(true)
      setError('')
      const params: { from?: string; to?: string; workspace_id?: string } = {}
      if (d > 0) {
        params.from = new Date(Date.now() - d * 86400000).toISOString()
      }
      if (workspace?.id) params.workspace_id = workspace.id
      try {
        setReport(await ticketService.getReports(params))
      } catch {
        setError('Não foi possível carregar o ranking')
      } finally {
        setLoading(false)
      }
    },
    [workspace?.id],
  )

  useEffect(() => {
    load(days)
  }, [load, days])

  const chartData = useMemo(() => {
    if (!report) return []
    return report.byRoom
      .slice(0, TOP)
      .map(([label, value], i) => ({
        label,
        value,
        color: i === 0 ? 'var(--color-chart-danger)' : i < 3 ? 'var(--color-chart-warn)' : undefined,
      }))
  }, [report])

  const total = report?.total ?? 0
  const maxRoom = chartData[0]?.value ?? 0

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.days}
            type="button"
            onClick={() => setDays(opt.days)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              days === opt.days ? 'bg-amber-500 text-white' : 'bg-card text-fg-dim border border-line hover:text-fg'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading && !report && (
        <div className="flex items-center justify-center gap-3 rounded-xl bg-card py-10 text-sm text-fg-muted">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          Carregando...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-600 dark:text-red-400">
          <icons.ui.alertTriangle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {report && (
        <>
          <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <p className="text-2xl font-bold text-fg">{report.byRoom.length}</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              Salas com chamados no período{workspace ? ` · ${workspace.name}` : ''}
            </p>
          </div>

          {chartData.length > 0 ? (
            <>
              <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
                <h3 className="mb-3 text-xs font-semibold text-fg-muted">Top {Math.min(TOP, chartData.length)} salas</h3>
                <BarChart data={chartData} layout="horizontal" height={Math.max(180, chartData.length * 36)} />
              </div>

              <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
                <h3 className="mb-3 text-xs font-semibold text-fg-muted">Detalhe por sala</h3>
                <div className="space-y-2">
                  {report.byRoom.slice(0, TOP).map(([room, count], i) => (
                    <button
                      key={room}
                      type="button"
                      onClick={() => navigate('/chamados/tickets')}
                      className="flex w-full items-center gap-3 rounded-xl bg-surface p-3 text-left transition-colors hover:bg-input"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                          i === 0
                            ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                            : i < 3
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                              : 'bg-fg-muted/10 text-fg-muted'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">{room}</p>
                        <p className="text-[11px] text-fg-muted">
                          {count} chamado{count !== 1 ? 's' : ''}
                          {total > 0 ? ` · ${Math.round((count / total) * 100)}% do período` : ''}
                        </p>
                      </div>
                      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-input">
                        <div
                          className={`h-1.5 rounded-full ${i === 0 ? 'bg-red-500' : 'bg-amber-500'}`}
                          style={{ width: `${maxRoom > 0 ? (count / maxRoom) * 100 : 0}%` }}
                        />
                      </div>
                      <icons.ui.chevronRight size={14} className="shrink-0 text-fg-dim" />
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-card py-12 text-center shadow-[var(--shadow-card)]">
              <icons.ui.inbox size={32} className="text-fg-muted" />
              <p className="text-sm text-fg-muted">Nenhum chamado no período</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
