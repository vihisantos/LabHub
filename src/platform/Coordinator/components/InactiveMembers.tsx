import type { CoordinatorInactiveMember } from '../../../core/permissions/coordinatorService'
import { icons } from '../../../lib/icons'
import { initials } from '../coordinatorHelpers'

interface InactiveMembersProps {
  members: CoordinatorInactiveMember[]
  loading: boolean
  failed: boolean
  pending: string | null
  onRetry: () => void
  onRequestRestore: (member: CoordinatorInactiveMember) => void
}

/**
 * Membros `suspended`/`removed` da unidade (Fase 10, RPC 066). Somente
 * `suspended` é restaurável (`removed` é terminal/histórico — apenas
 * informativo). O estado vem do servidor; a UI não decide autorização.
 */
export function InactiveMembers({
  members,
  loading,
  failed,
  pending,
  onRetry,
  onRequestRestore,
}: InactiveMembersProps) {
  const suspended = members.filter((m) => m.membership.status === 'suspended')
  const removed = members.filter((m) => m.membership.status === 'removed')

  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
        Membros inativos
      </p>
      {loading ? (
        <p className="mt-2 inline-flex items-center gap-2 text-[10px] text-fg-muted">
          <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
          Carregando membros inativos...
        </p>
      ) : failed ? (
        <div className="mt-2 flex items-center gap-2">
          <p className="flex-1 text-[10px] leading-relaxed text-red-500">
            Não foi possível carregar os membros inativos desta unidade.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[10px] font-semibold text-fg transition-colors hover:bg-input"
          >
            Tentar novamente
          </button>
        </div>
      ) : members.length === 0 ? (
        <p className="mt-2 text-[10px] text-fg-muted">Nenhum membro suspenso ou removido.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-3">
          {suspended.length > 0 && (
            <div>
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Suspensos
              </p>
              <ul className="flex flex-col gap-2">
                {suspended.map((member) => {
                  const name = member.profile?.name ?? 'Membro sem perfil'
                  const restoreKey = `restore-${member.membership.id}`
                  return (
                    <li key={member.membership.id} className="flex flex-wrap items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                        {initials(name)}
                      </span>
                      <span className="min-w-[9rem] flex-1 sm:min-w-0">
                        <span className="block truncate text-[11px] font-semibold text-fg">
                          {name}
                        </span>
                        {member.profile && (
                          <span className="block truncate text-[10px] text-fg-muted">
                            {member.profile.email}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                        Suspenso
                      </span>
                      <button
                        type="button"
                        aria-label={`Restaurar ${name}`}
                        disabled={pending !== null}
                        onClick={() => onRequestRestore(member)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/25 disabled:opacity-40 dark:text-emerald-400"
                      >
                        {pending === restoreKey ? (
                          <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                        ) : (
                          <icons.ui.check size={11} />
                        )}
                        Restaurar
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {removed.length > 0 && (
            <div>
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-fg-muted">
                Removidos
              </p>
              <ul className="flex flex-col gap-2">
                {removed.map((member) => {
                  const name = member.profile?.name ?? 'Membro sem perfil'
                  return (
                    <li key={member.membership.id} className="flex flex-wrap items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-[9px] font-bold text-red-500">
                        {initials(name)}
                      </span>
                      <span className="min-w-[9rem] flex-1 sm:min-w-0">
                        <span className="block truncate text-[11px] font-semibold text-fg">
                          {name}
                        </span>
                        {member.profile && (
                          <span className="block truncate text-[10px] text-fg-muted">
                            {member.profile.email}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-semibold text-red-500">
                        Removido
                      </span>
                      <span className="shrink-0 text-[9px] text-fg-dim">Restauração indisponível</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}