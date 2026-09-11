import type {
  AppNotification,
  NotificationFormData,
  NotificationType,
  NotificationSeverity,
  NotificationAudience,
} from './types'
import { createSyncService, markDirty } from '../../lib/sync'
import { getCol, setCol } from '../../lib/db'

const service = createSyncService<AppNotification>('notifications')

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
  getAll: () => service.getAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

  getById: (id: string) => service.getById(id),

  getUnread: () => service.query((n) => !n.read),

  getUnreadCount: () => service.query((n) => !n.read).length,

  create: (data: NotificationFormData) => {
    const item = serialize(data)
    // Sem workspace_id explícito = notificação global (todos os workspaces).
    // Inserção direta para evitar o stamping automático do workspace ativo.
    if (!data.workspace_id) {
      const items = getCol<AppNotification>('notifications')
      items.push(item)
      setCol('notifications', items)
      markDirty('notifications')
      return item
    }
    return service.create(item)
  },

  /** Insere uma notificação vinda do servidor sem marcar como nova criação local.
   *  Retorna true se foi inserida (dedupe por id). */
  ingestRemote: (item: AppNotification): boolean => {
    const items = getCol<AppNotification>('notifications')
    if (items.some((n) => n.id === item.id)) return false
    items.push(item)
    setCol('notifications', items)
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

  remove: (id: string) => service.remove(id),

  snooze: (id: string, hours: number) => {
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    return service.update(id, { snoozedUntil: until })
  },

  clearAll: () => {
    const all = service.getAll()
    for (const n of all) {
      service.remove(n.id)
    }
  },
}
