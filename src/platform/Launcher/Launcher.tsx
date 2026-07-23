import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { appRegistry } from '../../appRegistry'
import { useNotifications } from '../../core/notifications/useNotifications'
import { WorkspaceSelector } from '../WorkspaceSelector/WorkspaceSelector'
import { icons } from '../../lib/icons'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function Launcher() {
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    setGreeting(getGreeting())
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    if (mq.matches) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  return (
    <div className="min-h-dvh bg-surface text-fg">
      <div className="mx-auto max-w-lg px-5 pt-8 pb-8">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-fg">{greeting}</h1>
              <WorkspaceSelector />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/admin/notifications')}
                className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-card text-fg-dim transition-colors hover:bg-input hover:text-fg"
              >
                <icons.ui.inbox size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })
                  document.dispatchEvent(event)
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-card text-fg-dim transition-colors hover:bg-input hover:text-fg"
              >
                <icons.ui.search size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Quick Actions */}
        <div className="mb-6">
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => navigate('/chamados-publico')}
              className="flex flex-col items-center gap-1.5 rounded-xl bg-card p-3 shadow-sm transition-all active:scale-95"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                <icons.ui.scanBarcode size={18} />
              </div>
              <span className="text-[10px] font-medium text-fg-muted">Escanear</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/chamados')}
              className="flex flex-col items-center gap-1.5 rounded-xl bg-card p-3 shadow-sm transition-all active:scale-95"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                <icons.ui.alertCircle size={18} />
              </div>
              <span className="text-[10px] font-medium text-fg-muted">Chamados</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/pc-care/pcs/new')}
              className="flex flex-col items-center gap-1.5 rounded-xl bg-card p-3 shadow-sm transition-all active:scale-95"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
                <icons.ui.plus size={18} />
              </div>
              <span className="text-[10px] font-medium text-fg-muted">Novo Ativo</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/logs')}
              className="flex flex-col items-center gap-1.5 rounded-xl bg-card p-3 shadow-sm transition-all active:scale-95"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                <icons.ui.fileBarChart size={18} />
              </div>
              <span className="text-[10px] font-medium text-fg-muted">Logs</span>
            </button>
          </div>
        </div>

        {/* Apps */}
        <div className="mb-6">
          <p className="mb-3 px-1 text-xs font-semibold text-fg-muted">Módulos</p>
          <div className="space-y-2">
            {appRegistry.map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() => navigate(app.route)}
                className="flex w-full items-center gap-4 rounded-xl bg-card p-4 text-left shadow-sm transition-all active:scale-[0.98]"
              >
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: app.color + '15', color: app.color }}
                >
                  <app.icon size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-fg">{app.name}</h2>
                  <p className="mt-0.5 text-[11px] text-fg-muted leading-snug truncate">{app.description}</p>
                </div>
                <icons.ui.chevronRight size={16} className="shrink-0 text-fg-muted" />
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center">
          <button
            type="button"
            onClick={() => navigate('/roadmap')}
            className="text-xs font-medium text-emerald-500 hover:text-emerald-400 transition-colors"
          >
            Roadmap
          </button>
          <p className="mt-1 text-[10px] text-fg-dim">LabHub v2.0</p>
        </footer>
      </div>
    </div>
  )
}
