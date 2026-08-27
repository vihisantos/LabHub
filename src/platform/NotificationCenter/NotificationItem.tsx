import { useState } from 'react'
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

/** Extract userId from /admin/users?pending=<id> */
function extractPendingUserId(url?: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url, window.location.origin)
    return u.searchParams.get('pending')
  } catch {
    const m = url.match(/[?&]pending=([^&]+)/)
    return m ? m[1] : null
  }
}

interface NotificationItemProps {
  notification: AppNotification
  onRead: (id: string) => void
  onRemove: (id: string) => void
  onSnooze?: (id: string, hours: number) => void
  onApprove?: (userId: string) => void
  onReject?: (userId: string) => void
  onNavigate?: () => void
  index?: number
}

export function NotificationItem({
  notification,
  onRead,
  onRemove,
  onSnooze,
  onApprove,
  onReject,
  onNavigate,
  index = 0,
}: NotificationItemProps) {
  const navigate = useNavigate()
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false)
  const [approvalBusy, setApprovalBusy] = useState(false)

  const Icon = TYPE_ICONS[notification.type] || icons.ui.inbox
  const isMaintenance = notification.type === 'maintenance'
  const isApproval = notification.type === 'approval'
  const pendingUserId = isApproval ? extractPendingUserId(notification.actionUrl) : null
  const canApproveInline = isApproval && pendingUserId && onApprove && onReject
  const isSnoozed = notification.snoozedUntil && new Date(notification.snoozedUntil) > new Date()

  function handleClick() {
    if (isSnoozed || canApproveInline) return // don't navigate for snoozed or approval items
    if (!notification.read) onRead(notification.id)
    if (notification.actionUrl) {
      navigate(notification.actionUrl)
      onNavigate?.()
    }
  }

  async function handleApprove(e: React.MouseEvent) {
    e.stopPropagation()
    if (!pendingUserId || !onApprove) return
    setApprovalBusy(true)
    await onApprove(pendingUserId)
    setApprovalBusy(false)
  }

  async function handleReject(e: React.MouseEvent) {
    e.stopPropagation()
    if (!pendingUserId || !onReject) return
    setApprovalBusy(true)
    await onReject(pendingUserId)
    setApprovalBusy(false)
  }

  if (isSnoozed) {
    const until = new Date(notification.snoozedUntil!).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return (
      <div
        className="flex items-center gap-3 rounded-xl p-3 text-fg-dim opacity-50"
        style={{ animation: `slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) ${index * 40}ms both` }}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-input">
          <icons.ui.clock size={14} className="text-fg-dim" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-fg-dim line-through">{notification.title}</p>
          <p className="mt-0.5 text-[10px] text-fg-dim">Adiado até {until}</p>
        </div>
        {onSnooze && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSnooze(notification.id, 0) }}
            className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-input hover:text-fg"
            title="Cancelar adiamento"
          >
            <icons.ui.close size={12} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className={`relative flex items-start gap-3 rounded-xl p-4 transition-colors ${
        canApproveInline ? '' : 'hover:bg-input cursor-pointer'
      } ${!notification.read ? 'bg-amber-500/5' : ''}`}
      style={{ animation: `slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) ${index * 40}ms both` }}
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
        {/* Inline approve/reject for approval notifications */}
        {canApproveInline && (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={approvalBusy}
              className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-500 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {approvalBusy ? 'Aprovando…' : 'Aprovar'}
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={approvalBusy}
              className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/25 disabled:opacity-50"
            >
              {approvalBusy ? 'Recusando…' : 'Recusar'}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (notification.actionUrl) {
                  navigate(notification.actionUrl)
                  onNavigate?.()
                }
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-fg-dim transition-colors hover:bg-input hover:text-fg-muted"
            >
              Ver detalhes
            </button>
          </div>
        )}
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
        {isMaintenance && onSnooze && (
          <div className="relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowSnoozeMenu((v) => !v) }}
              className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-amber-500/10 hover:text-amber-500"
              title="Adiar"
            >
              <icons.ui.clock size={14} />
            </button>
            {showSnoozeMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowSnoozeMenu(false)} />
                <div className="absolute right-0 top-full z-30 mt-1 w-32 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-xl">
                  {[1, 4, 8, 24].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSnooze(notification.id, h)
                        setShowSnoozeMenu(false)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-fg transition-colors hover:bg-input"
                    >
                      {h === 1 ? '1 hora' : h === 24 ? '1 dia' : `${h} horas`}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
