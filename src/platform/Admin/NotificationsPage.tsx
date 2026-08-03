import { useNotifications } from '../../core/notifications/useNotifications'
import { icons } from '../../lib/icons'
import { NotificationItem } from '../NotificationCenter/NotificationItem'

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
