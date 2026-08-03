import type { ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { useAppAccess } from '../permissions/usePermissions'
import { appRegistry } from '../../appRegistry'

export function AppGuard({ appId, children }: { appId: string; children: ReactNode }) {
  const { user, loading } = useAuth()
  const { canAccessApp } = useAppAccess()
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-xs text-fg-muted">Verificando acesso...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!canAccessApp(appId)) {
    const app = appRegistry.find((a) => a.id === appId)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-input text-fg-dim">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-fg">Acesso restrito</p>
          <p className="mt-1 text-xs text-fg-muted">
            Seu cargo não tem acesso ao módulo <span className="font-medium text-fg">{app?.name ?? 'solicitado'}</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/launcher')}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-400"
        >
          Voltar ao início
        </button>
      </div>
    )
  }

  return <>{children}</>
}
