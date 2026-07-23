import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../core/auth/AuthContext'
import { useWorkspaces } from '../../../core/workspaces/useWorkspaces'
import { useLogs } from '../../../core/logs/useLogs'
import { useNotifications } from '../../../core/notifications/useNotifications'
import { icons } from '../../../lib/icons'

export function AdminDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { workspaces } = useWorkspaces()
  const { logs } = useLogs()
  const { unreadCount } = useNotifications()

  const recentLogs = useMemo(() => logs.slice(0, 5), [logs])

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-bold text-fg">Painel Admin</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {user?.role === 'admin' ? 'Acesso completo' : 'Acesso limitado'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold text-fg">{workspaces.length}</p>
              <p className="text-[10px] text-fg-muted">Workspaces</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
              <icons.ui.home size={18} />
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold text-fg">{logs.length}</p>
              <p className="text-[10px] text-fg-muted">Logs</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <icons.ui.fileBarChart size={18} />
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold text-amber-500">{unreadCount}</p>
              <p className="text-[10px] text-fg-muted">Notificações</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <icons.ui.inbox size={18} />
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold text-fg">1</p>
              <p className="text-[10px] text-fg-muted">Usuários</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
              <icons.ui.user size={18} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-card shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-xs font-semibold text-fg-muted">Atividade Recente</h3>
          <button
            type="button"
            onClick={() => navigate('/admin/logs')}
            className="text-xs font-medium text-slate-500 hover:text-slate-400"
          >
            Ver todos
          </button>
        </div>
        <div className="divide-y divide-line">
          {recentLogs.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-xs text-fg-muted">Nenhuma atividade</p>
            </div>
          ) : (
            recentLogs.map((log) => (
              <div key={log.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-input text-fg-muted">
                  <icons.ui.dot size={12} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-fg">
                    <span className="font-medium">{log.userName}</span>
                    {' '}{log.action}{' '}
                    <span className="text-fg-muted">{log.entityLabel}</span>
                  </p>
                  <p className="text-[10px] text-fg-dim">
                    {new Date(log.timestamp).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
