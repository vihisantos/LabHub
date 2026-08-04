import { useCallback, useEffect, useState } from 'react'
import type { AppNotification, NotificationFormData } from './types'
import { notificationService } from './service'
import { authService } from '../auth/service'
import { workspaceStore } from '../workspaces/store'
import { notificationAppliesTo } from './visibility'
import type { User } from '../auth/types'

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [user, setUser] = useState<User | null>(() => authService.getCurrentUser())
  const [storeVersion, setStoreVersion] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    setNotifications(notificationService.getAll())
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    load()
    // Reload silencioso periódico — reflete notificações vindas do sync
    const timer = setInterval(() => load(true), 10000)
    return () => clearInterval(timer)
  }, [load])

  // Segue o usuário logado e o workspace ativo para re-aplicar o filtro
  useEffect(() => {
    const unsubAuth = authService.onAuthChange((u) => setUser(u))
    const unsubWs = workspaceStore.subscribe(() => setStoreVersion((v) => v + 1))
    return () => {
      unsubAuth()
      unsubWs()
    }
  }, [])

  void storeVersion

  const visibleNotifications = notifications.filter((n) => notificationAppliesTo(n, user))
  const unreadCount = visibleNotifications.filter((n) => !n.read).length

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
    notifications: visibleNotifications,
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
