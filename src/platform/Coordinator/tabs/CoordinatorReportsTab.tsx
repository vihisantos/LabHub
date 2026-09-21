import { useEffect, useMemo, useState } from 'react'
import { icons } from '../../../lib/icons'
import { ticketService } from '../../../apps/chamados/services/ticketService'
import { analyzeSlaByWorkspace } from '../../../apps/chamados/services/sla'
import { slaConfigService } from '../../../apps/chamados/services/slaConfigService'
import { exportCSV } from '../../../apps/pcare/utils/export'
import { useAppAccess } from '../../../core/permissions/usePermissions'
import { getCol } from '../../../lib/db'
import { cn } from '../../../lib/components/ui/utils'
import type { CoordinatedUnit } from '../../../core/permissions/coordinatorService'
import type { Workspace } from '../../../core/workspaces/types'
import type { ChamadosReport } from '../../../apps/chamados/types/report'
import type { Ticket } from '../../../apps/chamados/types'

const DAY_MS = 24 * 60 * 60 * 1000

export interface CoordinatorReportsTabProps {
  units: CoordinatedUnit[]
  workspaces: Workspace[]
}

interface ReportPeriod {
  days: 7 | 30 | 90
  label: string
}

const REPORT_PERIODS: readonly ReportPeriod[] = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
]

function periodRange(days: number): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to.getTime() - days * DAY_MS)
  return { from: from.toISOString(), to: to.toISOString() }
}

/** Status do SLA do app Chamados para uma unidade (reuso do cache bruto). */
type UnitSla = { within: number; near: number; overdue: number; rate: number }

interface UnitReportsState {
  workspace: Workspace | null
  report: ChamadosReport | null
  error: string | null
  sla: UnitSla
}

function emptyUnitState(workspace: Workspace | null): UnitReportsState {
  return { workspace, report: null, error: null, sla: { within: 0, near: 0, overdue: 0, rate: 0 } }
}

/**
 * Aba "Relatórios" da Central (Fase F.1) — leitura honesta do escopo.
 *
 * Nenhuma consulta ampla: `getReports` é chamada POR UNIDADE com
 * `workspace_id` do membro da coordenação (o mesmo criterion que a ReservaLab
 * usa para labs). `Promise.allSettled` isola falha por unidade — uma unidade
 * com erro não derruba as demais e não vira "0" falso. O SLA vem do MESMO
 * cache bruto (`chamados`) que a Visão Geral usa (`analyzeSlaByWorkspace` +
 * `getHoursForTickets`), sem novo ciclo de polling/pull — nada é re-buscado.
 *
 * Restrito (honesto): se o papel não pode acessar o app de Chamados, nada é
 * buscard — a aba mostra "acesso restrito" e não inventa número algum.
 */
