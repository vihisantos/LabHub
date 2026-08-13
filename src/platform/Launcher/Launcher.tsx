import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { appRegistry } from '../../appRegistry'
import { useNotifications } from '../../core/notifications/useNotifications'
import { useAuth } from '../../core/auth/AuthContext'
import { authService } from '../../core/auth/service'
import type { HomeMode } from '../../core/auth/types'
import { useAppAccess } from '../../core/permissions/usePermissions'
import { useFastSync } from '../../lib/useFastSync'
import { PushNotificationButton } from '../../apps/reservalab/components/PushNotificationButton'
import { NotificationsSheet } from '../NotificationCenter/NotificationsSheet'
import { ProfileSheet } from '../Profile/ProfileSheet'
import { OnboardingOverlay, completeOnboarding, hasCompletedOnboarding } from '../Onboarding/OnboardingOverlay'
import { UserAvatar } from '../Profile/UserAvatar'
import { icons } from '../../lib/icons'
import { Music } from 'lucide-react'
import { LAUNCHER_MODES, getQuickActions, type LauncherMode } from './launcherModes'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function asHomeMode(value: HomeMode | undefined): LauncherMode {
  return value === 'compact' ? 'compact' : 'dynamic'
}

export function Launcher() {
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()
  const { user, signOut } = useAuth()
  const { canAccessApp } = useAppAccess()
  const [greeting, setGreeting] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [mode, setMode] = useState<LauncherMode>(() => asHomeMode(user?.home_mode))

  useFastSync(['notifications'], 10000)

  const userName = user?.name?.split(' ')[0] || ''
  const accessibleApps = appRegistry.filter((app) => canAccessApp(app.id))

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

  function changeMode(next: LauncherMode) {
    setMode(next)
    if (user) {
      authService.updateProfile({ home_mode: next }).catch(() => {})
    }
  }

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

        {/* Modo da tela inicial */}
        <div className="mb-6">
          <div className="flex rounded-xl bg-card p-1">
            {LAUNCHER_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => changeMode(m.value)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  mode === m.value ? 'bg-blue-500 text-white' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'compact' ? (
          /* ─── Modo compacto: só os apps acessíveis, em cards grandes ─── */
          <div className="mb-6">
            <p className="mb-3 px-1 text-xs font-semibold text-fg-muted">Seus Apps</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => navigate('/pedir-musica')}
                className="flex flex-col items-center gap-3 rounded-2xl bg-card p-6 text-center shadow-sm transition-all active:scale-[0.98]"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/15 text-red-500">
                  <Music size={30} />
                </span>
                <span className="text-sm font-semibold text-fg">Pedir Música</span>
                <span className="text-[11px] leading-snug text-fg-muted">Sugira uma música para a TV</span>
              </button>
              {accessibleApps.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => navigate(app.route)}
                  className="flex flex-col items-center gap-3 rounded-2xl bg-card p-6 text-center shadow-sm transition-all active:scale-[0.98]"
                >
                  <span
                    className="flex h-16 w-16 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: app.color + '15', color: app.color }}
                  >
                    <app.icon size={30} />
                  </span>
                  <span className="text-sm font-semibold text-fg">{app.name}</span>
                  <span className="text-[11px] leading-snug text-fg-muted">{app.description}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ─── Modo dinâmico: módulos + ações rápidas por app ─── */
          <>
            {accessibleApps.some((app) => getQuickActions(app.id).length > 0) && (
              <div className="mb-6">
                <p className="mb-3 px-1 text-xs font-semibold text-fg-muted">Ações Rápidas</p>
                {accessibleApps.map((app) => {
                  const actions = getQuickActions(app.id)
                  if (actions.length === 0) return null
                  return (
                    <div key={app.id} className="mb-4">
                      <div className="mb-2 flex items-center gap-2 px-1">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-lg"
                          style={{ backgroundColor: app.color + '15', color: app.color }}
                        >
                          <app.icon size={14} />
                        </span>
                        <span className="text-xs font-semibold text-fg-muted">{app.name}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {actions.map((action) => (
                          <button
                            key={action.label}
                            type="button"
                            onClick={() => navigate(action.route)}
                            className="flex flex-col items-center gap-1.5 rounded-xl bg-card p-3 shadow-sm transition-all active:scale-95"
                          >
                            <span
                              className="flex h-10 w-10 items-center justify-center rounded-xl"
                              style={{ backgroundColor: action.color + '15', color: action.color }}
                            >
                              {action.icon}
                            </span>
                            <span className="text-[10px] font-medium text-fg-muted">{action.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mb-6">
              <p className="mb-3 px-1 text-xs font-semibold text-fg-muted">Módulos</p>
              <div className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sm">
                <button
                  type="button"
                  onClick={() => navigate('/pedir-musica')}
                  className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-input"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-500">
                    <Music size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-fg">Pedir Música</span>
                    <span className="mt-0.5 block truncate text-[11px] text-fg-muted">Sugira uma música para a TV</span>
                  </span>
                  <icons.ui.chevronRight size={16} className="shrink-0 text-fg-muted" />
                </button>
                {accessibleApps.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => navigate(app.route)}
                    className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-input"
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: app.color + '15', color: app.color }}
                    >
                      <app.icon size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-fg">{app.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-fg-muted">{app.description}</span>
                    </span>
                    <icons.ui.chevronRight size={16} className="shrink-0 text-fg-muted" />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <footer className="text-center">
          <button
            type="button"
            onClick={() => navigate('/roadmap')}
            className="text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors"
          >
            Roadmap
          </button>
          <p className="mt-1 text-[10px] text-fg-dim">LabHub v2.0</p>
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
