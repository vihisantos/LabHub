import { useMemo, useState } from 'react'
import type {
  CoordinatorInactiveMember,
  CoordinatorRequest,
  CoordinatorRoleOption,
  CoordinatedUnit,
} from '../../../core/permissions/coordinatorService'
import type { MembershipStatus } from '../../../core/permissions/membership'
import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'
import {
  composePeopleRows,
  filterPeopleRows,
  initials,
  peopleStatusLabel,
  COORDINATOR_LEADER_LABEL,
} from '../coordinatorHelpers'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { SkeletonRow } from '../components/Skeletons'

/**
 * Aba "Pessoal" da Central — DIRETÓRIO READ-ONLY (PR 275).
 *
 * A aba passa a ser uma visão de LEITURA do pessoal vinculado às unidades do
 * escopo: faixa de resumo calculada, busca por nome/e-mail, filtro por status e
 * lista densa (avatar, nome, cargo, unidade e status real). NENHUMA ação de
 * gestão vive aqui (não aprova/rejeita/suspende/remove/altera cargo/vincula): a
 * gestão continua no escopo da Visão Geral, reutilizando os RPCs já existentes.
 *
 * Fonte de dados: 100% composta das leituras fail-closed que o shell já carrega
 * (`units`/`requestsByUnit`/`inactiveByUnit`) — as RPCs 047/065/066 decidem o
 * escopo no servidor; a UI apenas projeta. O filtro por unidade reutiliza o
 * `?unit=` da Central (o shell já passa `visibleUnits`), sem novo seletor.
 */

interface SummaryCellProps {
  icon: keyof typeof icons.ui
  label: string
  count: number
  accent?: boolean
}

function SummaryCell({ icon, label, count, accent = false }: SummaryCellProps) {
  const Icon = icons.ui[icon]
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          accent ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400' : 'bg-fg-muted/10 text-fg-muted',
        )}
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-bold leading-none tracking-tight text-fg tabular-nums">
          {count}
        </p>
        <p className="mt-1.5 truncate text-[11px] font-medium text-fg-muted">{label}</p>
      </div>
    </div>
  )
}

/** Tonalidade do selo de status — mapa fechado nos 4 status reais da membership. */
const STATUS_TONE: Record<MembershipStatus, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  suspended: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  removed: 'bg-red-500/10 text-red-500',
}

const STATUS_OPTIONS: ReadonlyArray<{ value: MembershipStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos os status' },
  { value: 'active', label: 'Ativos' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'suspended', label: 'Suspensos' },
  { value: 'removed', label: 'Removidos' },
]

export interface CoordinatorPeopleTabProps {
  units: CoordinatedUnit[]
  requestsByUnit: Record<string, CoordinatorRequest[]>
  requestsLoading: boolean
  requestsFailed: boolean
  onRetryRequests: () => void
  inactiveByUnit: Record<string, CoordinatorInactiveMember[]>
  inactiveLoading: boolean
  inactiveFailed: boolean
  onRetryInactive: () => void
  rolesById: Map<string, CoordinatorRoleOption>
}

