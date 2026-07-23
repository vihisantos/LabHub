import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../core/notifications/useNotifications'
import { icons } from '../../lib/icons'
import type { AppNotification } from '../../core/notifications/types'

function NotificationItem({ notification, onRead, onRemove }: {
  notification: AppNotification
  onRead: (id: string) => void
  onRemove: (id: string) => void
}) {
  const navigate = useNavigate()

  const severityColors = {
    info: 'bg-blue-500/15 text-blue-500',
    warning: 'bg-amber-500/15 text-amber-500',
    critical: 'bg-red-500/15 text-red-500',
  }

  const typeIcons = {
    ticket: icons.ui.alertCircle,
    asset: icons.ui.package,
    maintenance: icons.nav.maintenance,
    system: icons.nav.settings,
    sync: icons.ui.refresh,
  }

  const Icon = typeIcons[notification.type] || icons.ui.inbox

  function handleClick() {
    if (!notification.read) onRead(notification.id)
    if (notification.actionUrl) {
      navigate(notification.actionUrl)
    }
  }

  return (
    <div
      className={`flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-input cursor-pointer ${
        !notification.read ? 'bg-amber-500/5' : ''
      }`}
      onClick={handleClick}
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${severityColors[notification.severity]}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-medium ${notification.read ? 'text-fg-muted' : 'text-fg'}`}>
          {notification.title}
        </p>
        <p className="mt-0.5 text-[11px] text-fg-dim line-clamp-2">{notification.body}</p>
        <p className="mt-1 text-[10px] text-fg-dim">
          {new Date(notification.createdAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      {!notification.read && (
        <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(notification.id) }}
        className="shrink-0 rounded-lg p-1 text-fg-dim opacity-0 transition-opacity hover:bg-input hover:text-fg group-hover:opacity-100"
      >
        <icons.ui.close size={12} />
      </button>
    </div>
  )
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const { notifications, unreadCount, markAsRead, markAllAsRead, remove, clearAll } = useNotifications()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-card text-fg-dim transition-colors hover:bg-input hover:text-fg"
      >
        <icons.ui.inbox size={20} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl bg-card border border-line shadow-2xl overflow-hidden z-50">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-sm font-semibold text-fg">Notificações</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="rounded-lg px-2 py-1 text-[10px] font-medium text-amber-500 hover:bg-amber-500/10"
                >
                  Marcar todas
                </button>
              )}
              <button
                type="button"
                onClick={clearAll}
                className="rounded-lg px-2 py-1 text-[10px] font-medium text-fg-dim hover:bg-input"
              >
                Limpar
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <icons.ui.inbox size={32} className="mx-auto text-fg-muted" />
                <p className="mt-2 text-xs text-fg-muted">Nenhuma notificação</p>
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onRead={markAsRead}
                  onRemove={remove}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
