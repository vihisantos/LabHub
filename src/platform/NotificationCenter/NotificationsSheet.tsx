import { useNotifications } from '../../core/notifications/useNotifications'
import { icons } from '../../lib/icons'
import { BottomSheet, SheetHeader } from '../ui/BottomSheet'
import { NotificationItem } from './NotificationItem'

interface NotificationsSheetProps {
  open: boolean
  onClose: () => void
}

export function NotificationsSheet({ open, onClose }: NotificationsSheetProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, remove, clearAll } = useNotifications()

  return (
    <BottomSheet open={open} onClose={onClose}>
      <SheetHeader
        title="Notificações"
        subtitle={`${unreadCount} não lida${unreadCount !== 1 ? 's' : ''}`}
        onClose={onClose}
      >
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
      </SheetHeader>

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <icons.ui.inbox size={48} className="text-fg-muted" />
            <p className="mt-4 text-sm text-fg-muted">Nenhuma notificação</p>
            <p className="mt-1 text-xs text-fg-dim">Notificações aparecerão aqui</p>
          </div>
        ) : (
          <div className="space-y-2 px-5 pb-5">
            {notifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onRead={markAsRead}
                onRemove={remove}
                onNavigate={onClose}
              />
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
