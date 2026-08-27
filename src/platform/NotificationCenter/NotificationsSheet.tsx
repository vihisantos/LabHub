import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { useNotifications } from '../../core/notifications/useNotifications'
import { adminService } from '../../core/auth/adminService'
import { icons } from '../../lib/icons'
import { BottomSheet, SheetHeader } from '../ui/BottomSheet'
import { NotificationItem } from './NotificationItem'
import type { AppNotification, NotificationType } from '../../core/notifications/types'
import {
  groupByDate,
  smartGroup,
  DATE_GROUP_ORDER,
  type DateGroup,
} from '../../core/notifications/useNotifications'

// ── Section labels / icons ───────────────────────────────────────────────

const TYPE_LABELS: Record<NotificationType, string> = {
  ticket: 'Chamados',
  approval: 'Aprovações',
  asset: 'Ativos',
  maintenance: 'Manutenção',
  system: 'Sistema',
  sync: 'Sincronização',
}

const TYPE_ICONS: Record<NotificationType, React.ComponentType<{ size?: number }>> = {
  ticket: icons.ui.alertCircle,
  approval: icons.ui.inbox,
  asset: icons.ui.package,
  maintenance: icons.nav.maintenance,
  system: icons.nav.settings,
  sync: icons.ui.refresh,
}

const DATE_ICONS: Record<DateGroup, React.ComponentType<{ size?: number }>> = {
  'Hoje': icons.ui.alertCircle,
  'Ontem': icons.ui.inbox,
  'Esta semana': icons.ui.package,
  'Anteriores': icons.ui.refresh,
}

// ── Sound for critical notifications ─────────────────────────────────────

function playCriticalSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
  } catch { /* AudioContext not available */ }
}

// ── Collapsible section ──────────────────────────────────────────────────

interface CollapsibleSectionProps {
  label: string
  icon?: React.ComponentType<{ size?: number }>
  items: AppNotification[]
  onRead: (id: string) => void
  onRemove: (id: string) => void
  onSnooze?: (id: string, hours: number) => void
  onApprove?: (userId: string) => void
  onReject?: (userId: string) => void
  onNavigate?: () => void
}

