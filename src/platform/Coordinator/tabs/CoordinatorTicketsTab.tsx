import { useCallback, useMemo, useState } from 'react'
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
import { CoordinatorTicketDrawer } from '../components/CoordinatorTicketDrawer'
import {
  filterScopeTickets,
  scopedUnitFilter,
  sortScopeTickets,
  SCOPE_TICKETS_DEFAULT_FILTERS,
  SCOPE_UNIT_ALL,
  type ScopeSlaConfigs,
  type ScopeTicketsFilters,
} from '../coordinatorTickets'
import {
  useCoordinatorTickets,
  COORDINATOR_TICKETS_PAGE_SIZE,
} from '../hooks/useCoordinatorTickets'

export interface CoordinatorTicketsTabProps {
  units: CoordinatedUnit[]
  activeKpis: { abertos: number; emAtendimento: number; semResponsavel: number }
  recentTickets: Ticket[]
  /** Chamados do escopo do cache local (KPIs/recentes). */
  scopeTickets: Ticket[]
  /** Config de SLA por workspace. */
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
 * Aba "Chamados" da Central do Coordenador — versão consolidada.
 *
 * Mudanças em relação à versão anterior:
 * ──────────────────────────────────────────────────────────────────────────
 * 1. **Consulta independente do cache**: usa `useCoordinatorTickets` que busca
 *    diretamente do backend (`GET /api/chamados?workspace_id=...`). A lista não
 *    depende mais de `cachedTickets()` previamente populado pelo módulo `/chamados`.
 *
 * 2. **Histórico completo**: o hook não filtra por `archived`, então chamados
 *    resolvidos e fechados aparecem normalmente (a aba "Todos" inclui histórico).
 *
 * 3. **Paginação remota limitada pela janela**: `COORDINATOR_TICKETS_PAGE_SIZE`
 *    registros por página baixados do backend via `limit`/`offset opcionais` do
 *    `GET /api/chamados` — a Central não baixa o histórico inteiro de cada
 *    unidade, só a janela da página atual. Busca, SLA e filtros continuam
 *    CLIENT-SIDE sobre a janela carregada: filtros não cruzam páginas que ainda
 *    não foram baixadas (limitação documentada na aba).
 *
 * 4. **Modal de detalhe rápido**: clicar em um chamado abre `CoordinatorTicketDrawer`
 *    com informações essenciais e atribuição direta. Técnicos listados são apenas
 *    do workspace do chamado (filtrado via memberships).
 *
 * 5. **Atualização reativa**: após salvar atribuição, a lista local é atualizada
 *    sem exigir F5. Um reload completo é disparado para garantir consistência.
 *
 * O que NÃO muda:
 * - KPIs e recentes continuam vindo do shell (cache-based, mesma lógica).
 * - `openChamadosFor`/`openTicketFor` para operação completa.
 * - Regras de isolamento (fail-closed): `unitIds` do escopo são a fronteira.
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
  const [drawerTicket, setDrawerTicket] = useState<Ticket | null>(null)

  const unitIds = useMemo(() => units.map((u) => u.unitId), [units])

  // Busca direta ao backend — independente do cache local.
  const {
    tickets: remoteTickets,
    loading: remoteLoading,
    error: remoteError,
    page,
    total,
    setPage,
    reload,
  } = useCoordinatorTickets(unitIds, true)

  // Merge: preferimos dados remotos, fallback para cache local (scopeTickets)
  // enquanto o remote ainda carrega ou quando ele falhou/vem vazio. Isso
  // preserva a listagem baseada em cache nos ambientes onde a Central é montada
  // sem backend (ex.: integração) e evita tela vazia em erro de rede.
  const allTickets = remoteTickets.length > 0 ? remoteTickets : scopeTickets

  const effectiveUnit = useMemo(
    () => scopedUnitFilter(filters.unit, unitIds),
    [filters.unit, unitIds],
  )

