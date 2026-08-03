import { useNavigate } from 'react-router-dom'
import { icons } from '../../lib/icons'
import type { AppNotification } from '../../core/notifications/types'

const SEVERITY_COLORS: Record<AppNotification['severity'], string> = {
  info: 'bg-blue-500/15 text-blue-500',
  warning: 'bg-amber-500/15 text-amber-500',
  critical: 'bg-red-500/15 text-red-500',
}

const TYPE_ICONS: Record<AppNotification['type'], React.ComponentType<{ size?: number }>> = {
  ticket: icons.ui.alertCircle,
  asset: icons.ui.package,
  maintenance: icons.nav.maintenance,
  system: icons.nav.settings,
  sync: icons.ui.refresh,
  approval: icons.ui.inbox,
}

interface NotificationItemProps {
  notification: AppNotification
  onRead: (id: string) => void
  onRemove: (id: string) => void
  onNavigate?: () => void
}

export function NotificationItem({ notification, onRead, onRemove, onNavigate }: NotificationItemProps) {
  const navigate = useNavigate()

  const Icon = TYPE_ICONS[notification.type] || icons.ui.inbox

  function handleClick() {
    if (!notification.read) onRead(notification.id)
    if (notification.actionUrl) {
      navigate(notification.actionUrl)
      onNavigate?.()
    }
  }

  return (
    <div
      className={`flex items-start gap-3 rounded-xl p-4 transition-colors hover:bg-input cursor-pointer ${
        !notification.read ? 'bg-amber-500/5' : ''
      }`}
      onClick={handleClick}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${SEVERITY_COLORS[notification.severity]}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-medium ${notification.read ? 'text-fg-muted' : 'text-fg'}`}>
            {notification.title}
          </p>
          {!notification.read && (
            <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          )}
        </div>
        <p className="mt-1 text-xs text-fg-dim">{notification.body}</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-[10px] text-fg-dim">
            {new Date(notification.createdAt).toLocaleString('pt-BR')}
          </span>
          <span className="rounded-md bg-input px-1.5 py-0.5 text-[9px] font-medium text-fg-muted">
            {notification.module}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        {!notification.read && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRead(notification.id) }}
            className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-input hover:text-fg"
            title="Marcar como lida"
          >
            <icons.ui.check size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(notification.id) }}
          className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
          title="Remover"
        >
          <icons.ui.trash size={14} />
        </button>
      </div>
    </div>
  )
}
