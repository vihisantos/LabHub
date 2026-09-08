import { useNavigate } from 'react-router-dom'
import { useCoordinator } from '../../core/permissions/useCoordinator'
import { permissionService } from '../../core/permissions/service'
import type { CoordinatedLeader } from '../../core/permissions/coordinatorService'
import type { TeamMemberProfile } from '../../core/permissions/membership'
import { icons } from '../../lib/icons'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase()
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

function roleLabel(profile: TeamMemberProfile | null | undefined): string {
  if (!profile) return '—'
  const role = permissionService.getRoleForUser(profile.roleId)
  return role?.name ?? profile.roleId
}

function LeaderBlock({ leader }: { leader: CoordinatedLeader }) {
  const name = leader.profile?.name ?? 'Membro sem perfil'
  return (
    <div
      key={leader.leadership.id}
      className="rounded-xl border border-line bg-surface px-3 py-2.5"
    >
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
          {roleLabel(leader.profile)}
        </span>
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
                <span className="min-w-0 flex-1 truncate text-[11px] text-fg">
                  {memberName}
                </span>
                <span className="shrink-0 rounded-full bg-input px-2 py-0.5 text-[9px] font-semibold text-fg-dim">
                  {roleLabel(member.profile)}
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

/**
 * RBAC 2.0 (Fase 8): ÁREA DO COORDENADOR (scope coordination).
 *
 * O escopo vem do servidor (RPCs 047 fail-closed por auth.uid()): unidades onde
 * o usuário tem membership ATIVA de coordenação → lideranças/subordinações
 * diretas → equipes. Nada de dados inventados: o que renderiza aqui é real.
 * A escrita escopada (`coordinator_set_manager`) é capacidade do serviço; a UI
 * de gestão (vincular/remover) não tem botões falsos — chega em fase própria.
 */
export function CoordinatorHome() {
  const navigate = useNavigate()
  const { units, loading, failed, refresh } = useCoordinator()

  const leaderCount = units.reduce((acc, u) => acc + u.leaders.length, 0)
  const memberCount = units.reduce(
    (acc, u) => acc + u.leaders.reduce((a, l) => a + l.members.length, 0),
    0,
  )

  return (
    <div className="min-h-dvh bg-surface text-fg">
      <div className="mx-auto max-w-lg px-5 pt-8 pb-8">
        <header className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-card text-fg-dim transition-colors hover:bg-input hover:text-fg"
              title="Voltar ao início"
            >
              <icons.ui.back size={20} />
            </button>
            <span className="rounded-full bg-violet-500/15 px-3 py-1 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
              Coordenação
            </span>
          </div>
          <div className="mt-5">
            <h1 className="text-2xl font-bold text-fg">Área do Coordenador</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Gestão entre as unidades sob sua coordenação — dados reais do seu escopo.
            </p>
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-14">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            <p className="text-xs text-fg-muted">Carregando seu escopo de coordenação...</p>
          </div>
        ) : failed ? (
          <div className="rounded-2xl border border-dashed border-line bg-card p-6 text-center">
            <p className="text-sm font-semibold text-fg">Não foi possível carregar seu escopo</p>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-fg-muted">
              Algo deu errado ao buscar as unidades sob sua coordenação. Tente novamente em
              instantes.
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-4 rounded-xl bg-violet-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-400"
            >
              Tentar novamente
            </button>
          </div>
        ) : units.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-card p-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500">
              <icons.ui.shield size={30} />
            </div>
            <h2 className="mt-4 text-base font-semibold text-fg">
              Você ainda não tem unidades de coordenação atribuídas
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-fg-muted">
              Sua coordenação é definida por unidade (membership ativa de coordenação), não
              globalmente. Peça ao administrador para atribuir as unidades ao seu perfil.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-center gap-2.5">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg-muted/10 text-fg-muted">
                  <icons.ui.home size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-fg">{units.length}</p>
                  <p className="text-[10px] text-fg-muted">
                    unidade{units.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg-muted/10 text-fg-muted">
                  <icons.ui.shield size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-fg">{leaderCount}</p>
                  <p className="text-[10px] text-fg-muted">
                    liderança{leaderCount !== 1 ? 's' : ''} direta{leaderCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg-muted/10 text-fg-muted">
                  <icons.ui.userCheck size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-fg">{memberCount}</p>
                  <p className="text-[10px] text-fg-muted">
                    membro{memberCount !== 1 ? 's' : ''} nas equipes
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-6 flex flex-col gap-3">
              {units.map((unit) => (
                <section
                  key={unit.unitId}
                  className="rounded-2xl border border-line bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-fg">Unidade: {unit.unitName}</p>
                    <span className="shrink-0 rounded-full bg-input px-2.5 py-0.5 text-[10px] font-semibold text-fg-dim">
                      {unit.leaders.length} liderança{unit.leaders.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {unit.leaders.length === 0 ? (
                    <p className="mt-3 text-[10px] leading-relaxed text-fg-muted">
                      Nenhuma liderança subordinada nesta unidade ainda.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-col gap-2">
                      {unit.leaders.map((leader) => (
                        <LeaderBlock key={leader.leadership.id} leader={leader} />
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>

            <div className="rounded-2xl border border-dashed border-line bg-card p-5 text-center">
              <p className="text-[10px] leading-relaxed text-fg-muted">
                As ações de gestão desta estrutura (vincular/remover lideranças e membros) ainda
                não foram liberadas na interface. A sua visão de alcance é esta: unidades →
                lideranças → equipes dentro do seu escopo de coordenação.
              </p>
            </div>
          </>
        )}

        <footer className="mt-6 text-center">
          <p className="text-[10px] text-fg-dim">
            Área de liderança — disponível apenas para o cargo Coordenador Multiunidades.
          </p>
        </footer>
      </div>
    </div>
  )
}