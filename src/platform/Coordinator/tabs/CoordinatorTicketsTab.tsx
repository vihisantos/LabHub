import { useMemo, useState } from 'react'
import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_STATUS_LABELS,
  type Ticket,
  type TicketStatus,
} from '../../../apps/chamados/types'
import { getPriority, getSlaInfo, type SlaState } from '../../../apps/chamados/services/sla'
import type { CoordinatedUnit } from '../../../core/permissions/coordinatorService'
import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'
import { EmptyState } from '../components/EmptyState'
import {
  filterScopeTickets,
  scopedUnitFilter,
  sortScopeTickets,
  SCOPE_TICKETS_DEFAULT_FILTERS,
  SCOPE_UNIT_ALL,
  type ScopeSlaConfigs,
  type ScopeTicketsFilters,
} from '../coordinatorTickets'

export interface CoordinatorTicketsTabProps {
  units: CoordinatedUnit[]
  activeKpis: { abertos: number; emAtendimento: number; semResponsavel: number }
  recentTickets: Ticket[]
  /** Chamados do escopo (já autorizados pelo shell a partir do cache bruto). */
  scopeTickets: Ticket[]
  /** Config de SLA por workspace (`slaConfigService.getHoursForTickets`). */
  slaConfigs: ScopeSlaConfigs
  unitNameOf: (workspaceId?: string) => string
  openChamadosFor: (unitId: string) => ((query?: string) => void) | null
  openTicketFor: (unitId: string) => ((ticketId: string) => void) | null
}

const FILTER_CHIPS: ReadonlyArray<{ label: string; query: string }> = [
  { label: 'Fila de abertos', query: '?status=aberto' },
  { label: 'Sem responsável', query: '?unassigned=1' },
  { label: 'SLA: próximos', query: '?sla=near' },
  { label: 'SLA: vencidos', query: '?sla=overdue' },
]

const STATUS_OPTIONS: ReadonlyArray<{ value: ScopeTicketsFilters['status']; label: string }> = [
  { value: 'all', label: 'Qualquer status' },
  ...(Object.keys(TICKET_STATUS_LABELS) as TicketStatus[]).map((value) => ({
    value,
    label: TICKET_STATUS_LABELS[value],
  })),
]

const PRIORITY_OPTIONS: ReadonlyArray<{ value: ScopeTicketsFilters['priority']; label: string }> = [
  { value: 'all', label: 'Qualquer prioridade' },
  ...TICKET_PRIORITIES.map((value) => ({ value, label: TICKET_PRIORITY_LABELS[value] })),
]

const SLA_OPTIONS: ReadonlyArray<{ value: ScopeTicketsFilters['sla']; label: string }> = [
  { value: 'all', label: 'Qualquer SLA' },
  { value: 'ok', label: 'No prazo' },
  { value: 'near', label: 'Próximos do vencimento' },
  { value: 'overdue', label: 'Vencidos' },
]

const SLA_STATE_COLORS: Record<SlaState, string> = {
  ok: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  near: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  overdue: 'bg-red-500/15 text-red-600 dark:text-red-400',
}

/**
 * Aba "Chamados" da Central (PR C). Camada de coordenação sobre o APP de
 * chamados existente: resume os KPIs e recentes do escopo (já calculados pelo
 * shell a partir do cache bruto autorizado — #250) e encaminha a operação
 * completa com os FILTROS já existentes do TicketList. Reaproveita
 * `openChamadosFor`/`openTicketFor` do shell — nenhum ciclo de dados novo
 * (sem useTickets/poll/realtime nesta aba) e nenhum painel da Visão Geral é
 * reimplementado aqui.
 *
 * feat (listagem por escopo): adiciona a lista completa de chamados do escopo
 * com filtros locais (unidade restrita ao escopo, status, prioridade, SLA e
 * busca) sobre `scopeTickets` — computação síncrona reutilizando services/sla.ts;
 * nada de novo no backend, store ou ciclo de dados.
 */
