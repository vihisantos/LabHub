import type { AppNotification, NotificationFormData } from './types'
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