function CollapsibleSection({ label, icon: IconProp, items, onRead, onRemove, onSnooze, onApprove, onReject, onNavigate }: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(true)
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | 'auto'>(expanded ? 'auto' : 0)

  const measure = useCallback(() => {
    if (contentRef.current) setHeight(contentRef.current.scrollHeight)
  }, [])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure, items.length])

  useEffect(() => {
    if (expanded) {
      setHeight(contentRef.current?.scrollHeight ?? 0)
      const t = setTimeout(() => setHeight('auto'), 200)
      return () => clearTimeout(t)
    } else {
      setHeight(contentRef.current?.scrollHeight ?? 0)
      requestAnimationFrame(() => setHeight(0))
    }
  }, [expanded])

  const SectionIcon = IconProp || icons.ui.inbox
  const unreadInSection = items.filter((n) => !n.read).length

  return (
    <div className="mb-4 last:mb-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="sticky top-0 z-10 flex w-full items-center gap-2 bg-surface py-2 text-left transition-colors hover:bg-input/50"
      >
        <icons.ui.chevronRight
          size={12}
          className={`shrink-0 text-fg-dim transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
        <SectionIcon size={13} className="text-fg-muted" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
          {label}
        </span>
        <span className="rounded-full bg-input px-1.5 py-0.5 text-[10px] font-medium text-fg-dim">
          {items.length}
        </span>
        {unreadInSection > 0 && (
          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
            {unreadInSection} nova{unreadInSection !== 1 ? 's' : ''}
          </span>
        )}
      </button>
      <div
        className="overflow-hidden transition-[height] duration-200 ease-in-out"
        style={{ height: height === 'auto' ? 'auto' : `${height}px` }}
      >
        <div ref={contentRef} className="space-y-1 pt-1">
          {items.map((n, i) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onRead={onRead}
              onRemove={onRemove}
              onSnooze={onSnooze}
              onApprove={onApprove}
              onReject={onReject}
              onNavigate={onNavigate}
              index={i}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main sheet ───────────────────────────────────────────────────────────

type ViewMode = 'type' | 'date'

interface NotificationsSheetProps {
  open: boolean
  onClose: () => void
}

export function NotificationsSheet({ open, onClose }: NotificationsSheetProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, remove, clearAll, snooze, reload } = useNotifications()
  const [viewMode, setViewMode] = useState<ViewMode>('type')
  const prevUnreadRef = useRef(unreadCount)
  const [approving, setApproving] = useState(false)

  const handleApprove = useCallback(async (userId: string) => {
    setApproving(true)
    const ok = await adminService.approveUser(userId)
    if (ok) reload()
    setApproving(false)
  }, [reload])

  const handleReject = useCallback(async (userId: string) => {
    setApproving(true)
    const ok = await adminService.rejectUser(userId)
    if (ok) reload()
    setApproving(false)
  }, [reload])

  // Sound + vibration on new critical notification
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      const newest = notifications.find((n) => !n.read && n.severity === 'critical')
      if (newest) {
        playCriticalSound()
        try { navigator.vibrate?.([100, 50, 100]) } catch { /* noop */ }
      }
    }
    prevUnreadRef.current = unreadCount
  }, [unreadCount, notifications])

  // Auto mark-as-read after 5s when sheet is open
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      for (const n of notifications) {
        if (!n.read) markAsRead(n.id)
      }
    }, 5000)
    return () => clearTimeout(t)
  }, [open, notifications, markAsRead])

  // Filter out snoozed notifications
  const visible = useMemo(
    () => notifications.filter((n) => !n.snoozedUntil || new Date(n.snoozedUntil) <= new Date()),
    [notifications],
  )

  // Smart grouped (merges same-ticket items)
  const smart = useMemo(() => smartGroup(visible), [visible])

  // Flat list of notifications after smart grouping (for rendering)
  const flat = useMemo(() => smart.map((g) => g.notification), [smart])

  // Group by type or date
  const typeGrouped = useMemo(() => {
    const map = new Map<NotificationType, AppNotification[]>()
    for (const n of flat) {
      const arr = map.get(n.type) || []
      arr.push(n)
      map.set(n.type, arr)
    }
    return map
  }, [flat])

  const dateGrouped = useMemo(() => groupByDate(flat), [flat])

  return (
    <BottomSheet open={open} onClose={onClose}>
      <SheetHeader
        title="Notificações"
        subtitle={`${unreadCount} não lida${unreadCount !== 1 ? 's' : ''}`}
        onClose={onClose}
        hideClose
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

      {/* View mode toggle */}
      <div className="flex gap-1 px-5 pb-2">
        <button
          type="button"
          onClick={() => setViewMode('type')}
          className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
            viewMode === 'type'
              ? 'bg-amber-500/15 text-amber-500'
              : 'text-fg-dim hover:bg-input hover:text-fg-muted'
          }`}
        >
          Por tipo
        </button>
        <button
          type="button"
          onClick={() => setViewMode('date')}
          className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
            viewMode === 'date'
              ? 'bg-amber-500/15 text-amber-500'
              : 'text-fg-dim hover:bg-input hover:text-fg-muted'
          }`}
        >
          Por data
        </button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {flat.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <icons.ui.inbox size={48} className="text-fg-muted" />
            <p className="mt-4 text-sm text-fg-muted">Nenhuma notificação</p>
            <p className="mt-1 text-xs text-fg-dim">Notificações aparecerão aqui</p>
          </div>
        ) : (
          <div className="px-5 pb-5">
            {viewMode === 'type'
              ? Array.from(typeGrouped.entries())
                  .filter(([, items]) => items.length > 0)
                  .map(([type, items]) => (
                    <CollapsibleSection
                      key={type}
                      label={TYPE_LABELS[type] || type}
                      icon={TYPE_ICONS[type]}
                      items={items}
                      onRead={markAsRead}
                      onRemove={remove}
                      onSnooze={snooze}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onNavigate={onClose}
                    />
                  ))
              : DATE_GROUP_ORDER.map((group) => {
                  const items = dateGrouped.get(group) || []
                  if (items.length === 0) return null
                  return (
                    <CollapsibleSection
                      key={group}
                      label={group}
                      icon={DATE_ICONS[group]}
                      items={items}
                      onRead={markAsRead}
                      onRemove={remove}
                      onSnooze={snooze}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onNavigate={onClose}
                    />
                  )
                })}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