export function CoordinatorTicketsTab({
  units,
  activeKpis,
  recentTickets,
  scopeTickets,
  slaConfigs,
  unitNameOf,
  openChamadosFor,
  openTicketFor,
}: CoordinatorTicketsTabProps) {
  const [filters, setFilters] = useState<ScopeTicketsFilters>(SCOPE_TICKETS_DEFAULT_FILTERS)

  const unitIds = useMemo(() => units.map((u) => u.unitId), [units])
  const effectiveUnit = useMemo(
    () => scopedUnitFilter(filters.unit, unitIds),
    [filters.unit, unitIds],
  )
  // Invariante de segurança reforçado aqui (fail-closed): mesmo que o prop traga
  // algo de fora, a listagem só considera chamados das unidades do escopo.
  const inScopeTickets = useMemo(
    () => scopeTickets.filter((t) => t.workspace_id != null && unitIds.includes(t.workspace_id)),
    [scopeTickets, unitIds],
  )
  const visibleTickets = useMemo(
    () =>
      sortScopeTickets(
        filterScopeTickets(inScopeTickets, { ...filters, unit: effectiveUnit }, slaConfigs),
      ),
    [inScopeTickets, filters, effectiveUnit, slaConfigs],
  )
  const hasActiveFilters =
    effectiveUnit !== SCOPE_UNIT_ALL ||
    filters.status !== 'all' ||
    filters.priority !== 'all' ||
    filters.sla !== 'all' ||
    filters.query.trim() !== ''

  return (
    <section data-testid="tab-tickets" className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-sm font-semibold text-fg">Chamados no seu escopo</h2>
      <p className="mt-1.5 max-w-xl text-[11px] leading-relaxed text-fg-muted">
        Visão de coordenação sobre os chamados das unidades que você coordena. Os números vêm de
        uma leitura passiva dos dados já carregados; a operação completa continua no app de
        Chamados com os filtros existentes.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="tickets-kpis">
        <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
          <p className="text-[10px] text-fg-muted">Abertos</p>
          <p className="text-lg font-bold text-fg" data-testid="tickets-kpi-abertos">
            {activeKpis.abertos}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
          <p className="text-[10px] text-fg-muted">Em atendimento</p>
          <p className="text-lg font-bold text-fg" data-testid="tickets-kpi-atendimento">
            {activeKpis.emAtendimento}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
          <p className="text-[10px] text-fg-muted">Sem responsável</p>
          <p className="text-lg font-bold text-fg" data-testid="tickets-kpi-sem-responsavel">
            {activeKpis.semResponsavel}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
          Chamados recentes no escopo
        </p>
        {recentTickets.length === 0 ? (
          <EmptyState
            variant="soft"
            title="Nenhum chamado ativo encontrado nas unidades do seu escopo."
          />
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5" data-testid="tickets-recent">
            {recentTickets.map((ticket) => {
              const statusLabel = TICKET_STATUS_LABELS[ticket.status] ?? ticket.status
              const unitName = unitNameOf(ticket.workspace_id)
              const open = ticket.workspace_id ? openTicketFor(ticket.workspace_id) : null
              return (
                <li key={ticket.id}>
                  <button
                    type="button"
                    disabled={!open}
                    data-testid={`tickets-recent-${ticket.id}`}
                    onClick={() => open?.(ticket.id)}
                    className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-surface px-3 py-2 text-left transition-colors hover:bg-input disabled:cursor-default disabled:opacity-60"
                  >
                    <span className="min-w-[9rem] flex-1 sm:min-w-0">
                      <span className="block truncate text-[11px] font-semibold text-fg">
                        #{ticket.ticketNumber} — {ticket.assetName || ticket.roomName}
                      </span>
                      <span className="block truncate text-[10px] text-fg-muted">{unitName}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-input px-2.5 py-0.5 text-[10px] font-semibold text-fg-dim">
                      {statusLabel}
                    </span>
                    <icons.ui.chevronRight size={13} className="shrink-0 text-fg-muted" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
          Operação completa por unidade
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {units.map((unit) => {
            const open = openChamadosFor(unit.unitId)
            return (
              <div
                key={unit.unitId}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2"
              >
                <span className="min-w-[8rem] flex-1 truncate text-[11px] font-semibold text-fg sm:min-w-0">
                  {unit.unitName}
                </span>
                <button
                  type="button"
                  data-testid={`tickets-open-${unit.unitId}`}
                  disabled={!open}
                  onClick={() => open?.()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-violet-500/15 px-2.5 py-1 text-[10px] font-semibold text-violet-600 transition-colors hover:bg-violet-500/25 disabled:cursor-default disabled:opacity-50 dark:text-violet-400"
                >
                  <icons.ui.inbox size={12} />
                  Abrir Chamados
                </button>
                {FILTER_CHIPS.map((chip) => (
                  <button
                    key={chip.query}
                    type="button"
                    data-testid={`tickets-open-${unit.unitId}${chip.query}`}
                    disabled={!open}
                    onClick={() => open?.(chip.query)}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1 text-[10px] font-semibold text-fg-muted transition-colors',
                      'hover:border-violet-500/40 hover:text-fg disabled:cursor-default disabled:opacity-50',
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
            Todos os chamados do escopo
          </p>
          <span className="text-[10px] text-fg-muted" data-testid="tickets-list-count">
            {visibleTickets.length} de {inScopeTickets.length}
          </span>
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <label className="relative flex min-w-0 flex-1 items-center">
            <icons.ui.search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 shrink-0 text-fg-muted"
            />
            <input
              data-testid="tickets-filter-search"
              type="search"
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder="Buscar por número, local, categoria, solicitante ou responsável"
              aria-label="Buscar chamados"
              className="w-full rounded-xl border border-line bg-surface py-2 pl-8 pr-3 text-xs text-fg placeholder:text-fg-dim focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <select
              data-testid="tickets-filter-unit"
              value={effectiveUnit}
              onChange={(e) => setFilters((f) => ({ ...f, unit: e.target.value }))}
              aria-label="Filtrar por unidade"
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            >
              <option value={SCOPE_UNIT_ALL}>Todas as unidades</option>
              {units.map((unit) => (
                <option key={unit.unitId} value={unit.unitId}>
                  {unit.unitName}
                </option>
              ))}
            </select>
            <select
              data-testid="tickets-filter-status"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as ScopeTicketsFilters['status'] }))}
              aria-label="Filtrar por status"
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              data-testid="tickets-filter-priority"
              value={filters.priority}
              onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value as ScopeTicketsFilters['priority'] }))}
              aria-label="Filtrar por prioridade"
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              data-testid="tickets-filter-sla"
              value={filters.sla}
              onChange={(e) => setFilters((f) => ({ ...f, sla: e.target.value as ScopeTicketsFilters['sla'] }))}
              aria-label="Filtrar por SLA"
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            >
              {SLA_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {inScopeTickets.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              variant="soft"
              title="Nenhum chamado encontrado no escopo"
              description="Os chamados das unidades que você coordena aparecerão aqui conforme forem carregados pelo app de Chamados."
            />
          </div>
        ) : visibleTickets.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={<icons.ui.search size={20} className="text-fg-muted" />}
              variant="soft"
              title="Nenhum chamado corresponde aos filtros"
              description={
                hasActiveFilters
                  ? 'Ajuste a busca, a unidade, o status, a prioridade ou o SLA para ampliar os resultados.'
                  : 'Nenhum chamado corresponde aos critérios informados.'
              }
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5" data-testid="tickets-list">
            {visibleTickets.map((ticket) => {
              const statusLabel = TICKET_STATUS_LABELS[ticket.status] ?? ticket.status
              const priority = getPriority(ticket.priority)
              const unitName = unitNameOf(ticket.workspace_id)
              const open = ticket.workspace_id ? openTicketFor(ticket.workspace_id) : null
              const slaInfo = getSlaInfo(
                ticket.createdAt,
                ticket.priority,
                ticket.status,
                slaConfigs[ticket.workspace_id ?? ''],
              )
              return (
                <li key={ticket.id}>
                  <button
                    type="button"
                    disabled={!open}
                    data-testid={`tickets-list-${ticket.id}`}
                    onClick={() => open?.(ticket.id)}
                    className="flex w-full items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-surface px-3 py-2 text-left transition-colors hover:bg-input disabled:cursor-default disabled:opacity-60"
                  >
                    <span className="min-w-[10rem] flex-1 sm:min-w-0">
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="truncate text-[11px] font-semibold text-fg">
                          #{ticket.ticketNumber} — {ticket.assetName || ticket.roomName}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            TICKET_STATUS_COLORS[ticket.status],
                          )}
                        >
                          {statusLabel}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-fg-muted">
                        {unitName}
                        {ticket.assignedTo
                          ? ` · Responsável: ${ticket.assignedTo}`
                          : ' · Sem responsável'}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            TICKET_PRIORITY_COLORS[priority],
                          )}
                        >
                          {TICKET_PRIORITY_LABELS[priority]}
                        </span>
                        {slaInfo && (
                          <span
                            data-testid={`tickets-list-sla-${ticket.id}`}
                            className={cn(
                              'max-w-[9rem] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              SLA_STATE_COLORS[slaInfo.state],
                            )}
                          >
                            {slaInfo.label}
                          </span>
                        )}
                      </span>
                    </span>
                    <icons.ui.chevronRight size={13} className="shrink-0 text-fg-muted" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
