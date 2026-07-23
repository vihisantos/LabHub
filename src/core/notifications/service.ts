import type { AppNotification, NotificationFormData } from './types'
import { createSyncService } from '../../lib/sync'

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
    return service.create(serialize(data))
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

  clearAll: () => {
    const all = service.getAll()
    for (const n of all) {
      service.remove(n.id)
    }
  },
}
