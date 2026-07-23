import type { ReactNode } from 'react'
import { useAuth } from './useAuth'

interface AuthGuardProps {
  children: ReactNode
  fallback?: ReactNode
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { user, loading, isConfigured } = useAuth()

  if (!isConfigured) {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-xs text-fg-muted">Verificando autenticação...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return fallback ? <>{fallback}</> : (
      <div className="flex min-h-dvh items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
            <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-fg">Acesso Restrito</h2>
            <p className="mt-1 text-sm text-fg-muted">Faça login para acessar o LabHub</p>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
