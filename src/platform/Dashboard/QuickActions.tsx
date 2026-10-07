import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../core/workspaces/WorkspaceContext'
import { useModuleVisibilities } from '../../core/permissions/useModuleVisibility'
import { isAppDisabled } from '../../core/workspaces/apps'
import { icons } from '../../lib/icons'

type QuickAction = {
  label: string
  icon: ReactNode
  route: string
  color: string
  appId: string | null
  /** Ação só aparece se este app não estiver desabilitado no workspace. */
  requiresAppId?: string
}

const actions: QuickAction[] = [
  {
    label: 'Novo Chamado',
    icon: <icons.ui.plus size={18} />,
    route: '/chamados-publico/new',
    color: '#f59e0b',
    appId: 'chamados',
  },
  {
    label: 'Reservas',
    icon: <icons.ui.flaskConical size={18} />,
    route: '/reservalab',
    color: '#6366f1',
    appId: 'reservalab',
  },
  {
    label: 'PC Care',
    icon: <icons.nav.pcs size={18} />,
    route: '/pc-care',
    color: '#8b5cf6',
    appId: 'pc-care',
  },
  {
    label: 'Pedir Música',
    icon: <icons.ui.music size={18} />,
    route: '/pedir-musica',
    color: '#ef4444',
    // Pedir Música não é um app do registry (a rota só exige login), mas só
    // faz sentido quando o campus TEM TV ligada: sem TV não há para onde o
    // pedido de música ir. Semântica do Launcher é a mesma.
    appId: null,
    requiresAppId: 'tv',
  },
]

export function QuickActions() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  // RBAC 2.0 (F2-D-L): visibilidade pela nova fonte, com o eixo
  // `disabled_apps` incluído (o legado usava `isModuleAvailable`, que já
  // combinava os dois eixos).
  const { isVisible } = useModuleVisibilities([
    'chamados',
    'reservalab',
    'pc-care',
    'stock',
  ])

  // `appId: null` (link público de novo chamado) continua visível para todos,
  // desde que o app não esteja desabilitado — como antes. `requiresAppId` é o
  // eixo que prende uma ação a um app do mesmo jeito que o workspace liga/desliga.
  const visible = actions.filter((action) => {
    if (action.requiresAppId) return !isAppDisabled(action.requiresAppId, workspace)
    if (!action.appId) return true
    if (action.appId === 'chamados') return !isAppDisabled(action.appId, workspace)
    return isVisible(action.appId)
  })

  return (
    <div>
      <p className="mb-3 px-1 text-xs font-semibold text-fg-muted">Ações Rápidas</p>
      <div className="grid grid-cols-4 gap-2">
        {visible.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => navigate(action.route)}
            className="flex flex-col items-center gap-2 rounded-xl bg-quick-card p-3 shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-elevated)] active:scale-[0.97]"
          >
            <div
              data-testid="quick-icon"
              aria-hidden="true"
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