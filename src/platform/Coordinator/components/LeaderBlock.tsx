import type {
  CoordinatorRoleOption,
  CoordinatedLeader,
} from '../../../core/permissions/coordinatorService'
import type { TeamMember } from '../../../core/permissions/membership'
import { icons } from '../../../lib/icons'
import { initials, roleLabelFor } from '../coordinatorHelpers'

interface LeaderBlockProps {
  leader: CoordinatedLeader
  rolesById: Map<string, CoordinatorRoleOption>
  disabled: boolean
  onAssign: (member: TeamMember) => void
  onUnassign: (member: TeamMember) => void
  onManage: (member: TeamMember) => void
}

/**
 * Liderança subordinada direta ao coordenador na unidade + sua equipe. As
 * ações (vincular a gestor, gerenciar, remover da equipe) são escopadas: a UI
 * apenas chama os RPCs; o Postgres decide. `disabled` bloqueia tudo enquanto
 * uma escrita está em andamento (sem ações duplicadas).
 */
export function LeaderBlock({
  leader,
  rolesById,
  disabled,
  onAssign,
  onUnassign,
  onManage,
}: LeaderBlockProps) {
  const name = leader.profile?.name ?? 'Membro sem perfil'
  const leadershipMember: TeamMember = { membership: leader.leadership, profile: leader.profile }
  return (
    <div key={leader.leadership.id} className="rounded-xl bg-surface px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[11px] font-bold text-violet-600 dark:text-violet-400">
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-fg">{name}</p>
          {leader.profile && (
            <p className="truncate text-[10px] text-fg-muted">{leader.profile.email}</p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-input px-2.5 py-0.5 text-[10px] font-semibold text-fg-dim">
          {roleLabelFor(leader.leadership, leader.profile, rolesById)}
        </span>
        <button
          type="button"
          title="Gerenciar membro"
          aria-label={`Gerenciar ${name}`}
          disabled={disabled}
          onClick={() => onManage(leadershipMember)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-violet-500/10 hover:text-violet-500 disabled:opacity-40"
        >
          <icons.ui.sliders size={13} />
        </button>
      </div>

      {leader.members.length > 0 ? (
        <ul className="mt-2 ml-5 flex flex-col gap-1.5 border-l border-line pl-3">
          {leader.members.map((member) => {
            const memberName = member.profile?.name ?? 'Membro sem perfil'
            return (
              <li key={member.membership.id} className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fg-muted/10 text-[9px] font-bold text-fg-muted">
                  {initials(memberName)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-fg">{memberName}</span>
                <span className="shrink-0 rounded-full bg-input px-2 py-0.5 text-[9px] font-semibold text-fg-dim">
                  {roleLabelFor(member.membership, member.profile, rolesById)}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title="Vincular a gestor"
                    aria-label={`Vincular ${memberName} a gestor`}
                    disabled={disabled}
                    onClick={() => onAssign(member)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-violet-500/10 hover:text-violet-500 disabled:opacity-40"
                  >
                    <icons.ui.plusCircle size={13} />
                  </button>
                  <button
                    type="button"
                    title="Gerenciar membro"
                    aria-label={`Gerenciar ${memberName}`}
                    disabled={disabled}
                    onClick={() => onManage(member)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-violet-500/10 hover:text-violet-500 disabled:opacity-40"
                  >
                    <icons.ui.sliders size={13} />
                  </button>
                  <button
                    type="button"
                    title="Remover da equipe"
                    aria-label={`Remover ${memberName} da equipe`}
                    disabled={disabled}
                    onClick={() => onUnassign(member)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
                  >
                    <icons.ui.minus size={13} />
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-2 ml-5 text-[10px] text-fg-muted">Sem equipe direta ainda.</p>
      )}
    </div>
  )
}