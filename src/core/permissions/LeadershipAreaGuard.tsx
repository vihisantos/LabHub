import type { ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useLeadership } from './useLeadership'
import { useCoordinator } from './useCoordinator'
import type { LeadershipArea } from './leadership'

/**
 * RBAC 2.0 (Fase 6): guard das áreas de liderança.
 * Só libera a área se o CARGO do usuário for de liderança E corresponder ao
 * escopo da área (coordenação → /coordenador; equipe → área do líder).
 * Regra dura: não basta permissão de app nem override — a área é do cargo.
 *
 * FASE COORDENAÇÃO (Fase 8+): a área de coordenação é concedida por MEMBERSHIP
 * ATIVA de coordenação (o servidor confirma, via `get_coordinator_units`, que o
 * usuário coordena ≥1 unidade). Ter o cargo global `coordinator` (dado legado de
 * `profiles.role`) NÃO dá acesso à área — um coordenador só acessa se tiver
 * unidade(s) sob coordenação. O escopo `team` permanece decidido pelo cargo.
 */
export function LeadershipAreaGuard({
  scope,
  children,
}: {
  scope: LeadershipArea
  children: ReactNode
}) {
  const { user, loading: authLoading } = useAuth()
  const { isLeadership, area } = useLeadership()
  const coordinator = useCoordinator({ enabled: scope === 'coordination' })
  const navigate = useNavigate()

  if (authLoading || (scope === 'coordination' && coordinator.loading)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <p className="text-xs text-fg-muted">Verificando acesso...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (scope === 'coordination') {
    // Falha na confirmação do escopo → nega, mas oferece retry (fail-closed:
    // um erro de rede não vira acesso nem trava o usuário sem saída).
    if (coordinator.failed) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-input text-fg-dim">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-9-9" />
              <path d="M21 3v6h-6" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-fg">Não foi possível confirmar o acesso</p>
            <p className="mt-1 text-xs text-fg-muted">
              Não conseguimos confirmar suas unidades de coordenação. Tente novamente em instantes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => coordinator.refresh({ silent: true })}
            className="rounded-xl bg-violet-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-400"
          >
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-xl bg-input px-4 py-2 text-xs font-semibold text-fg transition-colors hover:bg-card"
          >
            Voltar ao início
          </button>
        </div>
      )
    }

    // Não coordena ativamente nenhuma unidade → área negada (fail-closed).
    if (!coordinator.isCoordinator) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-input text-fg-dim">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-fg">Acesso restrito</p>
            <p className="mt-1 text-xs text-fg-muted">
              Esta área é liberada apenas para quem coordena ativamente uma ou mais
              unidades (membership ativa de coordenação). Não basta possuir o cargo de
              coordenador — o acesso vem das unidades sob sua coordenação.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-xl bg-violet-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-400"
          >
            Voltar ao início
          </button>
        </div>
      )
    }

    return <>{children}</>
  }

  const denied = !isLeadership || area !== 'team'

  if (denied) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-input text-fg-dim">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-fg">Acesso restrito</p>
          <p className="mt-1 text-xs text-fg-muted">
            {isLeadership
              ? 'Esta área é exclusiva para o cargo correspondente a ela. Seu cargo de liderança é de outro escopo.'
              : 'Seu cargo não é de liderança. A área de liderança é liberada apenas para cargos classificados como liderança (Líder ou Coordenador Multiunidades).'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-xl bg-violet-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-400"
        >
          Voltar ao início
        </button>
      </div>
    )
  }

  return <>{children}</>
}