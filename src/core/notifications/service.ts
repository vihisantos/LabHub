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
const service = createLocalService<AppNotification>('notifications', true, cacheKey)

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
    setCol(key, [...items, item])
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
    setCol(key, next)
    return true
  },

  markAsRead: (id: string) => {
    return service.update(id, { read: true })
  },

  markAllAsRead: () => {
    const unread = service.query((n) => !n.read)
    for (const n of unread) {
      service.update(n.id, { read: true })
    }
  },

  remove: (id: string) => {
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
    rememberDismissed(all.map(n => n.id))
    for (const n of all) {
      service.remove(n.id)
    }
  },
}
