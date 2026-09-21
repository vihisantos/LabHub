import { useEffect, useMemo, useState } from 'react'
import { icons } from '../../../lib/icons'
import { ticketService } from '../../../apps/chamados/services/ticketService'
import { analyzeSla, analyzeSlaByWorkspace } from '../../../apps/chamados/services/sla'
import type { SlaAnalysis, SlaWorkspaceSummary } from '../../../apps/chamados/services/sla'
import { slaConfigService } from '../../../apps/chamados/services/slaConfigService'
import { exportCSV } from '../../../apps/pcare/utils/export'
import { useAppAccess } from '../../../core/permissions/usePermissions'
import { getCol } from '../../../lib/db'
import { ChartCard, DonutChart, BarChart } from '../../../lib/charts'
import { cn } from '../../../lib/components/ui/utils'
import type { CoordinatedUnit } from '../../../core/permissions/coordinatorService'
import type { Workspace } from '../../../core/workspaces/types'
import type { ChamadosReport } from '../../../apps/chamados/types/report'
import type { Ticket } from '../../../apps/chamados/types'
import {
  PROBLEM_AREA_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from '../../../apps/chamados/types'

const DAY_MS = 24 * 60 * 60 * 1000

const CHART_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#eab308', '#a855f7', '#ec4899']

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

interface UnitReportsState {
  workspace: Workspace | null
  report: ChamadosReport | null
  error: string | null
  /** SLA HISTÓRICO do período: resolvidos por `resolvedAt` no [from,to] da unidade. */
  period: SlaAnalysis | null
  /** SLA OPERACIONAL atual: cache bruto (abertos), sem período. */
  operational: SlaWorkspaceSummary | null
}

function emptyUnitState(workspace: Workspace | null): UnitReportsState {
  return { workspace, report: null, error: null, period: null, operational: null }
}

/**
 * Análise histórica honesta do período: apenas chamados RESOLVIDOS da unidade
 * com `resolvedAt` dentro de [from,to]. Reutiliza `analyzeSla` (mesma semântica
 * do app) e os hours configurados por workspace (`getHoursForTickets`, leitura).
 */
function analyzePeriodSla(
  tickets: Ticket[],
  configs: ReturnType<typeof slaConfigService.getHoursForTickets>,
  workspaceId: string,
  from: string,
  to: string,
): SlaAnalysis {
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  const resolved = tickets.filter((t) => {
    if (t.workspace_id !== workspaceId) return false
    if (!t.resolvedAt) return false
    const ts = new Date(t.resolvedAt).getTime()
    if (!Number.isFinite(ts)) return false
    return ts >= fromMs && ts <= toMs
  })
  return analyzeSla(resolved, configs)
}

interface DonutDatum {
  name: string
  value: number
  color: string
}

function distDonut(counts: Record<string, number>, labels: Record<string, string>): DonutDatum[] {
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v], i) => ({
      name: labels[k] ?? k,
      value: v,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }))
}

function distTotal(counts: Record<string, number>): number {
  return Object.values(counts).reduce((s, v) => s + v, 0)
}

function areaBars(counts: Record<string, number>): { label: string; value: number; color: string }[] {
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v], i) => ({
      label: PROBLEM_AREA_LABELS[k as keyof typeof PROBLEM_AREA_LABELS] ?? k,
      value: v,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }))
}