  // Invariante de segurança (fail-closed): mesmo que remote traga algo fora do
  // escopo por bug, a listagem só considera chamados das unidades coordenadas.
  const inScopeTickets = useMemo(
    () => allTickets.filter((t) => t.workspace_id != null && unitIds.includes(t.workspace_id)),
    [allTickets, unitIds],
  )

  const filteredTickets = useMemo(
    () =>
      sortScopeTickets(
        filterScopeTickets(inScopeTickets, { ...filters, unit: effectiveUnit }, slaConfigs),
      ),
    [inScopeTickets, filters, effectiveUnit, slaConfigs],
  )

  // Paginação remota: o número de páginas vem do `total` informado pelo backend
  // (Content-Range). Sem total, cai para a janela atualmente carregada. A lista
  // visível é a fatia da página atual apenas — buscar/filtrar volta para pág. 1.
  const numPages = Math.max(
    1,
    Math.ceil((total > 0 ? total : inScopeTickets.length) / COORDINATOR_TICKETS_PAGE_SIZE),
  )
  const safePage = Math.min(page, Math.max(1, numPages))
  // A lista visível É a janela carregada (paginação remota): trocar de página
  // re-busca `limit`/`offset` do backend, então não há fatia client-side. Busca,
  // SLA e filtros continuam aplicados sobre essa janela.
  const visibleTickets = filteredTickets

  const hasActiveFilters =
    effectiveUnit !== SCOPE_UNIT_ALL ||
    filters.status !== 'all' ||
    filters.priority !== 'all' ||
    filters.sla !== 'all' ||
    filters.query.trim() !== ''

  const handleTicketAssigned = useCallback(
    (updated: Ticket) => {
      // Atualiza o drawer imediatamente (sem fechar).
      setDrawerTicket(updated)
      // Recarrega a lista para refletir a nova atribuição.
      reload()
    },
    [reload],
  )

  const handleOpenDrawer = useCallback((ticket: Ticket) => {
    setDrawerTicket(ticket)
  }, [])

  const handleCloseDrawer = useCallback(() => {
    setDrawerTicket(null)
  }, [])

  // Ação contextual para abrir o detalhe operacional completo (se o workspace
  // do chamado estiver disponível para navegação). Narrowing explícito: captura
  // o id num escopo onde TS garantidamente sabe que o ticket existe.
  const openOperationalFor = useMemo(() => {
    if (!drawerTicket?.workspace_id) return null
    const ticketId = drawerTicket.id
    const open = openTicketFor(drawerTicket.workspace_id)
    if (!open) return null
    return () => open(ticketId)
  }, [drawerTicket, openTicketFor])

