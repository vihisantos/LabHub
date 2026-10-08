import { useMemo, useState } from 'react'
import type {
  CoordinatorInactiveMember,
  CoordinatorMember,
  CoordinatorRequest,
  CoordinatorRoleOption,
  CoordinatedUnit,
} from '../../../core/permissions/coordinatorService'
import type { MembershipStatus } from '../../../core/permissions/membership'
import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'
import {
  aggregatePeopleRows,
  composePeopleRows,
  filterAggregatedPeople,
  GROUP_UNASSIGNED_LABEL,
} from '../coordinatorHelpers'
import type { PeopleResponsibleFilter, PeopleUnitFilter } from '../coordinatorHelpers'
import { PersonProfileCard } from '../components/PersonProfileCard'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { SkeletonRow } from '../components/Skeletons'

/**
 * Aba "Pessoal" da Central — DIRETÓRIO READ-ONLY consolidado por pessoa (#363).
 *
 * Visão de LEITURA das pessoas do escopo: 1 PERFIL → 1 CARD → N unidades
 * autorizadas. Todas as fontes já vêm fail-closed do shell (`units`/`requestsByUnit`/
 * `inactiveByUnit`/`membersByUnit`), e a consolidação por
 * `membership.profile_id` (id estável — nunca nome) acontece no helper puro
 * `aggregatePeopleRows`, SEM RPC/RLS nova e SEM mudança de autorização.
 *
 * As pessoas viram CARDS DE PERFIL (`PersonProfileCard`): banner/foto reais
 * (`profiles.banner`/`profiles.avatar`, 089) com fallbacks locais, avatar ACIMA
 * do banner (layering), unidades em chips compactos (colapso `+N`) e status/
 * cargo/responsável por vínculo quando divergem — nenhuma prioridade inventada.
 *
 * Filtros: busca por nome/e-mail + status + "Responsável" (Todos/Coordenação/
 * Líderes/Sem responsável) + "Unidade" (Todas ou uma do escopo — a unidade
 * escolhida é a ÚNICA exibida no card). NUNCA decide autorização.
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

const STATUS_OPTIONS: ReadonlyArray<{ value: MembershipStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos os status' },
  { value: 'active', label: 'Ativos' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'suspended', label: 'Suspensos' },
  { value: 'removed', label: 'Removidos' },
]

const RESPONSIBLE_OPTIONS: ReadonlyArray<{ value: PeopleResponsibleFilter; label: string }> = [
  { value: 'all', label: 'Todos os responsáveis' },
  { value: 'coordination', label: 'Coordenação' },
  { value: 'leaders', label: 'Líderes' },
  { value: 'unassigned', label: GROUP_UNASSIGNED_LABEL },
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
  membersByUnit: Record<string, CoordinatorMember[]>
  membersLoading: boolean
  membersFailed: boolean
  onRetryMembers: () => void
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
  membersByUnit,
  membersLoading,
  membersFailed,
  onRetryMembers,
  rolesById,
}: CoordinatorPeopleTabProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<MembershipStatus | 'all'>('all')
  const [responsible, setResponsible] = useState<PeopleResponsibleFilter>('all')
  const [unit, setUnit] = useState<PeopleUnitFilter>('all')

  const loading = requestsLoading || inactiveLoading || membersLoading
  const failed = requestsFailed || inactiveFailed || membersFailed

  const rows = useMemo(
    () => composePeopleRows(units, requestsByUnit, inactiveByUnit, rolesById, membersByUnit),
    [units, requestsByUnit, inactiveByUnit, rolesById, membersByUnit],
  )
  // 1 PERFIL → 1 CARD → N unidades (chave: membership.profile_id).
  const people = useMemo(() => aggregatePeopleRows(rows), [rows])
  const visiblePeople = useMemo(
    () => filterAggregatedPeople(people, { query, status, responsible, unit }),
    [people, query, status, responsible, unit],
  )

  const summary = useMemo(
    () => ({
      total: people.length,
      units: units.length,
      leaders: units.reduce((acc, u) => acc + u.leaders.length, 0),
      pending: people.filter((p) => p.units.some((u) => u.status === 'pending')).length,
    }),
    [people, units],
  )

  const onRetry = () => {
    if (requestsFailed) onRetryRequests()
    if (inactiveFailed) onRetryInactive()
    if (membersFailed) onRetryMembers()
  }

  return (
    <section data-testid="tab-people" className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-sm font-semibold text-fg">Pessoal</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
            Estrutura organizacional das unidades sob sua coordenação.
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
          data-testid="people-responsible-filter"
          value={responsible}
          onChange={(e) => setResponsible(e.target.value as PeopleResponsibleFilter)}
          aria-label="Filtrar por responsável"
          className="w-full shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30 sm:w-44"
        >
          {RESPONSIBLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          data-testid="people-unit-filter"
          value={unit}
          onChange={(e) => setUnit(e.target.value as PeopleUnitFilter)}
          aria-label="Filtrar por unidade"
          className="w-full shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30 sm:w-44"
        >
          <option value="all">Todas as unidades</option>
          {units.map((u) => (
            <option key={u.unitId} value={u.unitId}>
              {u.unitName}
            </option>
          ))}
        </select>
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
        ) : visiblePeople.length === 0 ? (
          <EmptyState
            icon={<icons.ui.user size={20} className="text-fg-muted" />}
            variant="soft"
            title="Nenhuma pessoa encontrada"
            description={
              query.trim() !== '' || status !== 'all' || responsible !== 'all' || unit !== 'all'
                ? 'Nenhuma pessoa corresponde aos filtros aplicados. Ajuste a busca, o status, a unidade ou o responsável.'
                : 'Ainda não há pessoas vinculadas às unidades sob sua coordenação.'
            }
          />
        ) : (
          <ul
            data-testid="people-grid"
            aria-label="Pessoas do escopo"
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {visiblePeople.map((person) => (
              <PersonProfileCard key={person.profileId} person={person} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}