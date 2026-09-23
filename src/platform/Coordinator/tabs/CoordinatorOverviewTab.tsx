import type { Ticket } from '../../../apps/chamados/types'
import type { SlaWorkspaceSummary } from '../../../apps/chamados/services/sla'
import type { TicketStatsSummary } from '../../../apps/chamados/services/ticketStats'
import type {
  CoordinatorInactiveMember,
  CoordinatorRequest,
  CoordinatorRoleOption,
  CoordinatedLeader,
  CoordinatedUnit,
  CoordinatorUnitOverview,
} from '../../../core/permissions/coordinatorService'
import type { TeamMember } from '../../../core/permissions/membership'
import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'
import { ResponsiveGrid } from '../../../responsive'
import { initials } from '../coordinatorHelpers'
import { CoordinatorPanel } from '../components/CoordinatorPanel'
import { CoordinatorRecentTickets } from '../components/CoordinatorRecentTickets'
import { CoordinatorSlaPanel } from '../components/CoordinatorSlaPanel'
import { CoordinatorTicketsPanel } from '../components/CoordinatorTicketsPanel'
import { InactiveMembers } from '../components/InactiveMembers'
import { LeaderBlock } from '../components/LeaderBlock'
import { UnitOverview } from '../components/UnitOverview'

export interface CoordinatorOverviewTabProps {
  wideLayout: boolean
  units: CoordinatedUnit[]
  ticketStats: TicketStatsSummary
  slaAgg: { within: number; near: number; overdue: number }
  slaRateLabel: string
  scopeChamados: ((query?: string) => void) | null
  recentTickets: Ticket[]
  unitNameOf: (workspaceId?: string) => string
  recentOpenTicket: ((ticketId: string) => void) | undefined
  requestsByUnit: Record<string, CoordinatorRequest[]>
  requestsLoading: boolean
  requestsFailed: boolean
  onRetryRequests: () => void
  allRequests: Array<CoordinatorRequest & { unitName: string }>
  inactiveByUnit: Record<string, CoordinatorInactiveMember[]>
  inactiveLoading: boolean
  inactiveFailed: boolean
  onRetryInactive: () => void
  overviewByUnit: Record<string, CoordinatorUnitOverview | null | undefined>
  overviewLoading: boolean
  overviewFailed: boolean
  onRetryOverview: () => void
  slaByWorkspace: Record<string, SlaWorkspaceSummary>
  onOpenChamados: (unitId: string) => ((query?: string) => void) | null
  onOpenTicket: (unitId: string) => ((ticketId: string) => void) | null
  pending: string | null
  rolesById: Map<string, CoordinatorRoleOption>
  pendingCount: number
  suspendedCount: number
  removedCount: number
  leaderCount: number
  onAssignMember: (unit: CoordinatedUnit, leader: CoordinatedLeader, member: TeamMember) => void
  onUnassign: (member: TeamMember) => void
  onManage: (member: TeamMember, unitName: string) => void
  onApproveRequest: (request: CoordinatorRequest) => void
  onRejectRequest: (request: CoordinatorRequest) => void
  onRequestRestore: (member: CoordinatorInactiveMember) => void
}

/**
 * Aba "Visão Geral" da Central (PR C). Conteúdo extraído INTEGRALMENTE do que o
 * shell (`CoordinatorHome`) já renderizava inline — nenhuma regra nova, nenhum
 * refactor estrutural: mesma ordem, mesmos `data-testid`, mesmos callbacks e o
 * mesmo comportamento de loading/erro/fail-closed da Visão Geral existente.
 *
 * Puramente apresentacional: recebe por props os dados já calculados (KPIs,
 * SLA, recentes, pendências, grade de unidades, rail de escopo) e os callbacks
 * de ação/navegação. Não faz fetch, não lê cache, não decide autorização e não
 * chama RPCs — o shell continua a fonte de dados única.
 */
