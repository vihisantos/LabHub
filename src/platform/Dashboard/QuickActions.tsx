import { useNavigate } from 'react-router-dom'
import { icons } from '../../lib/icons'

const actions = [
  {
    label: 'Escanear QR',
    icon: <icons.ui.scanBarcode size={18} />,
    route: '/chamados-publico',
    color: '#f59e0b',
  },
  {
    label: 'Novo Chamado',
    icon: <icons.ui.plus size={18} />,
    route: '/chamados',
    color: '#f59e0b',
  },
  {
    label: 'Inventário',
    icon: <icons.nav.pcs size={18} />,
    route: '/pc-care',
    color: '#8b5cf6',
  },
  {
    label: 'Estoque',
    icon: <icons.ui.package size={18} />,
    route: '/stock',
    color: '#10b981',
  },
]

export function QuickActions() {
  const navigate = useNavigate()

  return (
    <div>
      <p className="mb-3 px-1 text-xs font-semibold text-fg-muted">Ações Rápidas</p>
      <div className="grid grid-cols-4 gap-2">
        {actions.map((action) => (
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