export function CoordinatorReportsTab({ units, workspaces }: CoordinatorReportsTabProps) {
  const { canAccessApp } = useAppAccess()
  const [periodKey, setPeriodKey] = useState<7 | 30 | 90>(30)
  const [loading, setLoading] = useState(true)
  const [byUnit, setByUnit] = useState<Record<string, UnitReportsState>>({})

  const allowed = canAccessApp('chamados')

  useEffect(() => {
    if (!allowed) return
    if (units.length === 0) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)

    const { from, to } = periodRange(periodKey)

    async function loadUnit(unit: CoordinatedUnit): Promise<UnitReportsState> {
      const workspace = workspaces.find((w) => w.id === unit.unitId) ?? null
      if (!workspace) {
        return { ...emptyUnitState(null), error: 'workspace não visível no escopo' }
      }
      try {
        const report = await ticketService.getReports({ from, to, workspace_id: unit.unitId })
        return { ...emptyUnitState(workspace), report }
      } catch {
        return { ...emptyUnitState(workspace), error: 'Não foi possível carregar os relatórios desta unidade.' }
      }
    }

    Promise.all(units.map(loadUnit))
      .then((states) => {
        if (cancelled) return
        setByUnit((prev) => {
          const next: Record<string, UnitReportsState> = {}
          for (let i = 0; i < units.length; i++) {
            const u = units[i]
            const st = states[i]
            const ws = st.workspace ?? prev[u.unitId]?.workspace ?? null
            const wsSla = ws ? slaByWorkspace[ws.id] : undefined
            next[u.unitId] = { ...st, workspace: ws, sla: wsSla ?? st.sla }
            if (prev[u.unitId]?.workspace && !next[u.unitId].workspace) {
              next[u.unitId].workspace = prev[u.unitId].workspace
            }
          }
          return next
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [allowed, units, workspaces, periodKey])

  const slaByWorkspace = useMemo(() => {
    const tickets = getCol<Ticket>('chamados')
    const configs = slaConfigService.getHoursForTickets()
    return analyzeSlaByWorkspace(tickets, configs)
  }, [byUnit, periodKey])

  const unitIds = useMemo(() => units.map((u) => u.unitId), [units])
  const resolved = byUnit

  function handleExportCsv() {
    const headers = ['Unidade', 'Total', 'Abertos', 'Resolvidos', 'Tempo médio (h)', 'SLA dentro (%)']
    const rows = unitIds.map((uid) => {
      const st = resolved[uid]
      const ws = st?.workspace
      const report = st?.report
      const total = report?.total ?? 0
      const resolvedCount = report?.byStatus?.resolvido ?? 0
      const open = report ? total - resolvedCount : 0
      const avg = report?.avgResolutionHours != null ? String(report.avgResolutionHours) : ''
      const rate = st?.sla.rate ?? 0
      return [
        ws?.name ?? uid,
        String(total),
        String(open),
        String(resolvedCount),
        avg,
        `${rate}%`,
      ]
    })
    exportCSV(headers, rows, `relatorios-central-${periodKey}d`)
  }

  return (
    <section data-testid="tab-reports" className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
            <icons.ui.fileBarChart size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-fg">Relatórios</h2>
            <p className="text-[10px] text-fg-muted">Relatórios do escopo (leitura · por unidade)</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
          {REPORT_PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              data-testid={`reports-period-${p.days}`}
              aria-pressed={periodKey === p.days}
              onClick={() => setPeriodKey(p.days)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                periodKey === p.days
                  ? 'bg-fg text-bg'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!allowed && (
        <div
          data-testid="reports-restricted"
          className="mt-3 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3"
        >
          <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            acesso restrito
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
            Seu papel não dá acesso de leitura ao app de Chamados. Nada é buscado nem exibido
            aqui — a leitura de relatórios continua definida pela permissão do app.
          </p>
        </div>
      )}

      {allowed && loading && (
        <div className="mt-3 flex flex-col gap-2">
          <div data-testid="reports-loading" className="flex items-center gap-2 text-[11px] text-fg-muted">
            <icons.ui.clock size={14} />
            Carregando relatórios do escopo…
          </div>
        </div>
      )}

      {allowed && !loading && (
        <div className="mt-3 flex flex-col gap-2">
          {unitIds.length === 0 ? (
            <p data-testid="reports-empty" className="text-[11px] text-fg-muted">
              Nenhuma unidade no escopo.
            </p>
          ) : (
            unitIds.map((uid) => {
              const st = byUnit[uid]
              const unit = units.find((u) => u.unitId === uid)
              if (!st) return null
              return (
                <div
                  key={uid}
                  data-testid={`reports-unit-${uid}`}
                  className="rounded-lg border border-line bg-surface p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-fg">
                      {unit?.unitName ?? st.workspace?.name ?? uid}
                    </p>
                    <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
                      {periodKey}d
                    </span>
                  </div>

                  {st.error && (
                    <p data-testid={`reports-unit-${uid}-error`} className="mt-2 text-[11px] font-medium text-red-500">
                      {st.error}
                    </p>
                  )}

                  {!st.error && (
                    <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      <Kpi label="Total" value={st.report?.total ?? 0} tone="neutral" />
                      <Kpi label="Abertos" value={totalOpen(st)} tone="violet" />
                      <Kpi label="Resolvidos" value={st.report?.byStatus?.resolvido ?? 0} tone="emerald" />
                      <Kpi label="Tempo médio (h)" value={fmtAvg(st.report?.avgResolutionHours)} tone="neutral" />
                      <Kpi label="SLA dentro" value={`${st.sla.rate}%`} tone="emerald" />
                      <Kpi label="Satisfação" value={fmtFeedback(st.report)} tone="neutral" />
                    </div>
                  )}

                  {st.report && (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-fg">Distribuição</p>
                      <span className="text-[10px] text-fg-muted">
                        {Object.keys(st.report.byPriority ?? {}).length} prioridades
                      </span>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {allowed && !loading && unitIds.length > 0 && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            data-testid="reports-export-csv"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <icons.ui.download size={13} />
            Exportar CSV
          </button>
        </div>
      )}
    </section>
  )
}

const TONE_TEXT: Record<string, string> = {
  neutral: 'text-fg',
  violet: 'text-violet-500',
  emerald: 'text-emerald-500',
  amber: 'text-amber-500',
  red: 'text-red-500',
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone: 'neutral' | 'violet' | 'emerald' | 'amber' | 'red'
}) {
  return (
    <div className="rounded-lg border border-line bg-card p-2">
      <p className={cn('truncate text-sm font-bold', TONE_TEXT[tone] ?? 'text-fg')}>{value}</p>
      <p className="truncate text-[10px] text-fg-muted">{label}</p>
    </div>
  )
}

function totalOpen(st: UnitReportsState): number {
  if (!st.report) return 0
  const resolved = st.report.byStatus?.resolvido ?? 0
  return Math.max(0, st.report.total - resolved)
}

function fmtAvg(hours: number | null | undefined): string {
  return hours != null ? String(Number(hours.toFixed(1))) : '—'
}

function fmtFeedback(report: ChamadosReport | null): string {
  if (!report?.feedback?.average || report.feedback.average == null) return '—'
  return String(Number(report.feedback.average.toFixed(1)))
}
