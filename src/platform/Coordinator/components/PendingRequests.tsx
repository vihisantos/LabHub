import type { CoordinatorRequest } from '../../../core/permissions/coordinatorService'
import { icons } from '../../../lib/icons'
import { initials } from '../coordinatorHelpers'

interface PendingRequestsProps {
  requests: CoordinatorRequest[]
  loading: boolean
  failed: boolean
  pending: string | null
  onRetry: () => void
  onApprove: (request: CoordinatorRequest) => void
  onReject: (request: CoordinatorRequest) => void
}

/**
 * Solicitações pendentes da unidade (RPC 065 fail-closed): a UI lista o que o
 * servidor confirma e reage ao erro com honestidade — nunca inventa pedidos.
 */
export function PendingRequests({
  requests,
  loading,
  failed,
  pending,
  onRetry,
  onApprove,
  onReject,
}: PendingRequestsProps) {
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
        Solicitações pendentes
      </p>
      {loading ? (
        <p className="mt-2 inline-flex items-center gap-2 text-[10px] text-fg-muted">
          <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
          Carregando solicitações...
        </p>
      ) : failed ? (
        <div className="mt-2 flex items-center gap-2">
          <p className="flex-1 text-[10px] leading-relaxed text-red-500">
            Não foi possível carregar as solicitações desta unidade.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[10px] font-semibold text-fg transition-colors hover:bg-input"
          >
            Tentar novamente
          </button>
        </div>
      ) : requests.length === 0 ? (
        <p className="mt-2 text-[10px] text-fg-muted">Nenhuma solicitação pendente.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {requests.map((request) => {
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
                <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                  Pendente
                </span>
                <button
                  type="button"
                  onClick={() => onApprove(request)}
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
                  onClick={() => onReject(request)}
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
    </div>
  )
}