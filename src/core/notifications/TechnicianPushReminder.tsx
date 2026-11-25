import { useSuppressStartupPrompts } from '../../platform/Onboarding/onboardingState'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useActiveWorkspaceRole } from '../permissions/useActiveWorkspaceRole'
import { usePushNotifications } from '../../lib/usePushNotifications'
import { buildPushUser } from '../../lib/buildPushUser'
import { icons } from '../../lib/icons'

const REMINDER_VERSION = 'v1'
const SNOOZE_MS = 24 * 60 * 60 * 1000

function storageKeys(userId: string) {
  return {
    acknowledged: `labhub:push-activation:${REMINDER_VERSION}:${userId}`,
    snoozedUntil: `labhub:push-activation-snooze:${REMINDER_VERSION}:${userId}`,
  }
}

function readStorage(userId?: string) {
  if (!userId || typeof localStorage === 'undefined') {
    return { userId: userId ?? null, acknowledged: false, snoozedUntil: 0 }
  }
  try {
    const keys = storageKeys(userId)
    return {
      userId,
      acknowledged: localStorage.getItem(keys.acknowledged) === '1',
      snoozedUntil: Number(localStorage.getItem(keys.snoozedUntil) || 0),
    }
  } catch {
    return { userId, acknowledged: false, snoozedUntil: 0 }
  }
}

function browserSettingsUrl(): string {
  if (typeof navigator === 'undefined') return 'https://support.google.com/chrome/answer/114662'
  const ua = navigator.userAgent || ''
  if (/Firefox\//.test(ua)) return 'https://support.mozilla.org/pt-BR/kb/gerenciar-permissoes-de-notificacao'
  if (/Edg\//.test(ua)) return 'https://support.microsoft.com/pt-br/microsoft-edge/gerenciar-notificações'
  if (/CriOS\//.test(ua)) return 'https://support.google.com/chrome/answer/114662'
  if (/Safari\//.test(ua)) return 'https://support.apple.com/pt-br/guide/safari/ibrwe2159f50/mac'
  return 'https://support.google.com/chrome/answer/114662'
}

/**
 * Aviso temporário de reativação do Push para técnicos com membership ativa
 * no workspace selecionado. A confirmação é por dispositivo e usuário.
 */
export function TechnicianPushReminder() {
  const suppressStartupPrompts = useSuppressStartupPrompts()
  const { user } = useAuth()
  const { isTechnician, loading: roleLoading } = useActiveWorkspaceRole()
  const pushUser = useMemo(() => (user ? buildPushUser(user) : null), [user])
  const {
    supported,
    permission,
    subscribed,
    loading: pushLoading,
    error,
    subscribe,
  } = usePushNotifications('/api/push/subscribe', pushUser)

  const [storageState, setStorageState] = useState(() => readStorage())
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    setStorageState(readStorage(user?.id))
  }, [user?.id])

  const storageMatchesUser = !!user?.id && storageState.userId === user.id
  const acknowledged = storageMatchesUser && storageState.acknowledged
  const snoozedUntil = storageMatchesUser ? storageState.snoozedUntil : 0
  const snoozed = snoozedUntil > Date.now()
  const denied = permission === 'denied'

  useEffect(() => {
    if (!snoozedUntil || snoozedUntil <= Date.now()) return
    const timer = window.setTimeout(() => {
      setStorageState((current) => ({
        ...current,
        snoozedUntil: 0,
      }))
    }, snoozedUntil - Date.now())
    return () => window.clearTimeout(timer)
  }, [snoozedUntil])

  if (
    suppressStartupPrompts ||
    !user ||
    !isTechnician ||
    roleLoading ||
    pushLoading ||
    !supported ||
    (acknowledged && permission === 'granted' && subscribed) ||
    snoozed
  ) {
    return null
  }

  const handleActivate = async () => {
    if (denied || !user.id) return
    setActivating(true)
    const success = await subscribe()
    if (success) {
      const keys = storageKeys(user.id)
      try {
        localStorage.setItem(keys.acknowledged, '1')
        localStorage.removeItem(keys.snoozedUntil)
      } catch {
        // A inscrição foi atualizada no servidor; só a confirmação visual não persistirá.
      }
      setStorageState({
        userId: user.id,
        acknowledged: true,
        snoozedUntil: 0,
      })
    }
    setActivating(false)
  }

  const handleSnooze = () => {
    if (!user.id) return
    const until = Date.now() + SNOOZE_MS
    try {
      localStorage.setItem(storageKeys(user.id).snoozedUntil, String(until))
    } catch {
      // O estado em memória ainda esconde o aviso nesta sessão.
    }
    setStorageState({
      userId: user.id,
      acknowledged: false,
      snoozedUntil: until,
    })
  }

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Reativar notificações do LabHub"
      data-testid="technician-push-reminder"
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-[210] mx-auto max-w-xl rounded-2xl border border-amber-500/30 bg-card p-4 shadow-[var(--shadow-elevated)]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
          <icons.ui.bellRing size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-fg">
            {denied ? 'As notificações estão bloqueadas neste navegador' : 'Reative as notificações do LabHub'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            {denied
              ? 'Libere as notificações nas configurações do site. Depois, volte ao LabHub para reconectar este dispositivo.'
              : 'Os avisos de novos chamados, atribuições e atualizações da TI chegam por Push. Ative neste dispositivo para não perder chamados aguardando atendimento.'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {denied ? (
          <a
            href={browserSettingsUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-500"
          >
            <icons.ui.sliders size={14} />
            Como liberar no navegador
          </a>
        ) : (
          <button
            type="button"
            onClick={() => void handleActivate()}
            disabled={activating}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {activating ? 'Ativando…' : permission === 'granted' && subscribed ? 'Confirmar e reconectar' : 'Ativar notificações'}
          </button>
        )}
        <button
          type="button"
          onClick={handleSnooze}
          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-fg-muted transition-colors hover:bg-input hover:text-fg"
        >
          Lembrar mais tarde
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </aside>
  )
}