  return (
    <section data-testid="tab-tickets" className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-sm font-semibold text-fg">Chamados no seu escopo</h2>
      <p className="mt-1.5 max-w-xl text-[11px] leading-relaxed text-fg-muted">
        Visão gerencial dos chamados das unidades coordenadas. Inclui histórico (resolvidos e
        fechados). Consulta direta ao servidor — independente do módulo de Chamados.
      </p>

      {/* KPIs */}
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

      {/* Chamados recentes (cache-based, carregamento rápido) */}
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
              const curUnitName = unitNameOf(ticket.workspace_id)
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
                      <span className="block truncate text-[10px] text-fg-muted">{curUnitName}</span>
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

      {/* Operação completa por unidade */}
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

      {/* Lista completa com filtros, paginação e acesso ao drawer */}
      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
            Todos os chamados do escopo (histórico incluso)
          </p>
          <div className="flex items-center gap-2">
            {remoteLoading && (
              <span className="flex items-center gap-1 text-[10px] text-fg-muted">
                <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                Carregando…
              </span>
            )}
            <span className="text-[10px] text-fg-muted" data-testid="tickets-list-count">
              {filteredTickets.length} de {inScopeTickets.length}
            </span>
            <button
              type="button"
              data-testid="tickets-reload-btn"
              onClick={reload}
              disabled={remoteLoading}
              title="Recarregar lista"
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[10px] text-fg-muted transition-colors hover:bg-input disabled:opacity-50"
            >
              <icons.ui.refresh size={11} className={cn(remoteLoading && 'animate-spin')} />
              Atualizar
            </button>
          </div>
        </div>

        {remoteError && (
          <div
            role="alert"
            className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400"
          >
            {remoteError}
          </div>
        )}

        {/* Filtros */}
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
              onChange={(e) => {
                setFilters((f) => ({ ...f, query: e.target.value }))
                setPage(1)
              }}
              placeholder="Buscar por número, local, categoria, solicitante ou responsável"
              aria-label="Buscar chamados"
              className="w-full rounded-xl border border-line bg-surface py-2 pl-8 pr-3 text-xs text-fg placeholder:text-fg-dim focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <select
              data-testid="tickets-filter-unit"
              value={effectiveUnit}
              onChange={(e) => {
                setFilters((f) => ({ ...f, unit: e.target.value }))
                setPage(1)
              }}
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
              onChange={(e) => {
                setFilters((f) => ({
                  ...f,
                  status: e.target.value as ScopeTicketsFilters['status'],
                }))
                setPage(1)
              }}
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
              onChange={(e) => {
                setFilters((f) => ({
                  ...f,
                  priority: e.target.value as ScopeTicketsFilters['priority'],
                }))
                setPage(1)
              }}
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
              onChange={(e) => {
                setFilters((f) => ({
                  ...f,
                  sla: e.target.value as ScopeTicketsFilters['sla'],
                }))
                setPage(1)
              }}
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

        {/* Lista */}
        {remoteLoading && inScopeTickets.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              variant="soft"
              title="Carregando chamados…"
              description="Consultando as unidades do seu escopo diretamente no servidor."
            />
          </div>
        ) : inScopeTickets.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              variant="soft"
              title="Nenhum chamado encontrado no escopo"
              description="Os chamados das unidades que você coordena aparecerão aqui."
            />
          </div>
        ) : filteredTickets.length === 0 ? (
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
          <>
            <ul className="mt-3 flex flex-col gap-1.5" data-testid="tickets-list">
              {visibleTickets.map((ticket) => {
                const statusLabel = TICKET_STATUS_LABELS[ticket.status] ?? ticket.status
                const priority = getPriority(ticket.priority)
                const curUnitName = unitNameOf(ticket.workspace_id)
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
                      data-testid={`tickets-list-${ticket.id}`}
                      onClick={() => handleOpenDrawer(ticket)}
                      className="flex w-full items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-surface px-3 py-2 text-left transition-colors hover:bg-input"
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
                          {curUnitName}
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

            {/* Paginação */}
            {numPages > 1 && (
              <nav
                aria-label="Paginação de chamados"
                className="mt-3 flex items-center justify-center gap-1"
                data-testid="tickets-pagination"
              >
                <button
                  type="button"
                  onClick={() => setPage(safePage - 1)}
                  disabled={safePage <= 1}
                  aria-label="Página anterior"
                  className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] text-fg-muted transition-colors hover:bg-input disabled:opacity-40"
                >
                  ‹
                </button>
                {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    aria-current={p === safePage ? 'page' : undefined}
                    data-testid={`tickets-page-${p}`}
                    className={cn(
                      'rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                      p === safePage
                        ? 'border-violet-500/60 bg-violet-500/15 text-violet-600 dark:text-violet-400'
                        : 'border-line bg-surface text-fg-muted hover:bg-input',
                    )}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage >= numPages}
                  aria-label="Próxima página"
                  className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] text-fg-muted transition-colors hover:bg-input disabled:opacity-40"
                >
                  ›
                </button>
              </nav>
            )}
          </>
        )}
      </div>

      {/* Drawer de detalhe rápido */}
      <CoordinatorTicketDrawer
        ticket={drawerTicket}
        unitName={drawerTicket ? unitNameOf(drawerTicket.workspace_id) : ''}
        slaConfigs={slaConfigs}
        openOperational={openOperationalFor}
        onClose={handleCloseDrawer}
        onAssigned={handleTicketAssigned}
      />
    </section>
  )
}
