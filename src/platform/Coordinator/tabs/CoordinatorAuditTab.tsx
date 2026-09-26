import { useCallback, useEffect, useMemo, useState } from 'react'
import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'
import type { CoordinatedUnit } from '../../../core/permissions/coordinatorService'
import { serverAuditService } from '../../../core/logs/serverAuditService'
import type { ServerAuditLog } from '../../../core/logs/serverAuditService'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { SkeletonMetric, SkeletonRow } from '../components/Skeletons'

/**
 * Limite aceito na V1: até 200 registros mais recentes por unidade
 * (`serverAuditService.getByWorkspace`). Não é "histórico completo" — a UI
 * documenta a limitação discretamente.
 */
export const AUDIT_UNIT_LIMIT = 200

/** Períodos de filtro local (client-side, sobre os dados já carregados). */
export type AuditPeriodDays = 7 | 30 | 90

const AUDIT_PERIODS: readonly { days: AuditPeriodDays; label: string }[] = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
]

const DAY_MS = 24 * 60 * 60 * 1000

export interface CoordinatorAuditTabProps {
  /**
   * Unidades VISÍVEIS do escopo (`visibleUnits` do shell, determinadas por
   * `?unit=`). A fonte de verdade da Auditoria — nunca workspaceService nem
   * uma segunda descoberta de unidades.
   */
  units: CoordinatedUnit[]
  /** Resolve o nome de uma unidade por id (mesma função já usada no shell). */
  unitNameOf: (workspaceId?: string) => string
}

interface AuditRow {
  log: ServerAuditLog
  unitId: string
  unitName: string
}

interface AuditGroup {
  unit: CoordinatedUnit
  rows: AuditRow[]
}

/** Registro dentro do período (início em `now - days`; eventos sem data → false). */
export function isWithinPeriod(iso: string, days: AuditPeriodDays, now: number): boolean {
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return false
  return ts >= now - days * DAY_MS
}

/** Data/hora em pt-BR LOCAL a partir do ISO — mesmo comportamento do `LogsPage.tsx` (Admin). Valor sem data válida → '—' (honesto). */
export function formatAuditTimestamp(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return '—'
  return date.toLocaleString('pt-BR')
}

/**
 * Rótulos/tons/ícones por ação — MESMA linguagem visual do Admin
 * (`LogsPage.tsx` / `AdminDashboard.tsx`): prefixo de ator + rótulo, mesma
 * paleta. Nada de paleta nova para a Auditoria.
 */
const AUDIT_ACTION_STYLE: Record<
  string,
  { icon: keyof typeof icons.ui; label: string; cls: string }
> = {
  created: { icon: 'plus', label: 'Criou', cls: 'bg-emerald-500/10 text-emerald-500' },
  updated: { icon: 'edit', label: 'Editou', cls: 'bg-blue-500/10 text-blue-500' },
  deleted: { icon: 'trash', label: 'Excluiu', cls: 'bg-red-500/10 text-red-500' },
  claim: { icon: 'userCheck', label: 'Assumiu', cls: 'bg-emerald-500/10 text-emerald-500' },
  commented: {
    icon: 'messageSquareWarning',
    label: 'Comentou em',
    cls: 'bg-blue-500/10 text-blue-500',
  },
  membership_added: { icon: 'userCheck', label: 'Adicionou', cls: 'bg-violet-500/10 text-violet-500' },
  membership_removed: { icon: 'close', label: 'Removeu', cls: 'bg-red-500/10 text-red-500' },
  membership_changed: {
    icon: 'sliders',
    label: 'Alterou acesso de',
    cls: 'bg-violet-500/10 text-violet-500',
  },
  role_changed: { icon: 'shield', label: 'Mudou cargo de', cls: 'bg-violet-500/10 text-violet-500' },
  status_changed: {
    icon: 'refresh',
    label: 'Atualizou status de',
    cls: 'bg-amber-500/10 text-amber-500',
  },
  super_admin_toggled: {
    icon: 'shield',
    label: 'Alterou super admin de',
    cls: 'bg-violet-500/10 text-violet-500',
  },
  app_access_changed: {
    icon: 'alertCircle',
    label: 'Alterou acesso de',
    cls: 'bg-amber-500/10 text-amber-500',
  },
  viewed: { icon: 'search', label: 'Visualizou', cls: 'bg-slate-500/10 text-slate-500' },
  exported: { icon: 'download', label: 'Exportou', cls: 'bg-violet-500/10 text-violet-500' },
}

const AUDIT_ACTION_DEFAULT_STYLE = {
  icon: 'dot',
  label: '',
  cls: 'bg-input text-fg-muted',
} as const

