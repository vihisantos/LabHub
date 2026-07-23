import { useNotifications } from '../../core/notifications/useNotifications'
import { icons } from '../../lib/icons'
import type { AppNotification } from '../../core/notifications/types'

function NotificationItem({ notification, onRead, onRemove }: {
  notification: AppNotification
  onRead: (id: string) => void
  onRemove: (id: string) => void
}) {
  const severityColors = {
    info: 'bg-blue-500/15 text-blue-500',
    warning: 'bg-amber-500/15 text-amber-500',
    critical: 'bg-red-500/15 text-red-500',
  }

  const typeIcons: Record<string, React.ReactNode> = {
    ticket: <icons.ui.alertCircle size={16} />,
    asset: <icons.ui.package size={16} />,
    maintenance: <icons.nav.maintenance size={16} />,
    system: <icons.nav.settings size={16} />,
    sync: <icons.ui.refresh size={16} />,
  }

  return (
    <div
      className={`flex items-start gap-3 rounded-xl p-4 transition-colors hover:bg-input ${
        !notification.read ? 'bg-amber-500/5' : ''
      }`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${severityColors[notification.severity]}`}>
        {typeIcons[notification.type] || <icons.ui.inbox size={16} />}
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
            onClick={() => onRead(notification.id)}
            className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-input hover:text-fg"
            title="Marcar como lida"
          >
            <icons.ui.check size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(notification.id)}
          className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
          title="Remover"
        >
          <icons.ui.trash size={14} />
        </button>
      </div>
    </div>
  )
}

export function NotificationsPage() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, remove, clearAll } = useNotifications()

  return (
    <div className="min-h-dvh bg-surface text-fg">
      <div className="mx-auto max-w-lg px-5 pt-8 pb-8">
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-fg">Notificações</h1>
              <p className="text-sm text-fg-muted">{unreadCount} não lida{unreadCount !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="rounded-lg bg-card px-3 py-2 text-xs font-medium text-fg transition-colors hover:bg-input"
                >
                  Marcar todas
                </button>
              )}
              <button
                type="button"
                onClick={clearAll}
                className="rounded-lg bg-card px-3 py-2 text-xs font-medium text-fg-dim transition-colors hover:bg-input"
              >
                Limpar
              </button>
            </div>
          </div>
        </header>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <icons.ui.inbox size={48} className="text-fg-muted" />
            <p className="mt-4 text-sm text-fg-muted">Nenhuma notificação</p>
            <p className="mt-1 text-xs text-fg-dim">Notificações aparecerão aqui</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onRead={markAsRead}
                onRemove={remove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
