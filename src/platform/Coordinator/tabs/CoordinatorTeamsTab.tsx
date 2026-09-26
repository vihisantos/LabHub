import { useMemo } from 'react'
import type {
  CoordinatorRoleOption,
  CoordinatedUnit,
} from '../../../core/permissions/coordinatorService'
import type { Ticket } from '../../../apps/chamados/types'
import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'
import { initials } from '../coordinatorHelpers'
import { composeTeams, type TeamGroup, type TeamMemberRow } from '../coordinatorTeams'
import type { ScopeSlaConfigs } from '../coordinatorTickets'
import { EmptyState } from '../components/EmptyState'

export interface CoordinatorTeamsTabProps {
  units: CoordinatedUnit[]
  scopeTickets: Ticket[]
  slaConfigs: ScopeSlaConfigs
  rolesById: Map<string, CoordinatorRoleOption>
  openChamadosFor: (unitId: string) => ((query?: string) => void) | null
}

const STAT_LABELS: ReadonlyArray<{ key: 'open' | 'inProgress' | 'highPriority' | 'slaRisk'; label: string }> = [
  { key: 'open', label: 'Abertos' },
  { key: 'inProgress', label: 'Em andamento' },
  { key: 'highPriority', label: 'Alta / críticos' },
  { key: 'slaRisk', label: 'SLA em risco' },
]

function PersonAvatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-violet-500/15 font-bold text-violet-600 dark:text-violet-400',
        small ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-[11px]',
      )}
    >
      {initials(name)}
    </span>
  )
}

function MemberRow({ row }: { row: TeamMemberRow }) {
  const name = row.member.profile?.name ?? 'Perfil não disponível'
  const email = row.member.profile?.email || 'Sem e-mail registrado'
  return (
    <li
      data-testid={`teams-member-${row.member.membership.id}`}
      className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2"
    >
      <PersonAvatar name={name} small />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-fg">{name}</p>
        <p className="mt-0.5 truncate text-[10px] text-fg-muted">{email}</p>
        <span className="mt-1 inline-flex rounded-full bg-input px-1.5 py-0.5 text-[10px] font-medium leading-none text-fg-muted">
          {row.roleLabel}
        </span>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold leading-none text-fg tabular-nums" data-testid={`teams-member-open-${row.member.membership.id}`}>
          {row.metrics.open}
        </p>
        <p className="mt-1 text-[10px] text-fg-muted">chamado{row.metrics.open !== 1 ? 's' : ''}</p>
      </div>
    </li>
  )
}