const AUDIT_ENTITY_LABELS: Record<string, string> = {
  ticket: 'Chamado',
  asset: 'Ativo',
  room: 'Sala',
  user: 'Usuário',
}

/** Bloco de carregamento espelhando o layout final (KPIs + linhas). */
function AuditLoading() {
  return (
    <div data-testid="audit-loading" role="status" aria-live="polite">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <SkeletonMetric />
        <SkeletonMetric />
        <SkeletonMetric />
      </div>
      <div className="mt-4 space-y-2" aria-label="Carregando registros de auditoria">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  )
}

/** Um evento de auditoria, no padrão visual do `LogsPage.tsx`. */
function AuditEventItem({ log, unitName }: { log: ServerAuditLog; unitName: string }) {
  const [expanded, setExpanded] = useState(false)
  const style = AUDIT_ACTION_STYLE[log.action] ?? AUDIT_ACTION_DEFAULT_STYLE
  const Icon = icons.ui[style.icon]
  const hasMeta = log.meta != null && Object.keys(log.meta).length > 0
  const entityLabel = AUDIT_ENTITY_LABELS[log.entity] ?? log.entity

  return (
    <div
      data-testid={`audit-event-${log.id}`}
      className="flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-input"
    >
      <span
        className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', style.cls)}
      >
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-relaxed text-fg">
          <span className="font-semibold">{log.actor_name || 'Sistema'}</span>
          <span className="text-fg-muted"> {style.label || log.action}</span>
          <span className="font-medium"> {entityLabel}</span>
          {log.entity_label && <span className="text-fg-muted"> {log.entity_label}</span>}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <span className="text-[10px] text-fg-dim">
            {unitName} · {formatAuditTimestamp(log.timestamp)}
          </span>
        </div>
        {hasMeta && (
          <div className="mt-1.5">
            <button
              type="button"
              data-testid={`audit-meta-toggle-${log.id}`}
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-fg-muted transition-colors hover:bg-input hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
            >
              <icons.ui.chevronDown
                size={11}
                className={cn('transition-transform', expanded && 'rotate-180')}
              />
              {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
            </button>
            {expanded && (
              <div className="mt-1.5 rounded-lg bg-input p-2">
                <pre
                  data-testid={`audit-meta-${log.id}`}
                  className="max-h-40 overflow-auto text-[10px] leading-relaxed text-fg-dim"
                >
                  {JSON.stringify(log.meta, null, 2)}
                </pre>
                <p className="mt-1 text-[9px] text-fg-dim">
                  Contém dados técnicos do registro.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Aba "Auditoria" da Central do Coordenador (V1) — registro de eventos de
 * `public.app_audit_logs` SOMENTE LEITURA, por unidade do escopo.
 *
 * Fonte: `serverAuditService.getByWorkspace(unitId, 200)` para cada unidade
 * VISÍVEL (`visibleUnits` do shell) — no máximo 1 request por unidade, em
 * paralelo. A segurança real é a RLS `app_audit_logs_select` (super admin OU
 * membro ativo do workspace): o frontend apenas projeta as unidades recebidas
 * (fail-closed) e nunca descobre unidades via workspaceService.
 *
 * Filtros são 100% client-side sobre os dados já carregados:
 * período (7/30/90, padrão 30), busca (ator/ação/entidade/label/id — nunca
 * dentro do JSONB), filtro de ação (DERIVADO das ações realmente presentes nos
 * registros carregados) e unidade. Sem paginação na V1.
 *
 * Estados honestos: loading (skeletons), erro com retry real, vazio e vazio
 * pós-filtro (diferenciados). Unidade no escopo com 0 eventos → "0 eventos no
 * período exibido" (sem erro falso por RLS).
 */
export function CoordinatorAuditTab({ units, unitNameOf }: CoordinatorAuditTabProps) {
  const [periodKey, setPeriodKey] = useState<AuditPeriodDays>(30)
  const [query, setQuery] = useState('')
  const [unitFilter, setUnitFilter] = useState<string>('all')
  const [actionFilter, setActionFilter] = useState<string>('all')

  const [logsByUnit, setLogsByUnit] = useState<Record<string, ServerAuditLog[]>>({})
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  /** Chave das unidades VISÍVEIS — reload só quando o escopo visível muda. */
  const unitsKey = useMemo(() => units.map((u) => u.unitId).join('|'), [units])

  const load = useCallback(async () => {
    const currentUnits = unitsKey === '' ? [] : unitsKey.split('|')
    if (currentUnits.length === 0) {
      setLogsByUnit({})
      setFailed(false)
      setLoading(false)
      return
    }
    setLoading(true)
    setFailed(false)
    const results = await Promise.all(
      currentUnits.map(
        async (unitId): Promise<{ unitId: string; rows: ServerAuditLog[]; errored?: boolean }> => {
          try {
            const rows = await serverAuditService.getByWorkspace(unitId, AUDIT_UNIT_LIMIT)
            return { unitId, rows }
          } catch {
            return { unitId, rows: [], errored: true }
          }
        },
      ),
    )
    const next: Record<string, ServerAuditLog[]> = {}
    let anyFailed = false
    for (const result of results) {
      next[result.unitId] = result.rows
      if (result.errored) anyFailed = true
    }
    setLogsByUnit(next)
    setFailed(anyFailed)
    setLoading(false)
  }, [unitsKey])

  useEffect(() => {
    void load()
  }, [load])

  const visibleUnitIds = useMemo(() => new Set(units.map((u) => u.unitId)), [units])

  /** Projeção fail-closed: só eventos das unidades VISÍVEIS recebidas. */
  const loadedRows = useMemo(() => {
    const rows: AuditRow[] = []
    for (const unit of units) {
      for (const log of logsByUnit[unit.unitId] ?? []) {
        if (!log.workspace_id || !visibleUnitIds.has(log.workspace_id)) continue
        rows.push({
          log,
          unitId: log.workspace_id,
          unitName: unitNameOf(log.workspace_id),
        })
      }
    }
    return rows
  }, [units, logsByUnit, visibleUnitIds, unitNameOf])

  const periodRows = useMemo(() => {
    const now = Date.now()
    return loadedRows.filter((row) => isWithinPeriod(row.log.timestamp, periodKey, now))
  }, [loadedRows, periodKey])

  /** Ações realmente presentes nos registros carregados (não lista fixa). */
  const actionOptions = useMemo(() => {
    const set = new Set<string>()
    for (const row of loadedRows) set.add(row.log.action || 'unknown')
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [loadedRows])

  /** Seleção órfã (a ação sumiu após reload/mudança de escopo) volta a "all". */
  useEffect(() => {
    if (actionFilter !== 'all' && !actionOptions.includes(actionFilter)) setActionFilter('all')
  }, [actionOptions, actionFilter])

  const visibleRows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR')
    return periodRows.filter(({ log, unitId }) => {
      if (unitFilter !== 'all' && unitId !== unitFilter) return false
      if (actionFilter !== 'all' && log.action !== actionFilter) return false
      if (q !== '') {
        const haystack = [log.actor_name, log.action, log.entity, log.entity_label, log.entity_id]
          .join(' ')
          .toLocaleLowerCase('pt-BR')
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [periodRows, unitFilter, actionFilter, query])

  const sortedUnits = useMemo(
    () => [...units].sort((a, b) => a.unitName.localeCompare(b.unitName, 'pt-BR')),
    [units],
  )

  const groups = useMemo(() => {
    const byUnit = new Map<string, AuditRow[]>()
    for (const row of visibleRows) {
      const list = byUnit.get(row.unitId)
      if (list) list.push(row)
      else byUnit.set(row.unitId, [row])
    }
    for (const list of byUnit.values()) {
      list.sort(
        (a, b) => new Date(b.log.timestamp).getTime() - new Date(a.log.timestamp).getTime(),
      )
    }
    return sortedUnits.map((unit): AuditGroup => ({ unit, rows: byUnit.get(unit.unitId) ?? [] }))
  }, [sortedUnits, visibleRows])

  const kpi = useMemo(() => {
    const unitsWithEvents = new Set<string>()
    const actions = new Set<string>()
    for (const row of periodRows) {
      unitsWithEvents.add(row.unitId)
      actions.add(row.log.action || 'unknown')
    }
    return { events: periodRows.length, units: unitsWithEvents.size, actions: actions.size }
  }, [periodRows])

  const hasRows = loadedRows.length > 0
  const filteredEmpty = hasRows && visibleRows.length === 0
  const anyGroupHasData = groups.some((group) => group.rows.length > 0)

  return (
    <section data-testid="tab-audit" className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
            <icons.ui.shield size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-fg">Auditoria</h2>
            <p className="text-[10px] text-fg-muted">
              Registros auditados do escopo do coordenador
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="shrink-0 rounded-lg bg-input px-2.5 py-1 text-[10px] font-medium text-fg-muted"
            title={`Exibindo até ${AUDIT_UNIT_LIMIT} registros por unidade (sem paginação na V1).`}
          >
            Até {AUDIT_UNIT_LIMIT}/unidade
          </span>
          <span
            className="shrink-0 rounded-lg bg-input px-2.5 py-1 text-[10px] font-medium text-fg-muted"
            title="Registro append-only no servidor, imutável por design (LGPD)."
          >
            Imutável
          </span>
        </div>
      </div>

      {loading ? (
        <div className="mt-4">
          <AuditLoading />
        </div>
      ) : failed ? (
        <div className="mt-4">
          <ErrorState
            message="Não foi possível carregar os registros de auditoria."
            onRetry={() => void load()}
          />
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div
              data-testid="audit-summary-events"
              className="rounded-xl border border-line bg-surface px-3.5 py-3"
            >
              <p className="text-[10px] text-fg-muted">Eventos</p>
              <p className="mt-1 text-xl font-bold leading-none text-fg tabular-nums">
                {kpi.events}
              </p>
            </div>
            <div
              data-testid="audit-summary-units"
              className="rounded-xl border border-line bg-surface px-3.5 py-3"
            >
              <p className="text-[10px] text-fg-muted">Unidades com eventos</p>
              <p className="mt-1 text-xl font-bold leading-none text-fg tabular-nums">
                {kpi.units}
              </p>
            </div>
            <div
              data-testid="audit-summary-actions"
              className="rounded-xl border border-line bg-surface px-3.5 py-3"
            >
              <p className="text-[10px] text-fg-muted">Principais ações</p>
              <p className="mt-1 text-xl font-bold leading-none text-fg tabular-nums">
                {kpi.actions}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div
              role="group"
              aria-label="Período"
              className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-surface p-0.5"
            >
              {AUDIT_PERIODS.map((period) => (
                <button
                  key={period.days}
                  type="button"
                  data-testid={`audit-period-${period.days}`}
                  aria-pressed={periodKey === period.days}
                  onClick={() => setPeriodKey(period.days)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                    periodKey === period.days
                      ? 'bg-fg text-bg'
                      : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {period.label}
                </button>
              ))}
            </div>

            <select
              data-testid="audit-unit-filter"
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              aria-label="Filtrar por unidade"
              className="w-full shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30 sm:w-40"
            >
              <option value="all">Todas as unidades</option>
              {sortedUnits.map((unit) => (
                <option key={unit.unitId} value={unit.unitId}>
                  {unit.unitName}
                </option>
              ))}
            </select>

            <select
              data-testid="audit-action-filter"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              aria-label="Filtrar por ação"
              className="w-full shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30 sm:w-40"
            >
              <option value="all">Todas as ações</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>

            <label className="relative flex min-w-0 flex-1 items-center">
              <icons.ui.search
                size={14}
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 shrink-0 text-fg-muted"
              />
              <input
                data-testid="audit-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por usuário, ação ou registro..."
                aria-label="Buscar por usuário, ação ou registro"
                className="w-full rounded-xl border border-line bg-surface py-2 pl-8 pr-3 text-xs text-fg placeholder:text-fg-dim focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
            </label>
          </div>

          <div className="mt-4">
            {filteredEmpty ? (
              <EmptyState
                icon={<icons.ui.search size={20} className="text-fg-muted" />}
                variant="soft"
                title="Nenhum registro corresponde aos filtros atuais."
                description="Ajuste o período, a unidade, a ação ou a busca."
              />
            ) : !anyGroupHasData ? (
              <EmptyState
                icon={<icons.ui.shield size={20} className="text-fg-muted" />}
                variant="soft"
                title="Nenhum registro de auditoria encontrado no escopo selecionado."
                description="Eventos de aprovação, cargos, status e acessos das unidades do seu escopo aparecem aqui quando existirem."
              />
            ) : (
              <div className="flex flex-col gap-4">
                {groups.map(({ unit, rows }) => (
                  <div key={unit.unitId} data-testid={`audit-unit-${unit.unitId}`}>
                    <div className="mb-2 flex items-center gap-2">
                      <icons.ui.home
                        size={13}
                        aria-hidden="true"
                        className="shrink-0 text-fg-muted"
                      />
                      <p className="truncate text-xs font-semibold uppercase tracking-wide text-fg-muted">
                        {unit.unitName}
                      </p>
                      <span className="shrink-0 rounded-full bg-input px-2 py-0.5 text-[10px] font-semibold text-fg-muted">
                        {rows.length} evento{rows.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {rows.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-[10px] text-fg-dim">
                        0 eventos no período exibido
                      </p>
                    ) : (
                      <ul className="flex flex-col rounded-xl border border-line bg-surface p-1">
                        {rows.map((row) => (
                          <li key={row.log.id}>
                            <AuditEventItem log={row.log} unitName={row.unitName} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}