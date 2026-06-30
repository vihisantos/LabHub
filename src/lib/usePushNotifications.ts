import { useState, useEffect, useCallback } from 'react'

export interface PushAppConfig {
  id: string
  name: string
  subscribeUrl: string
  icon: string
}

interface PushState {
  supported: boolean | null
  permission: NotificationPermission | null
  subscribed: boolean
  loading: boolean
  error: string | null
}

const SW_PATH = '/push-sw.js'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

let swRegistration: ServiceWorkerRegistration | null = null

async function ensureSw(): Promise<ServiceWorkerRegistration> {
  if (swRegistration) return swRegistration
  swRegistration = await navigator.serviceWorker.register(SW_PATH)
  return swRegistration
}

export function usePushNotifications(apps: PushAppConfig[] = []) {
  const [state, setState] = useState<PushState>({
    supported: null,
    permission: null,
    subscribed: false,
    loading: true,
    error: null,
  })

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window
    setState((s) => ({
      ...s,
      supported,
      permission: supported ? Notification.permission : null,
      loading: false,
    }))
  }, [])

  const subscribe = useCallback(async () => {
    if (!state.supported) {
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

      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setState((s) => ({ ...s, loading: false, error: 'VAPID key não configurada' }))
        return
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as string,
      })

      const subJson = subscription.toJSON()

      for (const app of apps) {
        try {
          await fetch(app.subscribeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subJson),
          })
        } catch {
          console.warn(`Push subscribe failed for ${app.id}:`, app.subscribeUrl)
        }
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
  }, [apps, state.supported])

  return { ...state, subscribe }
}
