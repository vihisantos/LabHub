import { useCallback, useEffect, useState } from 'react'
import type { AppNotification, NotificationFormData } from './types'
import { notificationService } from './service'
import { authService } from '../auth/service'
import { workspaceStore } from '../workspaces/store'
import { notificationAppliesTo } from './visibility'
import type { User } from '../auth/types'

// ── Date grouping helpers ────────────────────────────────────────────────

function toDateKey(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const item = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = today.getTime() - item.getTime()
  if (diff < 86_400_000) return 'Hoje'
  if (diff < 86_400_000 * 2) return 'Ontem'
  if (diff < 86_400_000 * 7) return 'Esta semana'
  return 'Anteriores'
}

export type DateGroup = 'Hoje' | 'Ontem' | 'Esta semana' | 'Anteriores'
export const DATE_GROUP_ORDER: DateGroup[] = ['Hoje', 'Ontem', 'Esta semana', 'Anteriores']

export function groupByDate(items: AppNotification[]): Map<DateGroup, AppNotification[]> {
  const map = new Map<DateGroup, AppNotification[]>()
  for (const g of DATE_GROUP_ORDER) map.set(g, [])
  for (const n of items) {
    const key = toDateKey(n.createdAt)
    map.get(key as DateGroup)!.push(n)
  }
  return map
}

// ── Smart grouping: merge same ticket ────────────────────────────────────

export interface SmartGroupedNotification {
  notification: AppNotification
  count: number
  relatedIds: string[]
}

export function smartGroup(items: AppNotification[]): SmartGroupedNotification[] {
  const groups = new Map<string, AppNotification[]>()
  for (const n of items) {
    // Group by ticket id extracted from actionUrl, or fall back to title
    const ticketMatch = n.actionUrl?.match(/\/chamados\/tickets\/([^/]+)/)
    const key = ticketMatch ? `ticket:${ticketMatch[1]}` : `title:${n.title}`
    const arr = groups.get(key) || []
    arr.push(n)
    groups.set(key, arr)
  }
  return Array.from(groups.values()).map((arr) => {
    // Keep newest as primary
    arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return {
      notification: arr[0],
      count: arr.length,
      relatedIds: arr.map((n) => n.id),
    }
  })
}

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

  const snooze = useCallback((id: string, hours: number) => {
    notificationService.snooze(id, hours)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, snoozedUntil: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() } : n)))
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
    snooze,
    reload: load,
  }
}
