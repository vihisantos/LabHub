import type {
  AppNotification,
  NotificationFormData,
  NotificationType,
  NotificationSeverity,
  NotificationAudience,
} from './types'
import { createLocalService } from '../../lib/storage'
import { currentUserCollectionKey } from '../../lib/cacheNamespace'
import { getCol, setCol } from '../../lib/db'

const cacheKey = () => currentUserCollectionKey('notifications')
const dismissedKey = () => currentUserCollectionKey('notification-dismissed')
const readKey = () => currentUserCollectionKey('notification-read')
const localEventKey = () => currentUserCollectionKey('notification-local-events')
const service = createLocalService<AppNotification>('notifications', true, cacheKey)

// Read identity is independent of the bounded cache window. Never clear it
// when a server row temporarily disappears, is reconciled, or the user logs out.
function rememberIds(key: string | null, ids: string[]) {
  if (!key || ids.length === 0) return
  const values = new Set(getCol<string>(key))
  const before = values.size
  for (const id of ids) if (id) values.add(id)
  if (values.size !== before) setCol(key, [...values])
}

function rememberRead(ids: string[]) {
  rememberIds(readKey(), ids)
}

function isRead(id: string): boolean {
  const key = readKey()
  return !!key && getCol<string>(key).includes(id)
}

function rememberDismissed(ids: string[]) {
  const key = dismissedKey()
  if (!key) return
  const dismissed = new Set(getCol<string>(key))
  for (const id of ids) dismissed.add(id)
  setCol(key, [...dismissed])
}


function serialize(data: NotificationFormData): AppNotification {
  return {
    ...data,
    id: crypto.randomUUID(),
    read: false,
    createdAt: new Date().toISOString(),
  }
}

/** Converte uma linha do backend (app_notifications, snake_case) em AppNotification. */
export function appNotificationFromRow(row: Record<string, unknown>): AppNotification {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    type: (row.type as NotificationType) || 'system',
    severity: (row.severity as NotificationSeverity) || 'info',
    module: String(row.module ?? ''),
    audience: (row.audience as NotificationAudience) || undefined,
    targetRole: row.target_role ? String(row.target_role) : undefined,
    targetSuperAdmin: row.target_super_admin === true ? true : undefined,
    workspace_id: row.workspace_id ? String(row.workspace_id) : undefined,
    targetUserId: row.target_user_id ? String(row.target_user_id) : undefined,
    actionUrl: row.action_url ? String(row.action_url) : undefined,
    createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
    read: false,
  }
}

export const notificationService = {
  getAll: () => [...service.getAll()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  getAllAcrossWorkspaces: () => [...service.getAll(true)],

  getById: (id: string) => service.getById(id),

  getUnread: () => service.query((n) => !n.read),

  getUnreadCount: () => service.query((n) => !n.read).length,

  create: (data: NotificationFormData) => {
    const item = serialize(data)
    // Sem workspace_id explícito = notificação global (todos os workspaces).
    // Inserção direta para evitar o stamping automático do workspace ativo.
    if (!data.workspace_id) {
      const key = cacheKey()
      if (key) setCol(key, [...getCol<AppNotification>(key), item])
      return item
    }
    return service.create(item)
  },

  /** Insere uma notificação vinda do servidor sem marcar como nova criação local.
   *  Retorna true se foi inserida (dedupe por id). */
  ingestRemote: (item: AppNotification): boolean => {
    const key = cacheKey()
    const dismissed = dismissedKey()
    if (!key || !dismissed || !item.id || getCol<string>(dismissed).includes(item.id)) return false
    const items = getCol<AppNotification>(key)
    if (items.some((n) => n.id === item.id)) return false
    setCol(key, [...items, { ...item, read: item.read || isRead(item.id) }])
    if (item.read) rememberRead([item.id])
    return true
  },

  /** The latest authorized server window replaces operational bell rows.
   * Keep local alerts and legacy records; do not create dismissal tombstones
   * when a permission change or bounded server window removes an item. */
  reconcilePeriodic: (authorizedIds: Set<string>): boolean => {
    const key = cacheKey()
    if (!key) return false
    const items = getCol<AppNotification>(key)
    const next = items.filter(n => !n.id.startsWith('periodic:') || authorizedIds.has(n.id))
    if (next.length === items.length) return false
    rememberRead(items.filter(n => n.read).map(n => n.id))
    setCol(key, next)
    return true
  },

  markAsRead: (id: string) => {
    const item = service.getById(id)
    if (!item) return undefined
    rememberRead([id])
    return item.read ? item : service.update(id, { read: true })
  },

  markAllAsRead: () => {
    const unread = service.query((n) => !n.read)
    rememberRead(unread.map(n => n.id))
    for (const n of unread) {
      service.update(n.id, { read: true })
    }
  },

  hasLocalEvent: (event: string): boolean => {
    const key = localEventKey()
    return !!key && getCol<string>(key).includes(event)
  },

  rememberLocalEvent: (event: string) => rememberIds(localEventKey(), [event]),

  remove: (id: string) => {
    if (service.getById(id)?.read) rememberRead([id])
    const removed = service.remove(id)
    if (removed) rememberDismissed([id])
    return removed
  },

  snooze: (id: string, hours: number) => {
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    return service.update(id, { snoozedUntil: until })
  },

  clearAll: () => {
    const all = service.getAll()
    rememberRead(all.filter(n => n.read).map(n => n.id))
    rememberDismissed(all.map(n => n.id))
    for (const n of all) {
      service.remove(n.id)
    }
  },
}
