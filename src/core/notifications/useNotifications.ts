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
import { recordNotificationSync } from './notificationSyncMetrics'
import { subscribeNotificationInvalidation } from './notificationRealtime'

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
const EVENT_COALESCE_MS = 250
const RECONCILE_INTERVAL_MS = 300_000
const listeners = new Set<NotifyListener>()
let refCount = 0
let intervalId: ReturnType<typeof setInterval> | null = null
let currentUser: User | null = authService.getCurrentUser()
let pollInFlight: Promise<void> | null = null
let cancelledGlobal = false
// Invalida respostas assíncronas iniciadas sob outra sessão/identidade.
let authGeneration = 0
let eventTimer: ReturnType<typeof setTimeout> | null = null
let refreshAfterFlight = false
let lastAttemptAt = 0
let lastSuccessAt = 0
let realtimeConnected = false
let disposeRealtime: (() => void) | null = null

let version = 0

function notifyListeners() {
  version++
  for (const l of listeners) l()
}

async function pollRemoteOnce(reason: 'poll' | 'event' = 'poll'): Promise<void> {
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
      lastAttemptAt = Date.now()
      recordNotificationSync(reason)
      const res = await fetch('/api/app-notifications', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (cancelledGlobal || generation !== authGeneration || !currentUser) return
      if (!res.ok) { lastSuccessAt = 0; recordNotificationSync('failure'); return }
      const payload = await res.json()
      if (cancelledGlobal || generation !== authGeneration || !currentUser) return
      if (!Array.isArray(payload?.notifications)) { lastSuccessAt = 0; recordNotificationSync('failure'); return }
      const rows = payload.notifications as Record<string, unknown>[]
      // Only reconcile on a valid server response; failures preserve offline cache.
      if (rows.some(row => !row || typeof row.id !== 'string' || !row.id)) {
        lastSuccessAt = 0
        recordNotificationSync('failure')
        return
      }
      let changed = payload.periodic_window === true
        ? notificationService.reconcilePeriodic(new Set(rows.map(row => String(row.id))))
        : false
      for (const row of rows) {
        // Sessão pode mudar enquanto a resposta está sendo processada.
        if (cancelledGlobal || generation !== authGeneration || !currentUser) return
        if (notificationService.ingestRemote(appNotificationFromRow(row))) changed = true
      }
      lastSuccessAt = Date.now()
      recordNotificationSync('success')
      if (changed) {
        notifyListeners()
      }
    } catch {
      if (!cancelledGlobal && generation === authGeneration) {
        lastSuccessAt = 0
        recordNotificationSync('failure')
      }
      // falha de rede não afeta o sino
    }
  })()

  pollInFlight = run
  try {
    await run
  } finally {
    // Uma execução antiga não pode limpar a referência de uma nova sessão.
    if (pollInFlight === run) {
      pollInFlight = null
      if (refreshAfterFlight && generation === authGeneration && !cancelledGlobal) {
        refreshAfterFlight = false
        requestNotificationRefresh()
      }
    }
  }
}

function tick() {
  if (realtimeConnected && lastSuccessAt && Date.now() - lastSuccessAt < RECONCILE_INTERVAL_MS) {
    recordNotificationSync('avoidedPoll')
    return
  }
  void pollRemoteOnce()
}

/** Invalidation is a hint only; content always comes from the authenticated API. */
export function requestNotificationRefresh() {
  if (cancelledGlobal || refCount === 0 || !currentUser || !navigator.onLine) return
  if (pollInFlight) {
    refreshAfterFlight = true
    recordNotificationSync('coalesced')
    return
  }
  if (eventTimer !== null) {
    recordNotificationSync('coalesced')
    return
  }
  const generation = authGeneration
  eventTimer = setTimeout(() => {
    eventTimer = null
    if (generation !== authGeneration || cancelledGlobal) return
    if (pollInFlight) {
      refreshAfterFlight = true
      return
    }
    void pollRemoteOnce('event')
  }, EVENT_COALESCE_MS)
}

function onServiceWorkerMessage(event: MessageEvent) {
  if (event.data?.type === 'labhub:notifications-changed') requestNotificationRefresh()
}

