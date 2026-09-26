import { useMemo, useState } from 'react'
import type {
  CoordinatedUnit,
  CoordinatorRequest,
  CoordinatorRoleOption,
} from '../../../core/permissions/coordinatorService'
import { icons } from '../../../lib/icons'
import { initials } from '../coordinatorHelpers'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { SkeletonMetric, SkeletonRow } from '../components/Skeletons'

export interface CoordinatorApprovalsTabProps {
  units: CoordinatedUnit[]
  requestsByUnit: Record<string, CoordinatorRequest[]>
  requestsLoading: boolean
  requestsFailed: boolean
  onRetryRequests: () => void
  onApproveRequest: (request: CoordinatorRequest) => void
  onRejectRequest: (request: CoordinatorRequest) => void
  pending: string | null
  rolesById: Map<string, CoordinatorRoleOption>
}

/**
 * Data de exibição a partir do `created_at` da membership (ISO). Pura e
 * determinística: extrai o componente de calendário do ISO e o vira DD/MM/AAAA —
 * nunca aplica conversão de fuso nem `toLocaleDateString` (que deslocaria o dia
 * dependendo da máquina). Valor sem o formato YYYY-MM-DD → '—' (honesto).
 */
export function formatRequestDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return '—'
  return `${match[3]}/${match[2]}/${match[1]}`
}

/** Bloco de carregamento espelhando o layout final (KPIs + linhas). */
function ApprovalsLoading() {
  return (
    <div data-testid="approvals-loading" role="status" aria-live="polite">
      <div className="grid grid-cols-2 gap-2">
        <SkeletonMetric />
        <SkeletonMetric />
      </div>
      <div className="mt-4 space-y-2" aria-label="Carregando solicitações pendentes">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  )
}

/**
 * Aba "Aprovações" da Central do Coordenador (V1) — fila de solicitações de
 * acesso pendentes, READ-ONLY e 100% client-side.
 *
 * Apresentação pura sobre os dados que o shell (`CoordinatorHome`) já autorizou
 * e carregou por unidade (RPCs 065/066 fail-closed em `is_coordinator_of`):
 * `units` (escopo) + `requestsByUnit`. Nada é buscado aqui, não há segundo
 * loader e nenhum filtro artificial de segurança é inventado — o conjunto é o
 * mesmo que o servidor confirmou.
 *
 * Ações: Aprovar/Rejeitar reutilizam os callbacks do shell (`onApproveRequest` /
 * `onRejectRequest`); o rejeitar passa pelo `ConfirmActionSheet` já existente.
 * Feedback via `pending` (desabilita a fila e mostra spinner) e `actionError`
 * (banner global do shell) — nenhum sistema novo.
 *
 * Estados honestos: loading (skeletons), erro ("Tentar novamente" →
 * `onRetryRequests`), vazio (sem pedidos) e vazio pós-filtro.
 */
