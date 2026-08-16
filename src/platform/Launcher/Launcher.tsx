import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { appRegistry } from '../../appRegistry'
import { useNotifications } from '../../core/notifications/useNotifications'
import { useAuth } from '../../core/auth/AuthContext'
import { useWorkspace } from '../../core/workspaces/WorkspaceContext'
import { filterAppsByWorkspace } from '../../core/workspaces/apps'
import { useAppAccess } from '../../core/permissions/usePermissions'
import { useFastSync } from '../../lib/useFastSync'
import { useOnlineSync } from '../../lib/useOnlineSync'
import { PushNotificationButton } from '../../apps/reservalab/components/PushNotificationButton'
import { NotificationsSheet } from '../NotificationCenter/NotificationsSheet'
import { ProfileSheet } from '../Profile/ProfileSheet'
import { OnboardingOverlay, completeOnboarding, hasCompletedOnboarding } from '../Onboarding/OnboardingOverlay'
import { UserAvatar } from '../Profile/UserAvatar'
import { QuickActions } from '../Dashboard/QuickActions'
import { icons } from '../../lib/icons'
import { Music } from 'lucide-react'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

/**
 * Home simples para quem NÃO tem acesso ao módulo "dashboard".
 * Sem métricas/dash: ações rápidas + cards dos apps acessíveis,
 * centralizados (1 card no centro, 2 em 2 colunas).
 */
export function Launcher() {
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()
  const { user, signOut } = useAuth()
  const { canAccessApp } = useAppAccess()
  const { workspace } = useWorkspace()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [greeting, setGreeting] = useState('')

  useOnlineSync()
  useFastSync(['notifications'], 10000)

  const userName = user?.name?.split(' ')[0] || ''
  const accessibleApps = filterAppsByWorkspace(
    appRegistry.filter((app) => canAccessApp(app.id)),
    workspace,
  )

  useEffect(() => {
    setGreeting(getGreeting())
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    if (mq.matches) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  useEffect(() => {
    if (user && !hasCompletedOnboarding(user.id)) {
      setOnboardingOpen(true)
    }
  }, [user])

  return (
    <div className="min-h-dvh bg-surface text-fg">
      <div className="mx-auto max-w-lg px-5 pt-8 pb-8">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-fg">
                {greeting}{userName ? `, ${userName}` : ''}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNotificationsOpen(true)}
                className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-card text-fg-dim transition-colors hover:bg-input hover:text-fg"
              >
                <icons.ui.inbox size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })
                  document.dispatchEvent(event)
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-card text-fg-dim transition-colors hover:bg-input hover:text-fg"
              >
                <icons.ui.search size={20} />
              </button>
              {user && (
                <button
                  type="button"
                  onClick={() => setProfileOpen(true)}
                  title="Meu perfil"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-card p-1 transition-colors hover:bg-input"
                >
                  <UserAvatar user={user} size={32} />
                </button>
              )}
              <button
                type="button"
                onClick={signOut}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-card text-fg-dim transition-colors hover:bg-red-500/10 hover:text-red-500"
                title="Sair"
              >
                <icons.ui.close size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Ações rápidas */}
        <div className="mb-6">
          <QuickActions />
        </div>

        {/* Cards dos apps — centralizados: 1 no centro, 2 em 2 colunas */}
        <div className="mb-6">
          <p className="mb-3 px-1 text-xs font-semibold text-fg-muted">Seus Apps</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/pedir-musica')}
              className="flex w-36 flex-col items-center gap-2.5 rounded-2xl bg-card p-4 text-center shadow-sm transition-all hover:shadow-[var(--shadow-elevated)] active:scale-[0.97]"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-500">
                <Music size={26} />
              </span>
              <span className="text-sm font-semibold text-fg">Pedir Música</span>
              <span className="text-[11px] leading-snug text-fg-muted">Sugira uma música para a TV</span>
            </button>
            {accessibleApps.map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() => navigate(app.route)}
                className="flex w-36 flex-col items-center gap-2.5 rounded-2xl bg-card p-4 text-center shadow-sm transition-all hover:shadow-[var(--shadow-elevated)] active:scale-[0.97]"
              >
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: app.color + '15', color: app.color }}
                >
                  <app.icon size={26} />
                </span>
                <span className="text-sm font-semibold text-fg">{app.name}</span>
                <span className="text-[11px] leading-snug text-fg-muted">{app.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center">
          <button
            type="button"
            onClick={() => navigate('/roadmap')}
            className="text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors"
          >
            Roadmap
          </button>
          <p className="mt-1 text-[10px] text-fg-dim">LabHub v2.1.0</p>
        </footer>
      </div>

      <PushNotificationButton />
      <NotificationsSheet open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
      <OnboardingOverlay
        open={onboardingOpen}
        userName={user?.name || ''}
        onFinish={() => {
          if (user) completeOnboarding(user.id)
          setOnboardingOpen(false)
        }}
      />
    </div>
  )
}
