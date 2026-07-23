import { useState } from 'react'
import { useAuth } from '../../../core/auth/AuthContext'
import { ROLE_LABELS, ROLE_COLORS } from '../types'
import { icons } from '../../../lib/icons'

// For now, we'll manage users through Supabase directly
// This page shows the current user and allows role changes via Supabase dashboard

export function UsersPage() {
  const { user } = useAuth()
  const [showInfo, setShowInfo] = useState(true)

  if (!user) return null

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-bold text-fg">Usuários</h2>
        <p className="mt-1 text-sm text-fg-muted">Gerencie usuários do sistema</p>
      </div>

      {showInfo && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <icons.ui.alertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
            <div>
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Gerenciamento de usuários
              </p>
              <p className="mt-1 text-[11px] text-amber-600/70 dark:text-amber-400/70">
                Para adicionar ou gerenciar usuários, acesse o painel do Supabase:
                <br />
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-amber-500"
                >
                  supabase.com/dashboard
                </a>
                <br />
                → Authentication → Users
              </p>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                className="mt-2 text-[10px] text-amber-600/50 hover:text-amber-500"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
            <icons.ui.user size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">{user.name}</p>
            <p className="text-[11px] text-fg-muted">{user.email}</p>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${ROLE_COLORS[user.role]}`}>
            {ROLE_LABELS[user.role]}
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <h3 className="mb-3 text-xs font-semibold text-fg-muted">Permissões da sua role</h3>
        <div className="space-y-2">
          {user.role === 'admin' && (
            <>
              <div className="flex items-center gap-2 text-xs text-fg">
                <icons.ui.check size={14} className="text-emerald-500" />
                Acesso total ao sistema
              </div>
              <div className="flex items-center gap-2 text-xs text-fg">
                <icons.ui.check size={14} className="text-emerald-500" />
                Gerenciar usuários e workspaces
              </div>
              <div className="flex items-center gap-2 text-xs text-fg">
                <icons.ui.check size={14} className="text-emerald-500" />
                Ver logs de auditoria
              </div>
            </>
          )}
          {user.role === 'technician' && (
            <>
              <div className="flex items-center gap-2 text-xs text-fg">
                <icons.ui.check size={14} className="text-emerald-500" />
                Gerenciar chamados e ativos
              </div>
              <div className="flex items-center gap-2 text-xs text-fg">
                <icons.ui.check size={14} className="text-emerald-500" />
                Acessar estoque
              </div>
              <div className="flex items-center gap-2 text-xs text-fg">
                <icons.ui.check size={14} className="text-emerald-500" />
                Ver logs de auditoria
              </div>
            </>
          )}
          {user.role === 'viewer' && (
            <>
              <div className="flex items-center gap-2 text-xs text-fg">
                <icons.ui.check size={14} className="text-emerald-500" />
                Visualizar dados
              </div>
              <div className="flex items-center gap-2 text-xs text-fg">
                <icons.ui.check size={14} className="text-emerald-500" />
                Abrir chamados
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
