import { useNavigate } from 'react-router-dom'
import { useHealth } from '../../core/health/useHealth'
import { useNotifications } from '../../core/notifications/useNotifications'
import { useWorkspace } from '../../core/workspaces/WorkspaceContext'
import { MetricCard } from './MetricCard'
import { ModuleStats } from './ModuleStats'
import { QuickActions } from './QuickActions'
import { ActivityFeed } from './ActivityFeed'
import { icons } from '../../lib/icons'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { metrics } = useHealth()
  const { unreadCount } = useNotifications()
  const { workspace } = useWorkspace()

  return (
    <div className="min-h-dvh bg-surface text-fg">
      <div className="mx-auto max-w-lg px-5 pt-8 pb-8">
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-fg">{getGreeting()}, Vitor</h1>
              <p className="text-sm text-fg-muted">{workspace?.name || 'LabHub'}</p>
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

        {metrics && (
          <div className="mb-6 grid grid-cols-2 gap-3">
            <MetricCard
              label="Total de Ativos"
              value={metrics.totalAssets}
              icon={<icons.ui.package size={20} />}
              color="#8b5cf6"
            />
            <MetricCard
              label="Chamados Abertos"
              value={metrics.openTickets}
              icon={<icons.ui.alertCircle size={20} />}
              color="#f59e0b"
            />
            <MetricCard
              label="Computadores"
              value={metrics.computersOnline}
              icon={<icons.nav.pcs size={20} />}
              color="#10b981"
            />
            <MetricCard
              label="Críticos"
              value={metrics.criticalTickets}
              icon={<icons.ui.alertTriangle size={20} />}
              color="#ef4444"
            />
          </div>
        )}

        <div className="mb-6">
          <QuickActions />
        </div>

        <div className="mb-6">
          <ModuleStats />
        </div>

        <div className="mb-6">
          <ActivityFeed limit={8} />
        </div>

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
