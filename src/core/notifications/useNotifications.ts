import { useCallback, useEffect, useState } from 'react'
import type { AppNotification, NotificationFormData } from './types'
import { notificationService } from './service'

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = notificationService.getAll()
    setNotifications(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const unreadCount = notifications.filter((n) => !n.read).length

  const create = useCallback((data: NotificationFormData) => {
    const notification = notificationService.create(data)
    setNotifications((prev) => [notification, ...prev])
    return notification
  }, [])

  const markAsRead = useCallback((id: string) => {
    notificationService.markAsRead(id)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }, [])

  const markAllAsRead = useCallback(() => {
    notificationService.markAllAsRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const remove = useCallback((id: string) => {
    notificationService.remove(id)
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    notificationService.clearAll()
    setNotifications([])
  }, [])

  return {
    notifications,
    unreadCount,
    loading,
    create,
    markAsRead,
    markAllAsRead,
    remove,
    clearAll,
    reload: load,
  }
}
