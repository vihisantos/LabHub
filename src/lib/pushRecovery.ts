import type { PushUserInfo } from './usePushNotifications'

/**
 * Recuperação idempotente de inscrição perdida, apenas para usuários logados
 * que JÁ concederam permissão. Nunca chama requestPermission().
 *
 * Lock compartilhado entre montagens do hook (Painel, Perfil, Chamados etc.).
 * Limite de três falhas por sessão + backoff protege Supabase/VAPID de loops.
 */
const RECOVERY_BACKOFF_MS = 15_000
const MAX_RECOVERY_ATTEMPTS = 3

type RecoveryState = { attempts: number; lastAttempt: number; needsSync: boolean; inFlight: Promise<boolean> | null }
const recoveries = new Map<string, RecoveryState>()

/** A pendência precisa sobreviver ao reinício do PWA: o browser pode ter
 * criado a subscription mas o backend nunca a recebeu. Guardar apenas a
 * indicação pendente, nunca endpoint, token ou chaves Web Push. */
function pendingKey(subscribeUrl: string, userId: string): string {
  return `labhub:push-sync-pending:v1:${encodeURIComponent(userId)}:${encodeURIComponent(subscribeUrl)}`
}

function pendingOnDevice(subscribeUrl: string, userId: string): boolean {
  try {
    return localStorage.getItem(pendingKey(subscribeUrl, userId)) === '1'
  } catch {
    return false
  }
}

function setPendingOnDevice(subscribeUrl: string, userId: string, pending: boolean): void {
  try {
    const key = pendingKey(subscribeUrl, userId)
    if (pending) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    // Storage indisponível: o estado em memória continua fail-closed.
  }
}

function vapidBytes(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

export function hasPendingPushRecovery(subscribeUrl: string, userId: string): boolean {
  return recoveries.get(JSON.stringify([userId, subscribeUrl]))?.needsSync === true
    || pendingOnDevice(subscribeUrl, userId)
}

export async function recoverMissingPushSubscription(
  subscribeUrl: string,
  user: PushUserInfo | null | undefined,
  registration: ServiceWorkerRegistration,
): Promise<boolean> {
  if (!user?.id || Notification.permission !== 'granted') return false

  const key = JSON.stringify([user.id, subscribeUrl])
  let state = recoveries.get(key)
  if (!state) {
    state = { attempts: 0, lastAttempt: 0, needsSync: pendingOnDevice(subscribeUrl, user.id), inFlight: null }
    recoveries.set(key, state)
  }
  if (state.inFlight) return state.inFlight
  if (state.attempts >= MAX_RECOVERY_ATTEMPTS) return false
  if (state.lastAttempt && Date.now() - state.lastAttempt < RECOVERY_BACKOFF_MS) return false

  const attempt = async () => {
    // Outra montagem pode ter recuperado esta mesma inscrição.
    let subscription = await registration.pushManager.getSubscription()
    if (subscription && !state.needsSync) return true

    // Nunca criar uma inscrição sem sessão: /api/push/subscribe exige JWT.
    const { defaultDb } = await import('./supabase')
    const session = defaultDb ? await defaultDb.auth.getSession() : null
    const token = session?.data?.session?.access_token
    if (!token) throw new Error('Sessão indisponível para recuperar notificações')
    if (Notification.permission !== 'granted') return false

    if (!subscription) {
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
      if (!vapidKey) throw new Error('VAPID não configurado')
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidBytes(vapidKey) as unknown as string,
      })
      // Se o POST falhar, a inscrição existe no browser mas não no servidor.
      // Guardamos esta pendência para retentar o POST no próximo foco.
      state.needsSync = true
      setPendingOnDevice(subscribeUrl, user.id, true)
    }
    const response = await fetch(subscribeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...subscription.toJSON(), user }),
    })
    if (!response.ok) {
      throw new Error(`Falha ao sincronizar inscrição Push (HTTP ${response.status})`)
    }
    state.needsSync = false
    setPendingOnDevice(subscribeUrl, user.id, false)
    state.attempts = 0
    return true
  }

  state.attempts += 1
  state.lastAttempt = Date.now()
  const promise = attempt()
  state.inFlight = promise
  try {
    return await promise
  } finally {
    if (state.inFlight === promise) state.inFlight = null
  }
}
