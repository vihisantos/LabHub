import { useState } from 'react'
import { useAuth } from '../../../core/auth/AuthContext'
import { useNavigate } from 'react-router-dom'
import { roleBadgeClass } from '../../../core/permissions/types'
import { useRoles } from '../../../core/permissions/usePermissions'
import { wipeAllData } from '../../../lib/reset'
import { icons } from '../../../lib/icons'

export function SettingsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { roles } = useRoles()
  const currentRole = roles.find((r) => r.id === user?.roleId)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')

  const handleReset = async () => {
    if (!window.confirm('Zerar TODOS os dados? Esta ação é irreversível.')) return
    if (
      !window.confirm(
        'Confirmação final: stock, PC Care, chamados, salas, TV e demais dados serão apagados (local + Supabase). Workspaces, usuários e cargos ficam preservados. Continuar?',
      )
    )
      return
    setResetting(true)
    setResetError('')
    try {
      await wipeAllData()
      window.location.reload()
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Falha ao zerar os dados.')
      setResetting(false)
    }
  }

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
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${roleBadgeClass(currentRole)}`}>
              {currentRole?.name ?? 'Sem cargo'}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <h3 className="mb-3 text-xs font-semibold text-fg-muted">Gerenciamento</h3>
        <div className="space-y-2">
          {user?.is_super_admin && (
            <button
              type="button"
              onClick={() => navigate('/admin/workspaces')}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-sm text-fg transition-colors hover:bg-input"
            >
              <icons.ui.home size={16} className="text-fg-muted" />
              Workspaces
              <icons.ui.chevronRight size={14} className="ml-auto text-fg-muted" />
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/admin/roles')}
            className="flex w-full items-center gap-3 rounded-lg p-2 text-sm text-fg transition-colors hover:bg-input"
          >
            <icons.ui.sliders size={16} className="text-fg-muted" />
            Permissões
            <icons.ui.chevronRight size={14} className="ml-auto text-fg-muted" />
          </button>
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
            <icons.ui.link size={16} className="text-fg-muted" />
            Supabase Dashboard
          </a>
          <a
            href="https://github.com/vihisantos/LabHub"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg p-2 text-sm text-fg transition-colors hover:bg-input"
          >
            <icons.ui.link size={16} className="text-fg-muted" />
            GitHub Repository
          </a>
        </div>
      </div>

      {user?.is_super_admin && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <h3 className="mb-1 text-xs font-semibold text-red-600 dark:text-red-400">Zona de perigo</h3>
          <p className="mb-3 text-[11px] text-fg-muted">
            Apaga todos os dados operacionais (stock, PC Care, chamados, salas, TV) localmente e no Supabase.
            Workspaces, usuários e cargos são preservados.
          </p>
          <button
            type="button"
            disabled={resetting}
            onClick={handleReset}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <icons.ui.trash size={16} />
            {resetting ? 'Zerando dados...' : 'Zerar todos os dados'}
          </button>
          {resetError && (
            <p className="mt-2 text-[11px] text-red-500">{resetError}</p>
          )}
        </div>
      )}
    </div>
  )
}