/**
 * Aba "Relatórios" da Central (Fase F.1) — leitura honesta do escopo.
 *
 * Nenhuma consulta ampla: `getReports` é chamada POR UNIDADE com
 * `workspace_id` do membro da coordenação. `Promise.allSettled` isola falha por
 * unidade (resultado associado por `workspace_id`) — uma unidade com erro não
 * derruba as demais e não vira "0" falso.
 *
 * SLA em DOIS blocos honestos, nunca misturados:
 *  - "SLA do período": histórico real do intervalo selecionado, via `analyzeSla`
 *    (resolvidos com `resolvedAt` em [from,to] por `workspace_id`).
 *  - "SLA operacional (agora)": estado atual dos abertos, via
 *    `analyzeSlaByWorkspace` sobre o MESMO cache bruto (`chamados`) da Visão
 *    Geral — independente do período escolhido, rotulado como tal.
 *
 * Distribuições reais do período (`byStatus`, `byPriority`, `byArea`) usam os
 * componentes existentes de `src/lib/charts` — nada de gráfico novo.
 *
 * Restrito (honesto): sem leitura de Chamados, a aba mostra "acesso restrito"
 * e não inventa número algum.
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
    const cache = getCol<Ticket>('chamados')
    const configs = slaConfigService.getHoursForTickets()

    async function loadUnit(unit: CoordinatedUnit): Promise<UnitReportsState> {
      const workspace = workspaces.find((w) => w.id === unit.unitId) ?? null
      if (!workspace) {
        return { ...emptyUnitState(null), error: 'workspace não visível no escopo' }
      }
      const report = await ticketService.getReports({ from, to, workspace_id: unit.unitId })
      return { ...emptyUnitState(workspace), report }
    }

    Promise.allSettled(units.map((unit) => loadUnit(unit))).then((results) => {
      if (cancelled) return
      const next: Record<string, UnitReportsState> = {}
      for (let i = 0; i < units.length; i++) {
        const unit = units[i]
        const workspace = workspaces.find((w) => w.id === unit.unitId) ?? null
        const r = results[i]
        if (r.status === 'fulfilled') {
          next[unit.unitId] = r.value
        } else {
          next[unit.unitId] = {
            ...emptyUnitState(workspace),
            error: 'Não foi possível carregar os relatórios desta unidade.',
          }
        }
        next[unit.unitId].period = analyzePeriodSla(cache, configs, unit.unitId, from, to)
        next[unit.unitId].operational = analyzeSlaByWorkspace(cache, configs)[unit.unitId] ?? null
      }
      setByUnit((prev) => {
        for (const uid of Object.keys(next)) {
          const st = next[uid]
          if (!st.workspace && prev[uid]?.workspace) {
            st.workspace = prev[uid].workspace
          }
        }
        return next
      })
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [allowed, units, workspaces, periodKey])

  const unitIds = useMemo(() => units.map((u) => u.unitId), [units])

  function handleExportCsv() {
    const headers = [
      'Unidade',
      'Total',
      'Abertos',
      'Resolvidos',
      'Tempo médio (h)',
      'SLA no período (%)',
      'SLA operacional (agora) (%)',
    ]
    const rows = unitIds.map((uid) => {
      const st = byUnit[uid]
      const ws = st?.workspace
      const report = st?.report
      const total = report?.total ?? 0
      const resolvedCount = report?.byStatus?.resolvido ?? 0
      const open = report ? total - resolvedCount : 0
      const avg = report?.avgResolutionHours != null ? String(report.avgResolutionHours) : ''
      const periodRate = st?.period?.rate ?? 0
      const operationRate = st?.operational?.rate ?? 0
      return [
        ws?.name ?? uid,
        String(total),
        String(open),
        String(resolvedCount),
        avg,
        `${periodRate}%`,
        `${operationRate}%`,
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
                    <>
                      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        <Kpi label="Total" value={st.report?.total ?? 0} tone="neutral" />
                        <Kpi label="Abertos" value={totalOpen(st)} tone="violet" />
                        <Kpi label="Resolvidos" value={st.report?.byStatus?.resolvido ?? 0} tone="emerald" />
                        <Kpi label="Tempo médio (h)" value={fmtAvg(st.report?.avgResolutionHours)} tone="neutral" />
                        <Kpi label="SLA no período" value={`${st.period?.rate ?? 0}%`} tone="emerald" />
                        <Kpi label="Satisfação" value={fmtFeedback(st.report)} tone="neutral" />
                      </div>

                      <div className="mt-2 space-y-1 border-t border-line pt-2">
                        <p data-testid={`reports-unit-${uid}-sla-period`} className="text-[10px] text-fg-muted">
                          SLA do período ({periodKey}d): {st.period?.rate ?? 0}% dentro ·{' '}
                          {st.period?.met ?? 0}/{st.period?.total ?? 0} resolvidos no prazo
                        </p>
                        <p data-testid={`reports-unit-${uid}-sla-operational`} className="text-[10px] text-fg-muted">
                          SLA operacional (agora): {st.operational?.rate ?? 0}% dentro (
                          {st.operational?.within ?? 0} ok · {st.operational?.near ?? 0} perto ·{' '}
                          {st.operational?.overdue ?? 0} vencido{st.operational?.overdue === 1 ? '' : 's'})
                        </p>
                      </div>
                    </>
                  )}

                  {st.report && (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <ChartCard title="Por status" subtitle={`Distribuição do período (${periodKey}d)`}>
                        <div data-testid={`reports-unit-${uid}-chart-status`}>
                          <DonutChart data={distDonut(st.report.byStatus, TICKET_STATUS_LABELS)} size={150} centralLabel={String(distTotal(st.report.byStatus))} centralSubLabel="chamados" />
                        </div>
                      </ChartCard>
                      <ChartCard title="Por prioridade" subtitle={`Distribuição do período (${periodKey}d)`}>
                        <div data-testid={`reports-unit-${uid}-chart-priority`}>
                          <DonutChart data={distDonut(st.report.byPriority, TICKET_PRIORITY_LABELS)} size={150} centralLabel={String(distTotal(st.report.byPriority))} centralSubLabel="chamados" />
                        </div>
                      </ChartCard>
                      {Object.keys(st.report.byArea).length > 0 && (
                        <ChartCard title="Por área" subtitle="Chamados por área">
                          <div data-testid={`reports-unit-${uid}-chart-area`}>
                            <BarChart data={areaBars(st.report.byArea)} layout="horizontal" height={100} />
                          </div>
                        </ChartCard>
                      )}
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