import type {
  CoordinatorInactiveMember,
  CoordinatorRequest,
  CoordinatorRoleOption,
  CoordinatedLeader,
  CoordinatedUnit,
} from '../../../core/permissions/coordinatorService'
import type { TeamMember } from '../../../core/permissions/membership'
import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'
import { ResponsiveGrid } from '../../../responsive'
import { InactiveMembers } from '../components/InactiveMembers'
import { LeaderBlock } from '../components/LeaderBlock'
import { PendingRequests } from '../components/PendingRequests'

interface SummaryChipProps {
  icon: 'clock' | 'alertTriangle' | 'close'
  label: string
  count: number
  tone: 'amber' | 'red' | 'neutral'
}

function SummaryChip({ icon, label, count, tone }: SummaryChipProps) {
  const Icon =
    icon === 'close'
      ? icons.ui.close
      : icon === 'alertTriangle'
        ? icons.ui.alertTriangle
        : icons.ui.clock
  const valueClass =
    tone === 'red'
      ? 'bg-red-500/10 text-red-500'
      : tone === 'amber'
        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
        : 'bg-input text-fg-dim'
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={13} className="shrink-0 text-fg-muted" />
      <span className="text-[11px] text-fg-muted">{label}</span>
      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', valueClass)}>
        {count}
      </span>
    </div>
  )
}

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
  pending: string | null
  rolesById: Map<string, CoordinatorRoleOption>
  onAssignMember: (unit: CoordinatedUnit, leader: CoordinatedLeader, member: TeamMember) => void
  onUnassign: (member: TeamMember) => void
  onManage: (member: TeamMember, unitName: string) => void
  onApproveRequest: (request: CoordinatorRequest) => void
  onRejectRequest: (request: CoordinatorRequest) => void
  onRestore: (member: CoordinatorInactiveMember) => void
  pendingCount: number
  suspendedCount: number
  removedCount: number
  leaderCount: number
  memberCount: number
}

/**
 * Aba "Pessoal" da Central (PR C). Concentra em um só lugar a gestão de pessoas
 * do escopo (solicitações pendentes, membros inativos e equipes por liderança),
 * REUTILIZANDO os componentes existentes (`PendingRequests`, `InactiveMembers`,
 * `LeaderBlock`) com os MESMOS dados já carregados no shell — nenhuma leitura
 * nova é feita nesta fase. Nenhum painel da Visão Geral (#250) é duplicado
 * aqui: as abas são composição sobre o mesmo estado compartilhado.
 */
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
  pending,
  rolesById,
  onAssignMember,
  onUnassign,
  onManage,
  onApproveRequest,
  onRejectRequest,
  onRestore,
  pendingCount,
  suspendedCount,
  removedCount,
  leaderCount,
  memberCount,
}: CoordinatorPeopleTabProps) {
  return (
    <section data-testid="tab-people" className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-sm font-semibold text-fg">Pessoal do escopo</h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <SummaryChip icon="clock" tone="amber" label="Pendentes" count={pendingCount} />
          <SummaryChip icon="alertTriangle" tone="amber" label="Suspensos" count={suspendedCount} />
          <SummaryChip icon="close" tone="red" label="Removidos" count={removedCount} />
          <SummaryChip icon="alertTriangle" tone="neutral" label="Lideranças" count={leaderCount} />
          <SummaryChip icon="clock" tone="neutral" label="Membros" count={memberCount} />
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-fg-muted">
        Gestão de pessoas por unidade sob sua coordenação. Ações continuam escopadas aos RPCs
        existentes: a UI envia apenas ids e o Postgres decide. Nenhuma solicitação é inventada
        aqui — o que aparece é o que o servidor confirma.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        {units.map((unit) => {
          const unitRequests = requestsByUnit[unit.unitId] ?? []
          return (
            <section
              key={unit.unitId}
              data-testid={`tab-people-unit-${unit.unitId}`}
              className="rounded-xl border border-line bg-surface p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <p className="min-w-[7rem] flex-1 truncate text-sm font-semibold text-fg sm:min-w-0">
                  Unidade: {unit.unitName}
                </p>
                <div className="flex shrink-0 items-center gap-1.5">
                  {unitRequests.length > 0 && (
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      {unitRequests.length} pendente{unitRequests.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              <PendingRequests
                requests={unitRequests}
                loading={requestsLoading}
                failed={requestsFailed}
                pending={pending}
                onRetry={onRetryRequests}
                onApprove={onApproveRequest}
                onReject={onRejectRequest}
              />

              <InactiveMembers
                members={inactiveByUnit[unit.unitId] ?? []}
                loading={inactiveLoading}
                failed={inactiveFailed}
                pending={pending}
                onRetry={onRetryInactive}
                onRequestRestore={onRestore}
              />

              {unit.leaders.length === 0 ? (
                <p className="mt-3 text-[10px] leading-relaxed text-fg-muted">
                  Nenhuma liderança subordinada nesta unidade ainda.
                </p>
              ) : (
                <ResponsiveGrid minWidth={256} gap={12} className="mt-3">
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
              )}
            </section>
          )
        })}
      </div>
    </section>
  )
}