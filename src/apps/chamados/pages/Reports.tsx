import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ticketService } from '../services/ticketService'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  PROBLEM_AREA_LABELS,
} from '../types'
import { icons } from '../../../lib/icons'
import type { ChamadosReport, ReportPeriodDays, TicketStatus } from '../types'
import type { ReportTicket } from '../types/report'
import { BottomSheet, SheetHeader } from '../../../platform/ui/BottomSheet'
import { SheetOrDialog } from '../../../responsive'

const PERIOD_OPTIONS: { label: string; days: ReportPeriodDays }[] = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: 'Semestre atual', days: 'semester' },
  { label: 'Semestre anterior', days: 'previous-semester' },
  { label: 'Todo o período', days: 0 },
]

const STATUS_ORDER: TicketStatus[] = [
  'aberto', 'a_caminho', 'em_atendimento', 'em_espera', 'resolvido', 'indeferido', 'fechado',
]
const PRIORITY_ORDER = ['baixa', 'normal', 'alta', 'urgente']

function BarList({ items, total }: { items: [string, number][]; total: number }) {
  return (
    <div className="space-y-2">
      {items.map(([label, count]) => (
        <div key={label}>
          <div className="mb-0.5 flex items-center justify-between text-xs">
            <span className="truncate text-fg">{label}</span>
            <span className="font-semibold text-fg-muted">{count}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-input">
            <div
              className="h-1.5 rounded-full bg-amber-500"
              style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function formatResolutionTime(hours: number | null, exactMinutes?: number | null): string {
  if (exactMinutes == null && hours === null) return '—'
  const minutes = exactMinutes ?? Math.round((hours ?? 0) * 60)
  if (minutes < 60) return `${minutes} min`
  const wholeHours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes ? `${wholeHours}h ${remainingMinutes}min (${minutes} min)` : `${wholeHours}h (${minutes} min)`
}

function formatTechnicianName(name: string): string {
  const particles = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])
  return name.trim().toLocaleLowerCase('pt-BR').split(/\s+/).map((part, index) =>
    index > 0 && particles.has(part) ? part : part.replace(/(^|[-'])((?:\p{L}))/gu, (_, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase('pt-BR')),
  ).join(' ')
}

function MonthlyTrend({ items }: { items: NonNullable<ChamadosReport['byMonth']> }) {
  const peak = Math.max(1, ...items.flatMap((item) => [item.created, item.resolved]))
  return (
    <div className="space-y-3">
      {items.map((month) => (
        <div key={month.month} className="grid grid-cols-[70px_1fr] items-center gap-2 text-[10px] text-fg-muted">
          <span>{month.month}</span>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0">Criados {month.created}</span>
              <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${Math.max(month.created ? 3 : 0, (month.created / peak) * 100)}%` }} />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0">Resolvidos {month.resolved}</span>
              <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.max(month.resolved ? 3 : 0, (month.resolved / peak) * 100)}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function Reports() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const [days, setDays] = useState<ReportPeriodDays>(30)
  const [draftDays, setDraftDays] = useState<ReportPeriodDays>(30)
  const [report, setReport] = useState<ChamadosReport | null>(null)
  const [filterOptions, setFilterOptions] = useState<ChamadosReport | null>(null)
  const [technicianFilter, setTechnicianFilter] = useState('')
  const [draftTechnicianFilter, setDraftTechnicianFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [draftStatusFilter, setDraftStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [draftCategoryFilter, setDraftCategoryFilter] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [customMode, setCustomMode] = useState(false)
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null)
  const [drilldown, setDrilldown] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailDisabledOpen, setEmailDisabledOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const load = useCallback(
    async (d: ReportPeriodDays, range: { from: string; to: string } | null, filters: { technician: string; status: string; category: string }) => {
      setLoading(true)
      setError('')
      const params: { from?: string; to?: string; workspace_id?: string } = {}
      if (range) {
        params.from = new Date(`${range.from}T00:00:00`).toISOString()
        params.to = new Date(`${range.to}T23:59:59.999`).toISOString()
      } else if (typeof d === 'number' && d > 0) {
        params.from = new Date(Date.now() - d * 86400000).toISOString()
      }
      if (!range && (d === 'semester' || d === 'previous-semester')) {
        const now = new Date()
        const currentStartMonth = now.getMonth() < 6 ? 0 : 6
        const startYear = now.getFullYear() - (d === 'previous-semester' && currentStartMonth === 0 ? 1 : 0)
        const startMonth = d === 'previous-semester' ? (currentStartMonth === 0 ? 6 : 0) : currentStartMonth
        const start = new Date(startYear, startMonth, 1)
        const end = new Date(new Date(startYear, startMonth + 6, 1).getTime() - 1)
        params.from = start.toISOString()
        params.to = end.toISOString()
      }
      if (workspace?.id) params.workspace_id = workspace.id
      try {
        const all = await ticketService.getReports(params)
        const hasFilters = Boolean(filters.technician || filters.status || filters.category)
        const filtered = hasFilters ? await ticketService.getReports({ ...params, ...filters }) : all
        setFilterOptions(all)
        setReport(filtered)
      } catch {
        setError('Não foi possível carregar o relatório')
      } finally {
        setLoading(false)
      }
    },
    [workspace?.id],
  )

  useEffect(() => {
    load(days, customRange, { technician: technicianFilter, status: statusFilter, category: categoryFilter })
  }, [load, days, customRange, technicianFilter, statusFilter, categoryFilter])

  const drilldownTickets = useMemo(() => {
    if (!report) return []
    return (report.tickets ?? []).filter((ticket) => {
      if (drilldown.startsWith('status:')) return ticket.status === drilldown.slice(7)
      if (drilldown.startsWith('category:')) return ticket.category === drilldown.slice(9)
      if (drilldown.startsWith('technician:')) return ticket.technician === drilldown.slice(11)
      return false
    })
  }, [drilldown, report])

  const drilldownTitle = useMemo(() => {
    if (drilldown.startsWith('status:')) {
      const status = drilldown.slice(7) as TicketStatus
      return `Chamados ${TICKET_STATUS_LABELS[status] ?? status}`
    }
    if (drilldown.startsWith('category:')) return `Chamados de ${drilldown.slice(9)}`
    if (drilldown.startsWith('technician:')) return `Chamados de ${formatTechnicianName(drilldown.slice(11))}`
    return 'Detalhes dos chamados'
  }, [drilldown])

  const customRangeValid = Boolean(customFrom && customTo && customFrom <= customTo)

  const openFilters = () => {
    setDraftDays(days)
    setCustomMode(Boolean(customRange))
    setCustomFrom(customRange?.from ?? '')
    setCustomTo(customRange?.to ?? '')
    setDraftTechnicianFilter(technicianFilter)
    setDraftStatusFilter(statusFilter)
    setDraftCategoryFilter(categoryFilter)
    setFiltersOpen(true)
  }

  const applyFilters = () => {
    if (customMode && !customRangeValid) return
    setDays(draftDays)
    setCustomRange(customMode ? { from: customFrom, to: customTo } : null)
    setTechnicianFilter(draftTechnicianFilter)
    setStatusFilter(draftStatusFilter)
    setCategoryFilter(draftCategoryFilter)
    setFiltersOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={openFilters} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-4 text-sm font-semibold text-fg transition-colors hover:border-amber-500 hover:text-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50">
          <icons.ui.filter size={16} /> Filtros
        </button>
      </div>
      <SheetOrDialog open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtros do relatório" description="Escolha o período e refine os chamados exibidos." className="max-w-2xl">
      <section aria-label="Filtros do relatório" className="space-y-4 px-4 pb-5 sm:px-5">
        <fieldset className="min-w-0">
          <legend className="mb-2 text-xs font-semibold text-fg">Período</legend>
          <div role="group" aria-label="Período do relatório" className="reports-period-scroll flex gap-2 overflow-x-auto pb-2">
            {PERIOD_OPTIONS.map((opt) => {
              const selected = !customMode && draftDays === opt.days
              return (
                <button
                  key={opt.days}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => { setCustomMode(false); setDraftDays(opt.days) }}
                  className={`min-h-10 shrink-0 whitespace-nowrap rounded-xl border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 ${
                    selected ? 'border-amber-500 bg-amber-500 text-white' : 'border-line bg-surface text-fg-dim hover:text-fg'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
            <button
              type="button"
              aria-pressed={customMode}
              onClick={() => setCustomMode(true)}
              className={`min-h-10 shrink-0 whitespace-nowrap rounded-xl border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 ${
                customMode ? 'border-amber-500 bg-amber-500 text-white' : 'border-line bg-surface text-fg-dim hover:text-fg'
              }`}
            >
              Personalizado
            </button>
          </div>
        </fieldset>

        {customMode && (
          <fieldset className="grid min-w-0 grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2">
            <legend className="sr-only">Intervalo de datas personalizado</legend>
            <label htmlFor="reports-date-from" className="block min-w-0 text-xs font-medium text-fg-muted">
              De
              <input
                id="reports-date-from"
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(event) => setCustomFrom(event.target.value)}
                className="mt-1 block h-10 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-sm text-fg focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
            </label>
            <label htmlFor="reports-date-to" className="block min-w-0 text-xs font-medium text-fg-muted">
              Até
              <input
                id="reports-date-to"
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(event) => setCustomTo(event.target.value)}
                className="mt-1 block h-10 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-sm text-fg focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
            </label>
          </fieldset>
        )}

        <fieldset className="grid min-w-0 grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="sr-only">Filtros adicionais</legend>
          <label htmlFor="reports-technician" className="block min-w-0 text-xs font-medium text-fg-muted">
            Técnico
            <select id="reports-technician" value={draftTechnicianFilter} onChange={(event) => setDraftTechnicianFilter(event.target.value)} className="mt-1 block h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30">
              <option value="">Todos os técnicos</option>{(filterOptions?.byTechnician ?? []).map((tech) => <option key={tech.name} value={tech.name}>{formatTechnicianName(tech.name)}</option>)}
            </select>
          </label>
          <label htmlFor="reports-status" className="block min-w-0 text-xs font-medium text-fg-muted">
            Status
            <select id="reports-status" value={draftStatusFilter} onChange={(event) => setDraftStatusFilter(event.target.value)} className="mt-1 block h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30">
              <option value="">Todos os status</option>{STATUS_ORDER.map((status) => <option key={status} value={status}>{TICKET_STATUS_LABELS[status]}</option>)}
            </select>
          </label>
          <label htmlFor="reports-category" className="block min-w-0 text-xs font-medium text-fg-muted">
            Categoria
            <select id="reports-category" value={draftCategoryFilter} onChange={(event) => setDraftCategoryFilter(event.target.value)} className="mt-1 block h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30">
              <option value="">Todas as categorias</option>{Object.keys(filterOptions?.byCategory ?? {}).sort().map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
        </fieldset>
        <div className="flex justify-end border-t border-line pt-3">
          <button type="button" disabled={customMode && !customRangeValid} onClick={applyFilters} className="h-10 rounded-xl bg-amber-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 disabled:cursor-not-allowed disabled:opacity-50">Aplicar</button>
        </div>
      </section>
      </SheetOrDialog>

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
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 rounded-xl bg-card p-4 text-center shadow-[var(--shadow-card)]">
              <p className="text-3xl font-bold text-fg">{report.total}</p>
              <p className="mt-1 text-xs text-fg-muted">
                Chamados no período
                {workspace ? ` · ${workspace.name}` : ''}
              </p>
            </div>
            <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <p className="text-2xl font-bold text-fg">
                {formatResolutionTime(report.avgResolutionHours, report.avgResolutionMinutes)}
              </p>
              <p className="mt-0.5 text-xs text-fg-muted">Tempo médio de resolução</p>
            </div>
            <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <p className="text-2xl font-bold text-fg">{report.avgServiceMinutes != null ? `${report.avgServiceMinutes} min` : '—'}</p>
              <p className="mt-0.5 text-xs text-fg-muted">Média em “Em atendimento”</p>
              <p className="mt-1 text-[10px] text-fg-dim">Tempo no status, conforme o histórico.</p>
            </div>
            <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <p className="text-2xl font-bold text-fg">{report.avgTimeToAssignedMinutes != null ? `${report.avgTimeToAssignedMinutes} min` : '—'}</p>
              <p className="mt-0.5 text-xs text-fg-muted">Média até a primeira atribuição</p>
              <p className="mt-1 text-[10px] text-fg-dim">Da abertura até o primeiro registro de atribuição.</p>
            </div>
            <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <icons.ui.star
                    key={n}
                    size={16}
                    className={report.feedback.average !== null && n <= Math.round(report.feedback.average) ? 'fill-amber-500 text-amber-500' : 'text-fg-dim'}
                  />
                ))}
              </div>
              <p className="mt-1 text-center text-xs text-fg-muted">
                {report.feedback.count} avaliaç{report.feedback.count !== 1 ? 'ões' : 'ão'}
                {report.feedback.average !== null ? ` · ${report.feedback.average.toFixed(1)}` : ''}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-3 text-xs font-semibold text-fg-muted">Por status</h3>
            <BarList
              items={STATUS_ORDER.filter((s) => report.byStatus[s]).map((s) => [TICKET_STATUS_LABELS[s], report.byStatus[s]])}
              total={report.total}
            />
            <div className="mt-2 flex flex-wrap gap-1">{STATUS_ORDER.filter((status) => report.byStatus[status]).map((status) => <button key={status} type="button" onClick={() => setDrilldown(`status:${status}`)} className="rounded-md px-2 py-1 text-[10px] text-amber-600 hover:bg-amber-500/10">Ver {TICKET_STATUS_LABELS[status]} ({report.byStatus[status]})</button>)}</div>
          </div>

          <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-3 text-xs font-semibold text-fg-muted">Por prioridade</h3>
            <BarList
              items={PRIORITY_ORDER.filter((p) => report.byPriority[p]).map((p) => [TICKET_PRIORITY_LABELS[p as keyof typeof TICKET_PRIORITY_LABELS], report.byPriority[p]])}
              total={report.total}
            />
          </div>

          {Object.keys(report.byCategory).length > 0 && (
            <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <h3 className="mb-3 text-xs font-semibold text-fg-muted">Por categoria</h3>
              <BarList items={Object.entries(report.byCategory).sort((a, b) => b[1] - a[1])} total={report.total} />
              <div className="mt-2 flex flex-wrap gap-1">{Object.entries(report.byCategory).map(([category, count]) => <button key={category} type="button" onClick={() => setDrilldown(`category:${category}`)} className="rounded-md px-2 py-1 text-[10px] text-amber-600 hover:bg-amber-500/10">Ver {category} ({count})</button>)}</div>
            </div>
          )}

          {(report.byMonth ?? []).length > 0 && (
            <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <h3 className="mb-3 text-xs font-semibold text-fg-muted">Chamados por mês</h3>
              <MonthlyTrend items={report.byMonth ?? []} />
            </div>
          )}

          <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-2 text-xs font-semibold text-fg-muted">Distribuição das avaliações</h3>
            <div className="flex flex-wrap gap-3 text-xs text-fg">{[5, 4, 3, 2, 1].map((star) => <span key={star}>{'★'.repeat(star)} {report.feedback.byRating?.[String(star)] ?? 0}</span>)}</div>
          </div>

          {Object.keys(report.byArea).length > 0 && (
            <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <h3 className="mb-3 text-xs font-semibold text-fg-muted">Por área</h3>
              <BarList
                items={Object.entries(report.byArea).map(([key, count]) => [
                  PROBLEM_AREA_LABELS[key as keyof typeof PROBLEM_AREA_LABELS] ?? key,
                  count,
                ])}
                total={report.total}
              />
            </div>
          )}

          {report.byRoom.length > 0 && (
            <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <h3 className="mb-3 text-xs font-semibold text-fg-muted">Top salas</h3>
              <BarList items={report.byRoom.slice(0, 8)} total={report.total} />
            </div>
          )}

          {report.byTechnician.length > 0 && (
            <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <h3 className="mb-3 text-xs font-semibold text-fg-muted">Atendimento por técnico</h3>
              <p className="mb-3 text-[10px] text-fg-muted">Chamados atribuídos a cada técnico no período selecionado.</p>
              <div className="space-y-2">
                {report.byTechnician.map((tech) => (
                  <div key={tech.name}>
                    <div className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">{formatTechnicianName(tech.name)}</p>
                        <p className="text-[10px] text-fg-muted">
                          {tech.open} em andamento · {tech.resolved} resolvido{tech.resolved !== 1 ? 's' : ''}
                        </p>
                        {tech.ratingCount > 0 && <p className="text-[10px] text-fg-muted">{tech.ratingCount} avaliação{tech.ratingCount !== 1 ? 'ões' : ''}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-fg">{formatResolutionTime(tech.avgResolutionHours, tech.avgResolutionMinutes)}</p>
                        <p className="text-[10px] text-fg-muted">
                          {tech.rating !== null ? `★ ${tech.rating.toFixed(1)}` : 'Sem avaliação'}
                        </p>
                        {tech.avgTimeToAssignedMinutes != null && <p className="text-[10px] text-fg-muted">Atribuído em média em {tech.avgTimeToAssignedMinutes} min</p>}
                      </div>
                    </div>
                    <button type="button" onClick={() => setDrilldown(`technician:${tech.name}`)} className="mt-1 px-2 py-1 text-[10px] text-amber-600">Ver chamados de {formatTechnicianName(tech.name)} ({tech.total})</button>
                    {tech.reviews?.map((review, index) => (
                      <div key={`${tech.name}-review-${index}`} className="ml-3 mt-1 rounded-lg border-l-2 border-amber-500/50 bg-surface px-3 py-2 text-xs text-fg-muted">
                        <span className="mr-2 text-amber-500">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
                        {review.ticketNumber ? <span className="mr-2">Chamado #{review.ticketNumber}</span> : null}
                        {review.feedbackAt ? <span className="mr-2">{new Date(review.feedbackAt).toLocaleDateString('pt-BR')}</span> : null}
                        <span>{review.comment ? `“${review.comment}”` : 'Sem comentário'}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <SheetOrDialog
            open={Boolean(drilldown)}
            onClose={() => setDrilldown('')}
            title={drilldownTitle}
            description={`${drilldownTickets.length} chamado${drilldownTickets.length === 1 ? '' : 's'} no filtro selecionado`}
            className="max-w-3xl"
          >
            <div className="space-y-3 px-4 pb-5 sm:px-5">
              <p className="text-xs text-fg-muted">
                {drilldownTickets.length} chamado{drilldownTickets.length === 1 ? '' : 's'} encontrado{drilldownTickets.length === 1 ? '' : 's'}.
              </p>
              {drilldownTickets.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-fg-muted">
                  Nenhum chamado encontrado neste filtro.
                </div>
              ) : (
                <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                  {drilldownTickets.map((ticket: ReportTicket) => (
                    <article key={ticket.id} className="rounded-xl border border-line bg-surface p-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/chamados/tickets/${ticket.id}`)}
                        className="text-left text-sm font-semibold text-fg hover:text-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
                      >
                        #{ticket.ticketNumber} · {ticket.category} · {ticket.roomName || 'Local não informado'}
                      </button>
                      <p className="mt-1 text-xs text-fg-muted">
                        {TICKET_STATUS_LABELS[ticket.status as TicketStatus] ?? ticket.status} · {ticket.technician || 'Sem técnico'} · {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                        <div className="rounded-lg bg-card px-3 py-2">
                          <dt className="text-[10px] text-fg-muted">Até primeira atribuição</dt>
                          <dd className="mt-0.5 font-medium text-fg">{ticket.timeToAssignedMinutes != null ? `${ticket.timeToAssignedMinutes} min` : 'Sem evento de atribuição'}</dd>
                        </div>
                        <div className="rounded-lg bg-card px-3 py-2">
                          <dt className="text-[10px] text-fg-muted">Tempo de resolução</dt>
                          <dd className="mt-0.5 font-medium text-fg">{ticket.resolutionMinutes != null ? `${ticket.resolutionMinutes} min` : '—'}</dd>
                        </div>
                        <div className="rounded-lg bg-card px-3 py-2">
                          <dt className="text-[10px] text-fg-muted">Em atendimento</dt>
                          <dd className="mt-0.5 font-medium text-fg">{ticket.serviceMinutes != null ? `${ticket.serviceMinutes} min` : 'Sem histórico estruturado'}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </SheetOrDialog>

          <div className="rounded-xl border border-line bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-1 text-xs font-semibold text-fg">Enviar resumo semanal por email</h3>
            <p className="mb-3 text-[11px] text-fg-muted">
              O envio por e-mail está temporariamente desativado.
            </p>
            <button
              type="button"
              onClick={() => setEmailDisabledOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
            >
              <icons.ui.mail size={16} />
              Enviar relatório semanal
            </button>
          </div>

          <BottomSheet open={emailDisabledOpen} onClose={() => setEmailDisabledOpen(false)}>
            <SheetHeader
              title="Envio desativado no momento"
              subtitle="Relatórios por e-mail"
              onClose={() => setEmailDisabledOpen(false)}
            />
            <div className="space-y-4 px-5 pb-6">
              <p className="text-sm leading-relaxed text-fg-muted">
                O relatório não foi enviado. Estamos configurando o remetente de e-mail do LabHub. Não é um problema com sua conta; o envio será liberado quando essa configuração estiver pronta.
              </p>
              <button
                type="button"
                onClick={() => setEmailDisabledOpen(false)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
              >
                Entendi
              </button>
            </div>
          </BottomSheet>

          <button
            type="button"
            onClick={() => navigate('/chamados/tickets')}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-3 text-sm font-semibold text-fg transition-colors hover:border-amber-500 hover:text-amber-500"
          >
            <icons.ui.inbox size={16} />
            Ver todos os chamados
          </button>
        </>
      )}
    </div>
  )
}