export function CoordinatorPeopleTab({
  units,
  requestsByUnit,
  requestsLoading,
  requestsFailed,
  onRetryRequests,
  inactiveByUnit,
  inactiveLoading,
  inactiveFailed,
  onRetryInactive,
  rolesById,
}: CoordinatorPeopleTabProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<MembershipStatus | 'all'>('all')

  const loading = requestsLoading || inactiveLoading
  const failed = requestsFailed || inactiveFailed

  const rows = useMemo(
    () => composePeopleRows(units, requestsByUnit, inactiveByUnit, rolesById),
    [units, requestsByUnit, inactiveByUnit, rolesById],
  )
  const visible = useMemo(() => filterPeopleRows(rows, { query, status }), [rows, query, status])

  const summary = useMemo(
    () => ({
      total: rows.length,
      units: units.length,
      leaders: units.reduce((acc, u) => acc + u.leaders.length, 0),
      pending: rows.filter((r) => r.status === 'pending').length,
    }),
    [rows, units],
  )

  const onRetry = () => {
    if (requestsFailed) onRetryRequests()
    if (inactiveFailed) onRetryInactive()
  }

  return (
    <section data-testid="tab-people" className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-sm font-semibold text-fg">Pessoal</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
            Pessoas vinculadas às unidades sob sua coordenação.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div data-testid="people-summary-total">
          <SummaryCell icon="userCheck" label="Pessoas no escopo" count={summary.total} />
        </div>
        <div data-testid="people-summary-units">
          <SummaryCell icon="home" label="Unidades" count={summary.units} />
        </div>
        <div data-testid="people-summary-leaders">
          <SummaryCell icon="shield" label="Lideranças" count={summary.leaders} accent />
        </div>
        <div data-testid="people-summary-pending">
          <SummaryCell icon="clock" label="Pendentes" count={summary.pending} />
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
            data-testid="people-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar por nome ou e-mail"
            className="w-full rounded-xl border border-line bg-surface py-2 pl-8 pr-3 text-xs text-fg placeholder:text-fg-dim focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          />
        </label>
        <select
          data-testid="people-status-filter"
          value={status}
          onChange={(e) => setStatus(e.target.value as MembershipStatus | 'all')}
          aria-label="Filtrar por status"
          className="w-full shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30 sm:w-44"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        {loading ? (
          <div
            data-testid="people-loading"
            role="status"
            aria-live="polite"
            aria-label="Carregando pessoas do escopo"
            className="flex flex-col gap-2"
          >
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : failed ? (
          <ErrorState
            message="Não foi possível carregar as pessoas desta unidade. Os dados já autorizados estão preservados; tente novamente em instantes."
            onRetry={onRetry}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<icons.ui.user size={20} className="text-fg-muted" />}
            variant="soft"
            title="Nenhuma pessoa encontrada"
            description={
              query.trim() !== '' || status !== 'all'
                ? 'Nenhuma pessoa corresponde aos filtros aplicados. Ajuste a busca ou o status.'
                : 'Ainda não há pessoas vinculadas às unidades sob sua coordenação.'
            }
          />
        ) : (
          <ul className="flex flex-col gap-1.5" aria-label="Pessoas do escopo">
            {visible.map((row) => (
              <li
                key={row.membership.id}
                data-testid={`people-row-${row.membership.id}`}
                className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors hover:bg-input/40"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[11px] font-bold text-violet-600 dark:text-violet-400"
                >
                  {initials(row.profile?.name ?? '')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[13px] font-semibold text-fg">
                      {row.profile?.name ?? 'Perfil não disponível'}
                    </p>
                    <span className="shrink-0 rounded-full bg-input px-1.5 py-0.5 text-[10px] font-medium leading-none text-fg-muted">
                      {row.roleLabel}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-fg-muted">
                    {row.profile?.email || 'Sem e-mail registrado'}
                  </p>
                  <p
                    data-testid={`people-leader-${row.membership.id}`}
                    className="mt-1 flex items-center gap-1 truncate text-[11px] text-fg-muted"
                  >
                    <icons.ui.userCheck size={12} aria-hidden="true" className="shrink-0" />
                    <span className="truncate">
                      {row.leader === null
                        ? 'Sem líder definido'
                        : row.leader.isCoordination
                          ? COORDINATOR_LEADER_LABEL
                          : row.leader.name}
                    </span>
                  </p>
                </div>
                <div className="flex w-28 shrink-0 flex-col items-end gap-1 sm:w-36">
                  <span
                    className={cn(
                      'max-w-full truncate text-right text-[10px] font-medium text-fg-muted',
                      units.length > 1 && 'text-fg-dim',
                    )}
                  >
                    {row.unitName}
                  </span>
                  <span
                    data-testid={`people-status-${row.membership.id}`}
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      STATUS_TONE[row.status],
                    )}
                  >
                    {peopleStatusLabel(row.status)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}