function onVisible() {
  if (document.visibilityState === 'visible' && Date.now() - lastAttemptAt >= POLL_INTERVAL_MS) {
    requestNotificationRefresh()
  }
}

function stopRealtime() {
  disposeRealtime?.()
  disposeRealtime = null
  realtimeConnected = false
}

function startRealtime() {
  stopRealtime()
  if (!currentUser || currentUser.status !== 'active' || cancelledGlobal) return
  const generation = authGeneration
  disposeRealtime = subscribeNotificationInvalidation(currentUser.id, () => {
    if (generation === authGeneration && !cancelledGlobal) requestNotificationRefresh()
  }, connected => {
    if (generation !== authGeneration || cancelledGlobal) return
    const wasConnected = realtimeConnected
    realtimeConnected = connected
    // On subscription/reconnection, reconcile the gap before reducing polling.
    if (connected || wasConnected) requestNotificationRefresh()
  })
}

function clearEventState() {
  if (eventTimer !== null) clearTimeout(eventTimer)
  eventTimer = null
  refreshAfterFlight = false
  lastAttemptAt = 0
  lastSuccessAt = 0
}

function startGlobal() {
  if (intervalId !== null) return
  cancelledGlobal = false
  // Initial poll
  void pollRemoteOnce()
  startRealtime()
  intervalId = setInterval(tick, POLL_INTERVAL_MS)
  window.addEventListener('online', requestNotificationRefresh)
  document.addEventListener('visibilitychange', onVisible)
  navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage)
}

function stopGlobal() {
  cancelledGlobal = true
  authGeneration++
  pollInFlight = null
  clearEventState()
  stopRealtime()
  window.removeEventListener('online', requestNotificationRefresh)
  document.removeEventListener('visibilitychange', onVisible)
  navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage)
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
  const sameIdentity = currentUser?.id === u?.id && currentUser?.status === u?.status
  currentUser = u
  if (sameIdentity) return
  authGeneration++
  clearEventState()
  // Libera o single-flight antigo: uma sessão nova não deve esperar a resposta
  // pendente da sessão anterior. A resposta antiga será descartada pela geração.
  pollInFlight = null
  // Logout invalidates the previous subscription as well as pending responses.
  stopRealtime()
  if (u && refCount > 0) {
    void pollRemoteOnce()
    startRealtime()
  }
  notifyListeners()
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
  const [user, setUser] = useState<User | null>(() => currentUser ?? authService.getCurrentUser())
  const [storeVersion, setStoreVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const sharedVersion = useSyncExternalStore(subscribe, getSnapshot)

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    setStoreVersion(v => v + 1)
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
    refCount++
    if (refCount === 1) {
      currentUser = authService.getCurrentUser()
      startGlobal()
    }
    return () => {
      refCount = Math.max(0, refCount - 1)
      if (refCount === 0) stopGlobal()
    }
  }, [])

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
  // Read the current identity's cache on every render, never retain another
  // account's notification array in component state during auth transitions.
  const sessionUser = authService.getCurrentUser()
  const visibleNotifications = sessionUser && user?.id === sessionUser.id
    ? notificationService.getAll().filter(n => notificationAppliesTo(n, sessionUser, isVisible))
    : []
  const unreadCount = visibleNotifications.filter((n) => !n.read).length

  const create = useCallback((data: NotificationFormData) => {
    const notification = notificationService.create(data)
    notifyListeners()
    return notification
  }, [])

  const markAsRead = useCallback((id: string) => {
    notificationService.markAsRead(id)
    notifyListeners()
  }, [])

  const markAllAsRead = useCallback(() => {
    notificationService.markAllAsRead()
    notifyListeners()
  }, [])

  const remove = useCallback((id: string) => {
    notificationService.remove(id)
    notifyListeners()
  }, [])

  const clearAll = useCallback(() => {
    notificationService.clearAll()
    notifyListeners()
  }, [])

  const snooze = useCallback((id: string, hours: number) => {
    notificationService.snooze(id, hours)
    notifyListeners()
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
