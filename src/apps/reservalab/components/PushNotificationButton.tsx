import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { usePushNotifications } from '../../../lib/usePushNotifications'
import { useAuth } from '../../../core/auth/AuthContext'
import { permissionService } from '../../../core/permissions/service'
import { appRegistry } from '../../../appRegistry'
import { icons } from '../../../lib/icons'

const DISMISS_KEY = 'labhub_push_prompt_dismissed'

function browserSettingsUrl(): string | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent || ''
  if (/Firefox\//.test(ua)) return 'https://support.mozilla.org/pt-BR/kb/gerenciar-permissoes-de-notificacao'
  if (/Edg\//.test(ua)) return 'https://support.microsoft.com/pt-br/microsoft-edge/gerenciar-notificações'
  if (/CriOS\//.test(ua)) return 'https://support.google.com/chrome/answer/114662'
  if (/Safari\//.test(ua)) return 'https://support.apple.com/pt-br/guide/safari/ibrwe2159f50/mac'
  return 'https://support.google.com/chrome/answer/114662'
}

const BENEFITS = [
  { icon: '🔔', text: 'Novos chamados abertos pelos professores' },
  { icon: '📦', text: 'Empréstimos, devoluções e validade do estoque' },
  { icon: '🔧', text: 'Manutenções agendadas e reservas próximas' },
]

export function PushNotificationButton() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const { supported, permission, subscribed, loading, error, subscribe } = usePushNotifications(
    [{ id: 'labhub', name: 'LabHub', subscribeUrl: '/api/push/subscribe', icon: '' }],
    useMemo(() => {
      if (!user) return null
      const apps: Record<string, boolean> = {}
      if (user.is_super_admin) {
        for (const app of appRegistry) apps[app.id] = true
      } else {
        const role = permissionService.getRoleForUser(user.roleId)
        for (const app of appRegistry) {
          apps[app.id] = permissionService.resolveAppAccess(role, user, app.id) !== null
        }
      }
      return {
        id: user.id,
        name: user.name,
        role: user.roleId,
        is_super_admin: user.is_super_admin,
        workspace_ids: user.workspace_ids,
        apps,
        notify_settings: user.notify_settings,
      }
    }, [user]),
  )

  const isDenied = permission === 'denied'

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* noop */
    }
  }

  const settingsUrl = browserSettingsUrl()

  if (dismissed || !supported || permission === 'granted' || subscribed) return null

  return (
    <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        role="dialog"
        aria-label="Ativar notificações"
        style={{
          position: 'fixed',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)',
          left: '1rem',
          right: '1rem',
          maxWidth: 380,
          margin: '0 auto',
          zIndex: 200,
        }}
      >
        <div className="rounded-2xl border border-line bg-card p-4" style={{ boxShadow: '0 12px 40px rgba(0, 0, 0, 0.18)' }}>
          {/* Header */}
          <div className="flex items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
              style={{
                background: isDenied
                  ? 'linear-gradient(135deg, #ef4444, #f97316)'
                  : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                boxShadow: isDenied
                  ? '0 6px 16px rgba(239, 68, 68, 0.35)'
                  : '0 6px 16px rgba(99, 102, 241, 0.35)',
              }}
            >
              <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>
                {loading ? '⏳' : isDenied ? '🔕' : '🔔'}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-fg">
                {isDenied ? 'Notificações bloqueadas' : 'Não perca nenhum aviso'}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-fg-muted">
                {isDenied
                  ? 'Você bloqueou as notificações neste navegador. Para receber os avisos, libere o acesso abaixo:'
                  : 'Ative para receber os avisos do laboratório mesmo com o app fechado.'}
              </p>
            </div>
            {!loading && (
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Fechar"
                className="shrink-0 rounded-lg p-1 text-fg-dim transition-colors hover:bg-input hover:text-fg"
              >
                <icons.ui.close size={16} />
              </button>
            )}
          </div>

          {/* Benefícios */}
          {!isDenied && !loading && (
            <ul className="mt-3 space-y-1.5">
              {BENEFITS.map((b) => (
                <li key={b.text} className="flex items-center gap-2 text-[11px] text-fg-dim">
                  <span className="text-xs">{b.icon}</span>
                  <span>{b.text}</span>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}

          {/* Ações */}
          <div className="mt-3.5 flex gap-2">
            <button
              type="button"
              onClick={subscribe}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: isDenied
                  ? 'linear-gradient(135deg, #ef4444, #f97316)'
                  : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                boxShadow: '0 6px 16px rgba(99, 102, 241, 0.28)',
              }}
            >
              {loading ? 'Ativando...' : isDenied ? 'Reativar' : 'Ativar Notificações'}
            </button>
            {isDenied && settingsUrl && (
              <a
                href={settingsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center rounded-xl border border-line px-3.5 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input"
              >
                <icons.ui.sliders size={14} />
              </a>
            )}
          </div>
        </div>
    </motion.div>
  )
}