function TeamCard({
  team,
  multipleUnits,
  onOpenChamados,
}: {
  team: TeamGroup
  multipleUnits: boolean
  onOpenChamados: (unitId: string) => ((query?: string) => void) | null
}) {
  const leaderName = team.leader.member.profile?.name ?? 'Perfil não disponível'
  const open = onOpenChamados(team.unitId)
  return (
    <div
      data-testid={`teams-team-${team.unitId}-${team.leader.member.membership.id}`}
      className="overflow-hidden rounded-xl border border-line bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-card px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <PersonAvatar name={leaderName} />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-fg">{leaderName}</p>
            <p className="mt-0.5 truncate text-[11px] text-fg-muted">
              {team.leader.roleLabel}
              {multipleUnits ? ` · ${team.unitName}` : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full bg-input px-2 py-0.5 text-[10px] font-semibold text-fg-dim" data-testid={`teams-team-members-${team.leader.member.membership.id}`}>
            {team.memberCount} membro{team.memberCount !== 1 ? 's' : ''}
          </span>
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400" data-testid={`teams-team-open-${team.leader.member.membership.id}`}>
            {team.metrics.open} chamado{team.metrics.open !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 px-3.5 pt-3 sm:grid-cols-4">
        {STAT_LABELS.map(({ key, label }) => (
          <div key={key} className="rounded-lg bg-input/50 px-2 py-2">
            <p className="text-[10px] text-fg-muted">{label}</p>
            <p className="mt-0.5 text-sm font-bold leading-none text-fg tabular-nums" data-testid={`teams-team-stat-${key}-${team.leader.member.membership.id}`}>
              {team.metrics[key]}
            </p>
          </div>
        ))}
      </div>

      <div className="px-3.5 py-3">
        {team.members.length === 0 ? (
          <p className="text-[11px] text-fg-dim">Sem equipe direta ainda.</p>
        ) : (
          <ul className="flex flex-col gap-1.5" aria-label={`Membros da equipe de ${leaderName}`}>
            {team.members.map((row) => (
              <MemberRow key={row.member.membership.id} row={row} />
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-line px-3.5 py-2.5">
        <button
          type="button"
          disabled={!open}
          data-testid={`teams-open-${team.unitId}-${team.leader.member.membership.id}`}
          onClick={() => open?.()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-1.5 text-[11px] font-semibold text-violet-600 transition-colors hover:bg-violet-500/25 disabled:cursor-default disabled:opacity-50 dark:text-violet-400"
        >
          <icons.ui.inbox size={12} />
          Ver chamados da unidade
        </button>
      </div>
    </div>
  )
}

/**
 * Aba "Equipes" da Central do Coordenador (V1).
 *
 * Visão ORGANIZACIONAL + OPERACIONAL das equipes sob coordenação, read-only e
 * 100% client-side: projeção pura (`composeTeams`) sobre os dados que o shell já
 * autorizou — `units` (escopo fail-closed por RPC 047) + `scopeTickets` (cache
 * bruto autorizado) + `slaConfigs` (fonte única de SLA). Nada é buscado aqui.
 *
 * Difere da aba Pessoal: aqui o destaque é a ORGANIZAÇÃO (liderança → quantos
 * membros) e a SITUAÇÃO OPERACIONAL (chamados abertos / em andamento / alta e
 * críticos / SLA em risco). Líderes sem membros permanecem visíveis (a equipe
 * é a estrutura, não o vínculo do momento) e membros sem responsável resolvível
 * caem na seção "Sem responsável" (nunca inventamos um líder).
 *
 * Navegação: "Ver chamados da unidade" reutiliza o mecanismo existente
 * `openChamadosFor` (troca de workspace + rota `/chamados`). Limitação V1
 * documentada: o TicketList não possui query param para filtrar por múltiplos
 * responsáveis — então não inventamos query nova; abrimos a fila da unidade e
 * o responsável é identificado na própria listagem.
 */
export function CoordinatorTeamsTab({
  units,
  scopeTickets,
  slaConfigs,
  rolesById,
  openChamadosFor,
}: CoordinatorTeamsTabProps) {
  const projection = useMemo(
    () => composeTeams(units, scopeTickets, slaConfigs, rolesById),
    [units, scopeTickets, slaConfigs, rolesById],
  )

  const multipleUnits = units.length > 1

  const unitsWithTeams = useMemo(
    () => units.filter((u) => projection.teams.some((t) => t.unitId === u.unitId)),
    [units, projection.teams],
  )
  const hasTeams = projection.teams.length > 0
  const hasUnassigned = projection.unassigned.length > 0

  return (
    <section data-testid="tab-teams" className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">Equipes</h2>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-fg-muted">
            Organização das equipes sob sua coordenação, com a situação operacional de cada uma.
            Visão de leitura sobre os dados já autorizados.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
          <p className="text-[10px] text-fg-muted">Equipes</p>
          <p className="mt-1 text-xl font-bold leading-none text-fg tabular-nums" data-testid="teams-summary-teams">
            {projection.summary.teamCount}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
          <p className="text-[10px] text-fg-muted">Membros</p>
          <p className="mt-1 text-xl font-bold leading-none text-fg tabular-nums" data-testid="teams-summary-members">
            {projection.summary.personCount}
          </p>
        </div>
        <div className="col-span-2 rounded-xl border border-line bg-surface px-3.5 py-3 sm:col-span-1">
          <p className="text-[10px] text-fg-muted">Chamados dos membros</p>
          <p className="mt-1 text-xl font-bold leading-none text-fg tabular-nums" data-testid="teams-summary-open">
            {projection.summary.openCount}
          </p>
        </div>
      </div>

      <div className="mt-4">
        {!hasTeams && !hasUnassigned ? (
          <EmptyState
            icon={<icons.ui.users size={20} className="text-fg-muted" />}
            variant="soft"
            title="Nenhuma equipe encontrada"
            description="As equipes são formadas pelas lideranças sob sua coordenação. Quando houver lideranças e membros vinculados, eles aparecerão aqui."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {unitsWithTeams.map((unit) => (
              <div key={unit.unitId} data-testid={`teams-unit-${unit.unitId}`}>
                <div className="mb-2 flex items-center gap-2">
                  <icons.ui.home size={13} aria-hidden="true" className="shrink-0 text-fg-muted" />
                  <p className="truncate text-xs font-semibold uppercase tracking-wide text-fg-muted">
                    {unit.unitName}
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {projection.teams
                    .filter((t) => t.unitId === unit.unitId)
                    .map((team) => (
                      <TeamCard
                        key={team.id}
                        team={team}
                        multipleUnits={multipleUnits}
                        onOpenChamados={openChamadosFor}
                      />
                    ))}
                </div>
              </div>
            ))}

            {hasUnassigned && (
              <div
                data-testid="teams-unassigned"
                className="overflow-hidden rounded-xl border border-dashed border-line bg-surface"
              >
                <div className="flex items-center gap-2 px-3.5 py-2.5">
                  <icons.ui.user size={14} aria-hidden="true" className="shrink-0 text-fg-dim" />
                  <p className="truncate text-xs font-semibold text-fg-muted">Sem responsável definido</p>
                </div>
                <ul className="flex flex-col gap-1.5 px-2 pb-2">
                  {projection.unassigned.map((row) => (
                    <MemberRow key={row.member.membership.id} row={row} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}