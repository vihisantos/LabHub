import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../core/notifications/useNotifications'
import { useAuth } from '../../core/auth/AuthContext'
import { useCoordinator } from '../../core/permissions/useCoordinator'
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
 *   → atalho Coordenação (apenas quando `isCoordinator`)
 *
 * A preferência de tema é o `theme_variant` global já existente — a Home
 * apenas lê e reage a ele (via `ThemeContext`); não há seletor de banner aqui.
 * A seção "Seus Apps" foi removida: o Resumo por módulos (ModuleStats) já
 * representa os módulos acessíveis — sem duplicação de navegação e sem Home
 * longa. RBAC/visibilidade continuam vindo de `QuickActions`, `ModuleStats` e
 * `useCoordinator` (nenhuma lógica nova de acesso neste arquivo).
 */
export function HomeView() {
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()
  const { user } = useAuth()
  const { isCoordinator } = useCoordinator()
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

        {/* Área de Coordenação — RBAC 2.0: concedida pela membership ATIVA de
            coordenação (servidor confirma ≥1 unidade sob coordenação). NUNCA
            pelo cargo global/legado profiles.role. */}
        {isCoordinator && (
          <div className="mb-6">
            <p className="mb-3 px-1 text-xs font-semibold text-fg-muted">Coordenação</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/coordenador')}
                className="flex w-36 flex-col items-center gap-2.5 rounded-2xl bg-card p-4 text-center shadow-sm transition-all hover:shadow-[var(--shadow-elevated)] active:scale-[0.97]"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-500">
                  <icons.ui.userCheck size={26} />
                </span>
                <span className="text-sm font-semibold text-fg">Coordenação</span>
                <span className="text-[11px] leading-snug text-fg-muted">Área do Coordenador Multiunidades</span>
              </button>
            </div>
          </div>
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
