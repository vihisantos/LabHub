import { useState, useEffect, useCallback, useRef } from 'react'

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
  /** Recuperação automática de inscrição perdida */
  recoveryPending: boolean
  recoveryError: string | null
  recoveryAttempts: number
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

/* ── Lock de concorrência compartilhado entre todas as instâncias ──
 *
 * Existe em nível de módulo para que múltiplas instâncias do hook
 * (Painel, Perfil, Card de Chamados, etc.) não disparem POSTs simultâneos
 * para a mesma subscription. Uma recuperação em andamento é reutilizada
 * pelas demais instâncias.
 */
let recoveryLock = false
let lastRecoveryTimestamp = 0
let recoveryAttemptsTotal = 0

const RECOVERY_BACKOFF_MS = 5000
const MAX_RECOVERY_ATTEMPTS = 3

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
 * Executa a recuperação automática de uma inscrição perdida.
 *
 * Regras:
 * - Só roda se Notification.permission === 'granted'.
 * - Não chama Notification.requestPermission().
 * - Consulta getSubscription() antes de criar nova inscrição.
 * - Envia POST /api/push/subscribe (mesmo contrato do subscribe manual).
 * - Só marca subscribed = true após confirmação de sucesso do backend.
 * - Usa lock compartilhado + backoff para evitar loops e duplicidade.
 */
async function attemptRecovery(
  subscribeUrl: string,
  user: PushUserInfo | null | undefined,
  setState: (fn: (prev: PushState) => PushState) => void,
  attemptsRef: React.MutableRefObject<number>,
): Promise<void> {
  if (recoveryLock) return
  if (recoveryAttemptsTotal >= MAX_RECOVERY_ATTEMPTS) return

  const now = Date.now()
  if (now - lastRecoveryTimestamp < RECOVERY_BACKOFF_MS) return

  recoveryLock = true
  lastRecoveryTimestamp = now
  recoveryAttemptsTotal += 1
  attemptsRef.current = recoveryAttemptsTotal

  setState((prev) => ({
    ...prev,
    recoveryPending: true,
    recoveryError: null,
    recoveryAttempts: recoveryAttemptsTotal,
  }))

  try {
    if (Notification.permission !== 'granted') {
      setState((prev) => ({
        ...prev,
        recoveryPending: false,
        recoveryError: 'Permissão não concedida',
      }))
      return
    }

    const registration = await navigator.serviceWorker.ready

    // Consulta novamente antes de criar: pode ter aparecido entre verificações
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setState((prev) => ({
          ...prev,
          recoveryPending: false,
          recoveryError: 'VAPID key não configurada',
        }))
        return
      }
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as string,
      })
    }

    // Monta payload idêntico ao subscribe manual
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
      /* Sem sessão: segue sem header; o backend responde 401. */
    }

    const res = await fetch(subscribeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      throw new Error(`Falha ao sincronizar inscrição (${res.status})`)
    }

    // Confirmação efetiva da persistência no backend (Redis)
    setState((prev) => ({
      ...prev,
      subscribed: true,
      recoveryPending: false,
      recoveryError: null,
      loading: false,
      error: null,
      permission: 'granted',
    }))
  } catch (err) {
    setState((prev) => ({
      ...prev,
      recoveryPending: false,
      recoveryError: err instanceof Error ? err.message : 'Erro na recuperação',
      loading: false,
    }))
  } finally {
    recoveryLock = false
  }
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
    recoveryPending: false,
    recoveryError: null,
    recoveryAttempts: 0,
  })

  const segmentationKey = userSegmentationKey(user)
  const attemptsRef = useRef(0)
  const cancelledRef = useRef(false)

  /* ── Detecção inicial ── */
  useEffect(() => {
    cancelledRef.current = false

    async function detect() {
      const hasSW = 'serviceWorker' in navigator
      const hasPush = 'PushManager' in window

      // iOS Safari: push só funciona em PWA instalada (standalone)
      if (isIOSSafari() && !isStandalone()) {
        if (!cancelledRef.current) {
          setState({ supported: false, permission: null, subscribed: false, loading: false, error: null, recoveryPending: false, recoveryError: null, recoveryAttempts: 0 })
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
          /* SW não pronto ainda */
        }
      }

      if (!cancelledRef.current) {
        setState({
          supported,
          permission,
          subscribed,
          loading: false,
          error: null,
          recoveryPending: false,
          recoveryError: null,
          recoveryAttempts: 0,
        })
      }
    }

    detect()
    return () => {
      cancelledRef.current = true
    }
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
    cancelledRef.current = false

    async function refreshSubscriptionPayload() {
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (!subscription || cancelledRef.current) return

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
    return () => {
      cancelledRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps — `segmentationKey` cobre os campos usados
  }, [segmentationKey, subscribeUrl])

  /**
   * Verificação de perda de inscrição quando o aplicativo retorna ao
   * primeiro plano (visibilitychange / focus).
   *
   * Não depende exclusivamente de pushsubscriptionchange. Se a permissão
   * estiver concedida e não houver subscription, dispara a recuperação
   * automática.
   */
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    let mounted = true

    async function checkVisibility() {
      if (mounted && cancelledRef.current) return
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        const permission = Notification.permission

        if (mounted && !cancelledRef.current) {
          setState((prev) => {
            const nowSubscribed = !!subscription
            const changed = prev.subscribed !== nowSubscribed || prev.permission !== permission
            if (!changed) return prev
            return { ...prev, subscribed: nowSubscribed, permission }
          })
        }

        // Recuperação automática: permission granted + sem subscription
        if (
          mounted &&
          !cancelledRef.current &&
          permission === 'granted' &&
          !subscription &&
          !recoveryLock
        ) {
          void attemptRecovery(subscribeUrl, user, setState, attemptsRef)
        }
      } catch {
        /* Silencioso — não bloqueia a UI. */
      }
    }

    const handleVisibilityChange = () => { void checkVisibility() }
    const handleFocus = () => { void checkVisibility() }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    // Verifica também na montagem deste efeito
    void checkVisibility()

    return () => {
      mounted = false
      cancelledRef.current = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribeUrl])

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

  return {
    ...state,
    subscribe,
    /** Dispara manualmente a recuperação automática (ex.: botão de retry). */
    attemptRecovery: () => void attemptRecovery(subscribeUrl, user, setState, attemptsRef),
  }
}
