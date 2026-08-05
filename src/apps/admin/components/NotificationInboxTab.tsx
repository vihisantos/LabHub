import { useNotifications } from '../../../core/notifications/useNotifications'
import { NotificationItem } from '../../../platform/NotificationCenter/NotificationItem'
import { icons } from '../../../lib/icons'

export function NotificationInboxTab() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, remove, clearAll } = useNotifications()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <div>
          <h3 className="text-sm font-bold text-fg">Caixa de entrada</h3>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            {unreadCount} não lida{unreadCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="rounded-lg bg-input px-3 py-2 text-xs font-medium text-fg transition-colors hover:bg-card-hover"
            >
              Marcar todas
            </button>
          )}
          <button
            type="button"
            onClick={clearAll}
            className="rounded-lg bg-input px-3 py-2 text-xs font-medium text-fg-dim transition-colors hover:bg-card-hover"
          >
            Limpar
          </button>
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl bg-card p-12">
          <icons.ui.inbox size={40} className="text-fg-muted" />
          <p className="mt-3 text-sm text-fg-muted">Nenhuma notificação</p>
          <p className="mt-1 text-xs text-fg-dim">Notificações aparecerão aqui</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <NotificationItem key={n.id} notification={n} onRead={markAsRead} onRemove={remove} />
          ))}
        </div>
      )}
    </div>
  )
}
