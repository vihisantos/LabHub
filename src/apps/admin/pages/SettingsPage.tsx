import { useAuth } from '../../../core/auth/AuthContext'
import { ROLE_LABELS, ROLE_COLORS } from '../types'
import { icons } from '../../../lib/icons'

export function SettingsPage() {
  const { user } = useAuth()

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-bold text-fg">Configurações</h2>
        <p className="mt-1 text-sm text-fg-muted">Configurações do sistema</p>
      </div>

      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <h3 className="mb-3 text-xs font-semibold text-fg-muted">Informações do Sistema</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">Versão</span>
            <span className="text-xs font-medium text-fg">2.0.0</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">Usuário</span>
            <span className="text-xs font-medium text-fg">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">Role</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ROLE_COLORS[user?.role || 'viewer']}`}>
              {ROLE_LABELS[user?.role || 'viewer']}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <h3 className="mb-3 text-xs font-semibold text-fg-muted">Links Úteis</h3>
        <div className="space-y-2">
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg p-2 text-sm text-fg transition-colors hover:bg-input"
          >
            <icons.ui.external size={16} className="text-fg-muted" />
            Supabase Dashboard
          </a>
          <a
            href="https://github.com/vihisantos/LabHub"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg p-2 text-sm text-fg transition-colors hover:bg-input"
          >
            <icons.ui.external size={16} className="text-fg-muted" />
            GitHub Repository
          </a>
        </div>
      </div>
    </div>
  )
}
