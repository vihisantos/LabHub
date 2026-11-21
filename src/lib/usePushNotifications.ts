import { useState, useEffect, useCallback } from 'react'
import { hasPendingPushRecovery, recoverMissingPushSubscription } from './pushRecovery'

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
  /** Acceso por aplicativo. VAZIO por decisão de arquitetura (F2-D-N1): a
   * visibilidade não é mais transportada no payload de push, porque a matriz
   * RBAC2 é por workspace e este snapshot é global — não há representação fiel.
   * O campo permanece no contrato (e na tela de diagnóstico) por compatibilidade;
   * o targeting é resolvido no servidor (membership + role_permissions), nunca
   * aqui. Inscrições legadas no Redis ainda podem trazer os níveis antigos
   * ('full'/'read'/booleano) e eles NÃO concedem nada. Ver `buildPushUser`. */
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
 * Chave estável do payload de segmentação (apps/workspaces/preferências).
 * Mudou = o snapshot guardado no backend está velho e precisa ser reenviado.
 */
function userSegmentationKey(user?: PushUserInfo | null): string {
  if (!user) return ''
  return JSON.stringify({
    is_super_admin: user.is_super_admin ?? false,
    workspace_ids: user.workspace_ids ?? [],
    apps: user.apps ?? {},
    notify_settings: user.notify_settings ?? {},
  })
}

/**
 * Hook de push notifications.
 *
 * @param subscribeUrl  URL do endpoint POST de inscrição (ex.: '/api/push/subscribe').
 * @param user          Payload de segmentação do usuário (via buildPushUser).
 */
export function usePushNotifications(subscribeUrl = '/api/push/subscribe', user?: PushUserInfo | null) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [state, setState] = useState<PushState>({
    supported: null,
    permission: null,
    subscribed: false,
    loading: true,
    error: null,
  })

  const segmentationKey = userSegmentationKey(user)

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

  /**
   * Reenvia a inscrição quando a segmentação muda (cargo/acesso/workspaces/
   * preferências). O backend guarda um snapshot por endpoint: sem isto, quem
   * ganhou/perdeu acesso — ou entrou/saiu de um workspace — continuaria
   * recebendo conforme o snapshot antigo (ou deixando de receber).
   * Best-effort: falha não desativa a inscrição existente.
   */
  useEffect(() => {
    if (!segmentationKey || !user) return
    let cancelled = false

    async function refreshSubscriptionPayload() {
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (!subscription || cancelled) return

        const payload: Record<string, unknown> = { ...subscription.toJSON(), user }
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        try {
          const { defaultDb } = await import('./supabase')
          if (defaultDb) {
            const { data } = await defaultDb.auth.getSession()
            const token = data.session?.access_token
            if (token) headers['Authorization'] = `Bearer ${token}`
          }
        } catch {
          /* Sem sessão: segue sem header; o backend responde 401. */
        }

        await fetch(subscribeUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        })
      } catch {
        /* best-effort — o snapshot antigo permanece até o próximo subscribe */
      }
    }

    refreshSubscriptionPayload()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps — `segmentationKey` cobre os campos usados
  }, [segmentationKey, subscribeUrl])

  /**
   * Browser pode perder a inscrição mesmo com Notification.permission=granted
   * (ex.: limpeza de dados / atualização de service worker).
   * Na abertura, foco, visibilidade ou aviso do SW, recupera sem novo prompt.
   * Não recupera para visitantes sem sessão, permissões negadas ou iOS sem PWA.
   */
  useEffect(() => {
    const currentUser = user
    const recoveryUserId: string = currentUser?.id ?? ''
    if (!recoveryUserId || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (isIOSSafari() && !isStandalone()) return

    let active = true
    // Capturar a instância: testes e navegadores podem trocar navigator/SW
    // antes do cleanup deste effect.
    const serviceWorker = navigator.serviceWorker

    async function checkSubscription() {
      if (document.visibilityState === 'hidden') return
      const permission = Notification.permission
      if (permission !== 'granted') {
        if (active) setState((prev) => ({ ...prev, permission, subscribed: false }))
        return
      }
      try {
        const registration = await serviceWorker.ready
        if (!active) return
        const existing = await registration.pushManager.getSubscription()
        if (!active) return
        if (existing && !hasPendingPushRecovery(subscribeUrl, recoveryUserId)) {
          setState((prev) => ({ ...prev, permission, subscribed: true }))
          return
        }

        setState((prev) => ({ ...prev, permission, subscribed: false }))
        const recovered = await recoverMissingPushSubscription(subscribeUrl, currentUser, registration)
        if (!active) return
        setState((prev) => ({
          ...prev,
          permission: Notification.permission,
          subscribed: recovered,
        }))
      } catch {
        // Fail-closed: não confirmar inscrição sem persistência no backend.
        if (active) setState((prev) => ({ ...prev, subscribed: false }))
      }
    }

    const onFocus = () => { void checkSubscription() }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void checkSubscription()
    }
    const onWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'labhub:push-subscription-changed') void checkSubscription()
    }

    void checkSubscription()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    serviceWorker.addEventListener?.('message', onWorkerMessage)
    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      serviceWorker.removeEventListener?.('message', onWorkerMessage)
    }
    // Os campos de user são atualizados no snapshot quando a segmentação muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribeUrl, user?.id, segmentationKey])

  const subscribe = useCallback(async () => {
    if (state.supported === false) {
      setState((s) => ({ ...s, error: 'Push não suportado' }))
      return false
    }

    setState((s) => ({ ...s, loading: true, error: null }))

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState((s) => ({ ...s, permission, loading: false, subscribed: false }))
        return false
      }

      const registration = await ensureSw()

      // Recupera inscrição existente antes de criar uma nova
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
        if (!vapidKey) {
          setState((s) => ({ ...s, loading: false, error: 'VAPID key não configurada' }))
          return false
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
      return true
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Erro ao ativar notificações',
      }))
      return false
    }
  }, [subscribeUrl, user, state.supported])

  const testPush = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    setState((s) => ({ ...s, error: null }))
    try {
      const registration = await ensureSw()
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) throw new Error('Este dispositivo não tem uma inscrição Push ativa. Ative as notificações novamente.')

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      try {
        const { defaultDb } = await import('./supabase')
        if (defaultDb) {
          const { data } = await defaultDb.auth.getSession()
          const token = data.session?.access_token
          if (token) headers['Authorization'] = `Bearer ${token}`
        }
      } catch {
        // Sem sessão: o backend responde 401 sem revelar dados da inscrição.
      }

      const response = await fetch('/api/push/test-device', {
        method: 'POST',
        headers,
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error || `Falha no teste de Push (${response.status})`)
      setTestResult('Envio aceito pelo servidor. Confira se a notificação apareceu neste dispositivo.')
      return true
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : 'Falha ao testar notificações' }))
      return false
    } finally {
      setTesting(false)
    }
  }, [])

  return { ...state, subscribe, testPush, testing, testResult }
}