export function CoordinatorOverviewTab({
  wideLayout,
  units,
  ticketStats,
  slaAgg,
  slaRateLabel,
  scopeChamados,
  recentTickets,
  unitNameOf,
  recentOpenTicket,
  requestsByUnit,
  requestsLoading,
  requestsFailed,
  onRetryRequests,
  allRequests,
  inactiveByUnit,
  inactiveLoading,
  inactiveFailed,
  onRetryInactive,
  overviewByUnit,
  overviewLoading,
  overviewFailed,
  onRetryOverview,
  slaByWorkspace,
  onOpenChamados,
  onOpenTicket,
  pending,
  rolesById,
  pendingCount,
  suspendedCount,
  removedCount,
  leaderCount,
  onAssignMember,
  onUnassign,
  onManage,
  onApproveRequest,
  onRejectRequest,
  onRequestRestore,
}: CoordinatorOverviewTabProps) {
  const unitsPanel = (
    <ResponsiveGrid minWidth={380} maxWidth={560} data-testid="coordinator-units-grid" gap={12}>
      {units.map((unit) => {
        const unitRequests = requestsByUnit[unit.unitId] ?? []
        return (
          <section
            key={unit.unitId}
            className="overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow-card)]"
          >
            <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
              <p className="min-w-0 truncate text-sm font-semibold tracking-tight text-fg">
                Unidade: {unit.unitName}
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                {unitRequests.length > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    {unitRequests.length} pendente{unitRequests.length !== 1 ? 's' : ''}
                  </span>
                )}
                <span className="rounded-full bg-input px-2.5 py-0.5 text-[10px] font-semibold text-fg-dim">
                  {unit.leaders.length} liderança{unit.leaders.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <UnitOverview
              overview={overviewByUnit[unit.unitId] ?? null}
              loading={overviewLoading}
              failed={overviewFailed}
              onRetry={onRetryOverview}
              sla={slaByWorkspace[unit.unitId] ?? null}
              onOpenChamados={onOpenChamados(unit.unitId)}
              onOpenTicket={onOpenTicket(unit.unitId)}
            />

            <InactiveMembers
              members={inactiveByUnit[unit.unitId] ?? []}
              loading={inactiveLoading}
              failed={inactiveFailed}
              pending={pending}
              onRetry={onRetryInactive}
              onRequestRestore={onRequestRestore}
            />

            {unit.leaders.length === 0 ? (
              <p className="border-t border-line px-4 py-3 text-[10px] leading-relaxed text-fg-muted">
                Nenhuma liderança subordinada nesta unidade ainda.
              </p>
            ) : (
              <div className="border-t border-line px-4 pb-4 pt-3">
                <ResponsiveGrid minWidth={256} gap={12}>
                  {unit.leaders.map((leader) => (
                    <LeaderBlock
                      key={leader.leadership.id}
                      leader={leader}
                      rolesById={rolesById}
                      disabled={pending !== null}
                      onAssign={(member) => onAssignMember(unit, leader, member)}
                      onUnassign={onUnassign}
                      onManage={(member) => onManage(member, unit.unitName)}
                    />
                  ))}
                </ResponsiveGrid>
              </div>
            )}
          </section>
        )
      })}
    </ResponsiveGrid>
  )

  const infoPanel = (
    <div className="rounded-2xl border border-dashed border-line bg-card px-5 py-5 text-center">
      <p className="text-[11px] leading-relaxed text-fg-muted">
        Nesta tela você aprova/rejeita solicitações, ajusta cargo (nunca adm ou coordinator) e o
        status das memberships da unidade, além de vincular membros a um gestor. A criação de
        memberships segue restrita ao administrador; o Postgres valida cada operação.
      </p>
    </div>
  )

  const scopeRail = (
    <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow-card)]">
      <p className="border-b border-line px-4 pb-3 pt-4 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
        Resumo do escopo
      </p>
      <ul className="flex flex-col gap-1 px-4 py-3">
        <li className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5">
          <span className="flex min-w-0 items-center gap-2 text-[11px] text-fg-muted">
            <icons.ui.clock size={13} className="shrink-0" />
            Solicitações pendentes
          </span>
          <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            {pendingCount}
          </span>
        </li>
        <li className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5">
          <span className="flex min-w-0 items-center gap-2 text-[11px] text-fg-muted">
            <icons.ui.alertTriangle size={13} className="shrink-0 text-amber-600 dark:text-amber-400" />
            Suspensos
          </span>
          <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            {suspendedCount}
          </span>
        </li>
        <li className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5">
          <span className="flex min-w-0 items-center gap-2 text-[11px] text-fg-muted">
            <icons.ui.close size={13} className="shrink-0 text-red-500" />
            Removidos
          </span>
          <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-500">
            {removedCount}
          </span>
        </li>
        <li className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5">
          <span className="flex min-w-0 items-center gap-2 text-[11px] text-fg-muted">
            <icons.ui.shield size={13} className="shrink-0" />
            Lideranças diretas
          </span>
          <span className="shrink-0 rounded-full bg-input px-2 py-0.5 text-[10px] font-semibold text-fg-dim">
            {leaderCount}
          </span>
        </li>
      </ul>
    </div>
  )

  const overviewPanels = (
    <>
      <CoordinatorTicketsPanel
        stats={ticketStats}
        sla={{ within: slaAgg.within, near: slaAgg.near, overdue: slaAgg.overdue }}
        onOpenChamados={scopeChamados ?? undefined}
      />

      <ResponsiveGrid minWidth={400} gap={12} className="mb-6">
        <CoordinatorRecentTickets
          tickets={recentTickets}
          resolveUnitName={unitNameOf}
          onOpenTicket={recentOpenTicket}
        />

        <CoordinatorSlaPanel
          within={slaAgg.within}
          near={slaAgg.near}
          overdue={slaAgg.overdue}
          rateLabel={slaRateLabel}
          onOpenChamados={scopeChamados ?? undefined}
        />
      </ResponsiveGrid>

      <CoordinatorPanel
        title="Solicitações / Pendências"
        description={
          pendingCount > 0
            ? 'Aprovar ativa a membership na unidade; o vínculo a uma equipe é ajustado depois pelo gestor da unidade.'
            : undefined
        }
        className="mb-6"
        data-testid="overview-requests"
      >
        {requestsLoading ? (
          <p className="inline-flex items-center gap-2 text-[10px] text-fg-muted">
            <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
            Carregando solicitações...
          </p>
        ) : requestsFailed ? (
          <div className="flex items-center gap-2">
            <p className="flex-1 text-[10px] leading-relaxed text-red-500">
              Não foi possível carregar as solicitações.
            </p>
            <button
              type="button"
              onClick={onRetryRequests}
              className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[10px] font-semibold text-fg transition-colors hover:bg-input"
            >
              Tentar novamente
            </button>
          </div>
        ) : allRequests.length === 0 ? (
          <p className="text-[10px] text-fg-muted">Nenhuma solicitação pendente.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {allRequests.map((request) => {
              const name = request.profile?.name ?? 'Membro sem perfil'
              const approveKey = `approve-${request.membership.id}`
              const rejectKey = `reject-${request.membership.id}`
              return (
                <li key={request.membership.id} className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                    {initials(name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-semibold text-fg">{name}</span>
                    {request.profile && (
                      <span className="block truncate text-[10px] text-fg-muted">
                        {request.profile.email}
                      </span>
                    )}
                  </span>
                  <span className="hidden shrink-0 rounded-full bg-input px-1.5 py-0.5 text-[10px] font-semibold text-fg-dim sm:inline">
                    {request.unitName}
                  </span>
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                    Pendente
                  </span>
                  <button
                    type="button"
                    onClick={() => onApproveRequest(request)}
                    disabled={pending !== null}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/25 disabled:opacity-40 dark:text-emerald-400"
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
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-40"
                  >
                    {pending === rejectKey ? (
                      <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                    ) : (
                      <icons.ui.close size={11} />
                    )}
                    Rejeitar
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </CoordinatorPanel>
    </>
  )

  return (
    <>
      {overviewPanels}

      {wideLayout ? (
        <div className="mb-6 flex items-start gap-4">
          <div className="min-w-0 flex-1">{unitsPanel}</div>
          <aside
            data-testid="coordinator-side-info"
            className="sticky top-6 flex w-72 shrink-0 flex-col gap-4"
          >
            {scopeRail}
            {infoPanel}
          </aside>
        </div>
      ) : (
        <div className={cn('mb-6 flex flex-col gap-4')}>
          {unitsPanel}
          {infoPanel}
        </div>
      )}
    </>
  )
}