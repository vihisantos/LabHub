import { useNavigate } from 'react-router-dom'
import { useLeadership } from '../../core/permissions/useLeadership'
import { useTeam } from '../../core/permissions/useTeam'
import { permissionService } from '../../core/permissions/service'
import { useWorkspace } from '../../core/workspaces/WorkspaceContext'
import type { TeamMember } from '../../core/permissions/membership'
import { icons } from '../../lib/icons'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase()
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

function roleLabel(member: TeamMember): string {
  if (!member.profile) return '—'
  const role = permissionService.getRoleForUser(member.profile.roleId)
  return role?.name ?? member.profile.roleId
}

/**
 * RBAC 2.0 (Fase 7): ÁREA DO LÍDER (scope team).
 * A equipe vem do servidor (`get_leader_team`, fail-closed). O que renderiza
 * aqui é dado real: membros do escopo + indicadores básicos derivados deles.
 * Nenhuma funcionalidade falsa; ações de gestão chegam nas próximas fases.
 */
export function LiderHome() {
  const navigate = useNavigate()
  const { role } = useLeadership()
  const { workspace } = useWorkspace()
  const { team, loading, failed, refresh } = useTeam()

  const unitName = workspace?.name ?? null

  const roleCounts: { label: string; count: number }[] = (() => {
    const counts = new Map<string, number>()
    for (const member of team) {
      const label = roleLabel(member)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
  })()

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
              Equipe
            </span>
          </div>
          <div className="mt-5">
            <h1 className="text-2xl font-bold text-fg">Área do Líder</h1>
            <p className="mt-1 text-sm text-fg-muted">
              {unitName
                ? `Sua equipe na unidade "${unitName}".`
                : 'Sua equipe de trabalho nesta unidade.'}
            </p>
          </div>
        </header>

        {!unitName ? (
          <div className="rounded-2xl border border-dashed border-line bg-card p-6 text-center">
            <p className="text-sm font-semibold text-fg">Nenhuma unidade selecionada</p>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-fg-muted">
              Selecione a unidade para ver a sua equipe e volte aqui.
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-4 rounded-xl bg-violet-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-400"
            >
              Escolher unidade
            </button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center gap-3 py-14">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            <p className="text-xs text-fg-muted">Carregando sua equipe...</p>
          </div>
        ) : failed ? (
          <div className="rounded-2xl border border-dashed border-line bg-card p-6 text-center">
            <p className="text-sm font-semibold text-fg">Não foi possível carregar sua equipe</p>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-fg-muted">
              Algo deu errado ao buscar os membros da equipe. Tente novamente em instantes.
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-4 rounded-xl bg-violet-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-400"
            >
              Tentar novamente
            </button>
          </div>
        ) : team.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-card p-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500">
              <icons.ui.userCheck size={30} />
            </div>
            <h2 className="mt-4 text-base font-semibold text-fg">
              Você ainda não tem equipe atribuída
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-fg-muted">
              Nesta unidade, ainda não há membros vinculados à sua liderança. Peça ao
              administrador para configurar a sua equipe (gestão por unidade — não é global).
            </p>
            <p className="mt-3 text-[10px] text-fg-dim">Cargo: {role?.name ?? '—'}</p>
          </div>
        ) : (
          <>
            {/* Indicadores básicos, reais e derivados da equipe */}
            <div className="mb-5 flex items-center gap-2.5">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg-muted/10 text-fg-muted">
                  <icons.ui.userCheck size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-fg">{team.length}</p>
                  <p className="text-[10px] text-fg-muted">
                    membro{team.length !== 1 ? 's' : ''} ativo{team.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg-muted/10 text-fg-muted">
                  <icons.ui.fileBarChart size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  {roleCounts.length > 0 && (
                    <p className="truncate text-[10px] font-semibold text-fg">
                      {roleCounts.map((r) => `${r.count} ${r.label}`).join(' · ')}
                    </p>
                  )}
                  <p className="text-[10px] text-fg-muted">por cargo</p>
                </div>
              </div>
            </div>

            <div className="mb-6 flex flex-col gap-2.5">
              <p className="mb-1 px-1 text-xs font-semibold text-fg-muted">Membros da equipe</p>
              {team.map((member) => {
                const name = member.profile?.name ?? 'Membro sem perfil'
                return (
                  <div
                    key={member.membership.id}
                    className="flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[11px] font-bold text-violet-600 dark:text-violet-400">
                      {initials(name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-fg">{name}</p>
                      {member.profile && (
                        <p className="truncate text-[10px] text-fg-muted">{member.profile.email}</p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-input px-2.5 py-0.5 text-[10px] font-semibold text-fg-dim">
                      {roleLabel(member)}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="rounded-2xl border border-dashed border-line bg-card p-5 text-center">
              <p className="text-[10px] leading-relaxed text-fg-muted">
                As ações de gestão da equipe (atribuir chamados, ajustar vínculos) ainda não
                foram liberadas. A sua visão de alcance é esta: membros do seu escopo de
                liderança nesta unidade.
              </p>
            </div>
          </>
        )}

        <footer className="mt-6 text-center">
          <p className="text-[10px] text-fg-dim">
            Área de liderança — disponível apenas para o cargo Líder ({unitName ?? 'unidade'}).
          </p>
        </footer>
      </div>
    </div>
  )
}