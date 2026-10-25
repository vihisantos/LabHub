import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { AppNotification, NotificationFormData } from './types'
import { notificationService, appNotificationFromRow } from './service'
import { authService } from '../auth/service'
import { defaultDb } from '../../lib/supabase'
import { workspaceStore } from '../workspaces/store'
import { notificationAppliesTo } from './visibility'
import { useModuleVisibilities } from '../permissions/useModuleVisibility'
import { appRegistry } from '../../appRegistry'
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
    // Group by ticket id extracted from actionUrl, or fall back to title.
    // `[^/?]+` — ignora query string (ex.: /chamados/tickets/123?sla=near)
    // para que alertas de SLA agrupem com o mesmo chamado.
    const ticketMatch = n.actionUrl?.match(/\/chamados\/tickets\/([^/?]+)/)
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

// ── Shared runtime to avoid redundant polling across multiple hook instances ──

type NotifyListener = () => void

const POLL_INTERVAL_MS = 10000
const listeners = new Set<NotifyListener>()
let refCount = 0
let intervalId: ReturnType<typeof setInterval> | null = null
let currentUser: User | null = authService.getCurrentUser()
let pollInFlight: Promise<void> | null = null
let cancelledGlobal = false
// Invalida respostas assíncronas iniciadas sob outra sessão/identidade.
let authGeneration = 0

let version = 0

function notifyListeners() {
  version++
  for (const l of listeners) l()
}

async function pollRemoteOnce(): Promise<void> {
  if (pollInFlight) return pollInFlight
  if (cancelledGlobal) return
  if (!currentUser) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return

  const generation = authGeneration
  const run = (async () => {
    try {
      if (!defaultDb) return
      const { data } = await defaultDb.auth.getSession()
      const token = data.session?.access_token
      if (!token || cancelledGlobal || generation !== authGeneration || !currentUser) return
      const res = await fetch('/api/app-notifications', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok || cancelledGlobal || generation !== authGeneration || !currentUser) return
      const payload = await res.json()
      if (cancelledGlobal || generation !== authGeneration || !currentUser) return
      const rows = (payload?.notifications ?? []) as Record<string, unknown>[]
      let changed = false
      for (const row of rows) {
        // Sessão pode mudar enquanto a resposta está sendo processada.
        if (cancelledGlobal || generation !== authGeneration || !currentUser) return
        if (notificationService.ingestRemote(appNotificationFromRow(row))) changed = true
      }
      if (changed) {
        notifyListeners()
      }
    } catch {
      // falha de rede não afeta o sino
    }
  })()

  pollInFlight = run
  try {
    await run
  } finally {
    // Uma execução antiga não pode limpar a referência de uma nova sessão.
    if (pollInFlight === run) pollInFlight = null
  }
}

function tick() {
  void pollRemoteOnce()
}

function startGlobal() {
  if (intervalId !== null) return
  cancelledGlobal = false
  // Initial poll
  void pollRemoteOnce()
  intervalId = setInterval(tick, POLL_INTERVAL_MS)
}

function stopGlobal() {
  cancelledGlobal = true
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function subscribe(listener: NotifyListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => version

// Keep user in sync
authService.onAuthChange((u) => {
  currentUser = u
  authGeneration++
  // Libera o single-flight antigo: uma sessão nova não deve esperar a resposta
  // pendente da sessão anterior. A resposta antiga será descartada pela geração.
  pollInFlight = null
  // Logout invalida também qualquer resposta pendente; login troca para a nova sessão.
  if (u && refCount > 0) void pollRemoteOnce()
})

/**
 * Apenas para testes: reseta o runtime compartilhado do polling.
 */
export function __resetNotificationsPollingForTests() {
  stopGlobal()
  listeners.clear()
  refCount = 0
  currentUser = null
  authGeneration++
  pollInFlight = null
  cancelledGlobal = true
  version = 0
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [user, setUser] = useState<User | null>(() => currentUser ?? authService.getCurrentUser())
  const [storeVersion, setStoreVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const sharedVersion = useSyncExternalStore(subscribe, getSnapshot)

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    setNotifications(notificationService.getAll())
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    load()
    // Reload silencioso periódico — reflete notificações vindas do sync/local changes
    const timer = setInterval(() => load(true), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [load])

  // Recarrega o estado local quando o poll compartilhado insere notificações novas.
  useEffect(() => {
    if (sharedVersion > 0) load(true)
  }, [sharedVersion, load])

  // Polling do servidor compartilhado: UMA execução por app/aba, não uma por
  // instância do hook. Sem isso, cada componente que usa o sino (até ~10)
  // disparava seu próprio GET /api/app-notifications a cada 10 s.
  useEffect(() => {
    currentUser = user
    refCount++
    if (refCount === 1) startGlobal()
    return () => {
      refCount = Math.max(0, refCount - 1)
      if (refCount === 0) stopGlobal()
    }
  }, [user])

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

  // RBAC 2.0 (F2-D-L): a visibilidade de módulo vem da nova fonte, resolvida UMA
  // vez por render e injetada no filtro puro. O parâmetro é obrigatório, então
  // não há caminho de volta para `Role.appAccess`/`profiles.app_access`.
  const { isVisible } = useModuleVisibilities(
    appRegistry.map((app) => app.id),
    { ignoreDisabledApps: true },
  )
  const visibleNotifications = notifications.filter((n) => notificationAppliesTo(n, user, isVisible))
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
