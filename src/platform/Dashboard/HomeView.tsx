import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../core/notifications/useNotifications'
import { useAuth } from '../../core/auth/AuthContext'
import { useFastSync } from '../../lib/useFastSync'
import { useOnlineSync } from '../../lib/useOnlineSync'
import { PushNotificationButton } from '../../apps/reservalab/components/PushNotificationButton'
import { NotificationsSheet } from '../NotificationCenter/NotificationsSheet'
import { ProfileSheet } from '../Profile/ProfileSheet'
import { OnboardingOverlay, completeOnboarding, hasCompletedOnboarding } from '../Onboarding/OnboardingOverlay'
import { UserAvatar } from '../Profile/UserAvatar'
import { QuickActions } from './QuickActions'
import { ModuleStats } from './ModuleStats'
import { HomeBanner, HomeBannerSecondary } from './HomeBanner'
import { icons } from '../../lib/icons'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

/**
 * Composição visual ÚNICA da nova Home (portal operacional):
 *
 *   Saudação (nome + UserAvatar → ProfileSheet)
 *   → Banner principal (tema global; Coordenador Multiunidade → coordenador.svg)
 *   → Ações rápidas
 *   → Resumo por módulo
 *   → Banner secundário (mesmo tema global)
 *   → Footer
 *
 * A preferência de tema é o `theme_variant` global já existente — a Home
 * apenas lê e reage a ele (via `ThemeContext`); não há seletor de banner aqui.
 * A seção "Seus Apps" foi removida: o Resumo por módulos (ModuleStats) já
 * representa os módulos acessíveis — sem duplicação de navegação e sem Home
 * longa.
 *
 * O atalho em card para a área de Coordenação também saiu daqui: o acesso passa
 * a ser o próprio CTA "Entrar" desenhado no banner do Coordenador Multiunidade
 * (`HomeBanner`). A decisão de quem enxerga esse banner continua em
 * `useCoordinator().isCoordinatorMultiUnit` — nenhuma regra de acesso nova.
 */
export function HomeView() {
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()
  const { user } = useAuth()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [greeting] = useState(getGreeting)

  useOnlineSync()
  useFastSync(['notifications'], 10000)

  const userName = user?.name || ''

  useEffect(() => {
    if (user && !hasCompletedOnboarding(user.id)) {
      setOnboardingOpen(true)
    }
  }, [user])

  return (
    <div className="min-h-dvh bg-surface text-fg">
      <div className="mx-auto max-w-lg px-5 pt-8 pb-8">
        {/* Saudação — nome + subtítulo + avatar clicável (abre o ProfileSheet) */}
        <header className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight text-fg">
              {greeting},
              {userName && <span className="block truncate">{userName}</span>}
            </h1>
            <p className="mt-1 text-sm text-fg-muted">Que bom te ver por aqui!</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-card text-fg-dim transition-colors hover:bg-input hover:text-fg"
              title="Notificações"
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
              title="Buscar"
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
          </div>
        </header>

        {/* Banner principal — conjunto do tema global ativo */}
        <div className="mb-6">
          <HomeBanner />
        </div>

        {/* Ações rápidas */}
        <div className="mb-6">
          <QuickActions />
        </div>

        {/* Resumo por módulo */}
        <div className="mb-6">
          <ModuleStats />
        </div>

        {/* Banner secundário — sempre o par do mesmo tema */}
        <div className="mb-6">
          <HomeBannerSecondary />
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
