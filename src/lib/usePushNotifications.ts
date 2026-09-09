import { useState, useEffect, useCallback } from 'react'

export interface PushNotifyChannelSettings {
  inapp?: boolean
  push?: boolean
}

export interface PushUserInfo {
  id: string
  name: string
  role: string
  /** Admin absoluto — recebe de todos os workspaces/apps */
  is_super_admin?: boolean
  /** Workspaces do usuário — usado para filtrar por workspace no backend */
  workspace_ids?: string[]
  /** Acesso resolvido por aplicativo (cargo + override) — usado para segmentar por módulo.
   * Valor = nível efetivo ('dash' | 'read' | 'full') ou `false` quando sem acesso.
   * Inscrições legadas enviadas antes desta mudança podem conter booleano `true`/`false`. */
  apps?: Record<string, boolean | string>
  /** Preferências manuais (mudo / canais por app) — respeitadas no envio */
  notify_settings?: {
    muted?: boolean
    apps?: Partial<Record<string, PushNotifyChannelSettings>>
  }
}

interface PushState {
  supported: boolean | null
  permission: NotificationPermission | null
  subscribed: boolean
  loading: boolean
  error: string | null
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function isIOSSafari(): boolean {
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || ('standalone' in navigator && (navigator as Record<string, unknown>).standalone === true)
  } catch {
    return false
  }
}

let swRegistration: ServiceWorkerRegistration | null = null

async function ensureSw(): Promise<ServiceWorkerRegistration> {
  if (swRegistration) return swRegistration
  swRegistration = await navigator.serviceWorker.ready
  return swRegistration
}

/**
 * Hook de push notifications.
 *
 * @param subscribeUrl  URL do endpoint POST de inscrição (ex.: '/api/push/subscribe').
 * @param user          Payload de segmentação do usuário (via buildPushUser).
 */
export function usePushNotifications(subscribeUrl = '/api/push/subscribe', user?: PushUserInfo | null) {
  const [state, setState] = useState<PushState>({
    supported: null,
    permission: null,
    subscribed: false,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function detect() {
      const hasSW = 'serviceWorker' in navigator
      const hasPush = 'PushManager' in window

      // iOS Safari: push só funciona em PWA instalada (standalone)
      if (isIOSSafari() && !isStandalone()) {
        if (!cancelled) {
          setState({ supported: false, permission: null, subscribed: false, loading: false, error: null })
        }
        return
      }

      const supported = hasSW && hasPush
      const permission = supported ? Notification.permission : null

      // Se já existe uma subscription, marca como subscribed
      let subscribed = false
      if (supported) {
        try {
          const registration = await navigator.serviceWorker.ready
          const existing = await registration.pushManager.getSubscription()
          subscribed = !!existing
        } catch {
          /*SW não pronto ainda*/
        }
      }

      if (!cancelled) {
        setState({ supported, permission, subscribed, loading: false, error: null })
      }
    }

    detect()
    return () => { cancelled = true }
  }, [])

  const subscribe = useCallback(async () => {
    if (state.supported === false) {
      setState((s) => ({ ...s, error: 'Push não suportado' }))
      return
    }

    setState((s) => ({ ...s, loading: true, error: null }))

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState((s) => ({ ...s, permission, loading: false, subscribed: false }))
        return
      }

      const registration = await ensureSw()

      // Recupera inscrição existente antes de criar uma nova
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
        if (!vapidKey) {
          setState((s) => ({ ...s, loading: false, error: 'VAPID key não configurada' }))
          return
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as string,
        })
      }

      // Um único POST para o backend (dedupe por endpoint no servidor)
      // O backend exige JWT (@require_auth): a identidade vem do token, não do body.
      const payload: Record<string, unknown> = { ...subscription.toJSON() }
      if (user) payload.user = user

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      try {
        const { defaultDb } = await import('./supabase')
        if (defaultDb) {
          const { data } = await defaultDb.auth.getSession()
          const token = data.session?.access_token
          if (token) headers['Authorization'] = `Bearer ${token}`
        }
      } catch {
        // Sem sessão: segue sem header; o backend responde 401.
      }

      const res = await fetch(subscribeUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        throw new Error(`Falha ao registrar notificações (${res.status})`)
      }

      setState((s) => ({
        ...s,
        permission: 'granted',
        subscribed: true,
        loading: false,
        error: null,
      }))
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Erro ao ativar notificações',
      }))
    }
  }, [subscribeUrl, user, state.supported])

  return { ...state, subscribe }
}
