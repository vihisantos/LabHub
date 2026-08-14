import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../core/workspaces/WorkspaceContext'
import { isAppDisabled } from '../../core/workspaces/apps'
import { icons } from '../../lib/icons'

const actions = [
  {
    label: 'Escanear QR',
    icon: <icons.ui.scanBarcode size={18} />,
    route: '/chamados-publico/scan',
    color: '#f59e0b',
    appId: null as string | null,
  },
  {
    label: 'Reservas',
    icon: <icons.ui.flaskConical size={18} />,
    route: '/reservalab',
    color: '#6366f1',
    appId: 'reservalab',
  },
  {
    label: 'Inventário',
    icon: <icons.nav.pcs size={18} />,
    route: '/pc-care',
    color: '#8b5cf6',
    appId: 'pc-care',
  },
  {
    label: 'Estoque',
    icon: <icons.ui.package size={18} />,
    route: '/stock',
    color: '#10b981',
    appId: 'stock',
  },
]

export function QuickActions() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()

  const visible = actions.filter(
    (action) => !action.appId || !isAppDisabled(action.appId, workspace),
  )

  return (
    <div>
      <p className="mb-3 px-1 text-xs font-semibold text-fg-muted">Ações Rápidas</p>
      <div className="grid grid-cols-4 gap-2">
        {visible.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => navigate(action.route)}
            className="flex flex-col items-center gap-2 rounded-xl bg-card p-3 shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-elevated)] active:scale-[0.97]"
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: action.color + '15', color: action.color }}
            >
              {action.icon}
            </div>
            <span className="text-[10px] font-medium text-fg-muted">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}