export function CoordinatorApprovalsTab({
  units,
  requestsByUnit,
  requestsLoading,
  requestsFailed,
  onRetryRequests,
  onApproveRequest,
  onRejectRequest,
  pending,
  rolesById,
}: CoordinatorApprovalsTabProps) {
  const [query, setQuery] = useState('')
  const [unitFilter, setUnitFilter] = useState<string>('all')

  /**
   * Linhas do escopo: projeta SOBRE `units` (fail-closed) — uma unidade que
   * apareça em `requestsByUnit` mas não esteja no escopo é simplesmente
   * ignorada. Nenhuma descoberta de unidade, nenhum dado novo.
   */
  const rows = useMemo(
    () =>
      units.flatMap((unit) =>
        (requestsByUnit[unit.unitId] ?? []).map((request) => ({
          request,
          unitId: unit.unitId,
          unitName: unit.unitName,
        })),
      ),
    [units, requestsByUnit],
  )

  const visibleRows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR')
    return rows.filter(({ request, unitId }) => {
      if (unitFilter !== 'all' && unitId !== unitFilter) return false
      if (q === '') return true
      const name = request.profile?.name ?? ''
      const email = request.profile?.email ?? ''
      return (
        name.toLocaleLowerCase('pt-BR').includes(q) ||
        email.toLocaleLowerCase('pt-BR').includes(q)
      )
    })
  }, [rows, query, unitFilter])

  /** Unidades do escopo com pedido(s) pendente(s) (KPIs só com dados reais). */
  const unitsWithPending = useMemo(
    () => units.filter((unit) => (requestsByUnit[unit.unitId] ?? []).length > 0),
    [units, requestsByUnit],
  )

  const groups = useMemo(() => {
    const byUnit = new Map<string, typeof rows>()
    for (const row of visibleRows) {
      const list = byUnit.get(row.unitId)
      if (list) list.push(row)
      else byUnit.set(row.unitId, [row])
    }
    return units
      .map((unit) => ({ unit, list: byUnit.get(unit.unitId) ?? [] }))
      .filter((group) => group.list.length > 0)
  }, [units, visibleRows])

  const hasRequests = rows.length > 0
  const filteredEmpty = hasRequests && visibleRows.length === 0

  return (
    <section data-testid="tab-approvals" className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">Aprovações</h2>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-fg-muted">
            Solicitações de acesso pendentes nas suas unidades. Aprovar ativa a membership; a
            rejeição remove o pedido. Só o que o servidor confirmou aparece aqui.
          </p>
        </div>
      </div>

      {requestsLoading ? (
        <div className="mt-4">
          <ApprovalsLoading />
        </div>
      ) : requestsFailed ? (
        <div className="mt-4">
          <ErrorState
            message="Não foi possível carregar as solicitações pendentes."
            onRetry={onRetryRequests}
          />
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div
              data-testid="approvals-summary-pending"
              className="rounded-xl border border-line bg-surface px-3.5 py-3"
            >
              <p className="text-[10px] text-fg-muted">Solicitações pendentes</p>
              <p className="mt-1 text-xl font-bold leading-none text-fg tabular-nums">
                {rows.length}
              </p>
            </div>
            <div
              data-testid="approvals-summary-units"
              className="rounded-xl border border-line bg-surface px-3.5 py-3"
            >
              <p className="text-[10px] text-fg-muted">Unidades com pendências</p>
              <p className="mt-1 text-xl font-bold leading-none text-fg tabular-nums">
                {unitsWithPending.length}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative flex min-w-0 flex-1 items-center">
              <icons.ui.search
                size={14}
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 shrink-0 text-fg-muted"
              />
              <input
                data-testid="approvals-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome ou e-mail"
                aria-label="Buscar por nome ou e-mail"
                className="w-full rounded-xl border border-line bg-surface py-2 pl-8 pr-3 text-xs text-fg placeholder:text-fg-dim focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
            </label>
            <select
              data-testid="approvals-unit-filter"
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              aria-label="Filtrar por unidade"
              className="w-full shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30 sm:w-44"
            >
              <option value="all">Todas as unidades</option>
              {units.map((unit) => (
                <option key={unit.unitId} value={unit.unitId}>
                  {unit.unitName}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            {filteredEmpty ? (
              <EmptyState
                icon={<icons.ui.search size={20} className="text-fg-muted" />}
                variant="soft"
                title="Nenhuma solicitação encontrada"
                description="Ajuste a busca ou o filtro de unidade."
              />
            ) : groups.length === 0 ? (
              <EmptyState
                icon={<icons.ui.checkCircle size={20} className="text-fg-muted" />}
                variant="soft"
                title="Nenhuma solicitação pendente"
                description="Quando alguém solicitar acesso a uma unidade do seu escopo, o pedido aparece aqui para aprovar ou rejeitar."
              />
            ) : (
              <div className="flex flex-col gap-4">
                {groups.map(({ unit, list }) => (
                  <div key={unit.unitId} data-testid={`approvals-unit-${unit.unitId}`}>
                    <div className="mb-2 flex items-center gap-2">
                      <icons.ui.home
                        size={13}
                        aria-hidden="true"
                        className="shrink-0 text-fg-muted"
                      />
                      <p className="truncate text-xs font-semibold uppercase tracking-wide text-fg-muted">
                        {unit.unitName}
                      </p>
                      <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                        {list.length} pendente{list.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {list.map(({ request }) => {
                        const name = request.profile?.name ?? 'Membro sem perfil'
                        const email = request.profile?.email || 'Sem e-mail registrado'
                        const approveKey = `approve-${request.membership.id}`
                        const rejectKey = `reject-${request.membership.id}`
                        const role = rolesById.get(request.membership.role_id)
                        return (
                          <li
                            key={request.membership.id}
                            data-testid={`approvals-request-${request.membership.id}`}
                            className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-xl border border-line bg-surface px-3 py-2.5"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                              {initials(name)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="truncate text-xs font-semibold text-fg">{name}</p>
                                {role && (
                                  <span className="shrink-0 rounded-full bg-input px-1.5 py-0.5 text-[10px] font-medium leading-none text-fg-muted">
                                    {role.name}
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-fg-muted">{email}</p>
                              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-fg-dim">
                                <icons.ui.calendar size={11} aria-hidden="true" className="shrink-0" />
                                Solicitado em {formatRequestDate(request.membership.created_at)}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                              Pendente
                            </span>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onApproveRequest(request)}
                                disabled={pending !== null}
                                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/25 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:text-emerald-400"
                              >
                                {pending === approveKey ? (
                                  <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                                ) : (
                                  <icons.ui.check size={11} />
                                )}
                                Aprovar
                              </button>
                              <button
                                type="button"
                                onClick={() => onRejectRequest(request)}
                                disabled={pending !== null}
                                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                              >
                                {pending === rejectKey ? (
                                  <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                                ) : (
                                  <icons.ui.close size={11} />
                                )}
                                Rejeitar
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
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