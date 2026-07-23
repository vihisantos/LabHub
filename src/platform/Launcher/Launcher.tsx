import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { appRegistry } from '../../appRegistry'
import { useHealth } from '../../core/health/useHealth'
import { useNotifications } from '../../core/notifications/useNotifications'
import { WorkspaceSelector } from '../WorkspaceSelector/WorkspaceSelector'
import { icons } from '../../lib/icons'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function HealthCard({ metrics }: { metrics: ReturnType<typeof useHealth>['metrics'] }) {
  if (!metrics) return null

  return (
    <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
      <p className="mb-3 text-xs font-semibold text-fg-muted">Infraestrutura</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xl font-bold text-fg">{metrics.totalAssets}</p>
          <p className="text-[10px] text-fg-muted">ativos</p>
        </div>
        <div>
          <p className="text-xl font-bold text-amber-500">{metrics.openTickets}</p>
          <p className="text-[10px] text-fg-muted">chamados abertos</p>
        </div>
        <div>
          <p className="text-xl font-bold text-emerald-500">{metrics.computersOnline}</p>
          <p className="text-[10px] text-fg-muted">computadores</p>
        </div>
        <div>
          <p className="text-xl font-bold text-red-500">{metrics.criticalTickets}</p>
          <p className="text-[10px] text-fg-muted">críticos</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        <div className={`h-2 w-2 rounded-full ${
          metrics.syncStatus === 'ok' ? 'bg-emerald-500' :
          metrics.syncStatus === 'syncing' ? 'bg-amber-500 animate-pulse' :
          'bg-red-500'
        }`} />
        <span className="text-[10px] text-fg-muted">
          {metrics.syncStatus === 'ok' ? 'Sincronizado' :
           metrics.syncStatus === 'syncing' ? 'Sincronizando...' :
           'Offline'}
        </span>
      </div>
    </div>
  )
}

export function Launcher() {
  const navigate = useNavigate()
  const { metrics } = useHealth()
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
      <div className="mx-auto max-w-lg px-5 pt-10 pb-8">
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-fg">{greeting}, Vitor</h1>
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

        <HealthCard metrics={metrics} />

        <div className="mt-6">
          <p className="mb-3 px-1 text-xs font-semibold text-fg-muted">Aplicativos</p>
          <div className="grid grid-cols-2 gap-3">
            {appRegistry.map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() => navigate(app.route)}
                className="group flex flex-col items-center gap-3 rounded-2xl bg-card p-5 text-center shadow-[var(--shadow-card)] transition-all duration-300 hover:shadow-[var(--shadow-elevated)] active:scale-[0.97]"
              >
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300"
                  style={{ backgroundColor: app.color + '15', color: app.color }}
                >
                  <app.icon size={24} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-fg">{app.name}</h2>
                  <p className="mt-0.5 text-[10px] text-fg-muted leading-relaxed">{app.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <footer className="mt-8 text-center">
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
