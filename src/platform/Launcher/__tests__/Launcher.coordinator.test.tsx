import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { User } from '../../../core/auth/types'
import { Launcher } from '../Launcher'

const mockUseCoordinator = vi.hoisted(() => vi.fn())

vi.mock('../../../core/permissions/useCoordinator', () => ({
  useCoordinator: () => mockUseCoordinator(),
}))

vi.mock('../../../core/permissions/usePermissions', () => ({
  useAppAccess: () => ({ canAccessApp: () => true }),
}))

vi.mock('../../../core/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u-coord',
      name: 'Coordenador',
      email: 'coord@labhub.com',
      roleId: 'role-coordinator',
      status: 'active',
      is_super_admin: false,
      workspace_ids: ['ws1'],
    } as User,
    signOut: vi.fn(),
  }),
}))

vi.mock('../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: { id: 'ws1', name: 'Lab', slug: 'lab', disabled_apps: [] } }),
}))

vi.mock('../../../core/notifications/useNotifications', () => ({
  useNotifications: () => ({ unreadCount: 0 }),
}))

vi.mock('../../../lib/useFastSync', () => ({ useFastSync: () => {} }))
vi.mock('../../../lib/useOnlineSync', () => ({ useOnlineSync: () => ({}) }))

vi.mock('../../../apps/reservalab/components/PushNotificationButton', () => ({
  PushNotificationButton: () => null,
}))
vi.mock('../../NotificationCenter/NotificationsSheet', () => ({
  NotificationsSheet: () => null,
}))
vi.mock('../../Profile/ProfileSheet', () => ({ ProfileSheet: () => null }))
vi.mock('../../Profile/UserAvatar', () => ({ UserAvatar: () => null }))
vi.mock('../../Dashboard/QuickActions', () => ({ QuickActions: () => null }))
vi.mock('../../Onboarding/OnboardingOverlay', () => ({
  OnboardingOverlay: () => null,
  completeOnboarding: vi.fn(),
  hasCompletedOnboarding: () => true,
}))

function setCoordinator(isCoordinator: boolean) {
  mockUseCoordinator.mockReturnValue({
    units: isCoordinator ? [{ unitId: 'ws1' }] : [],
    isCoordinator,
    loading: false,
    failed: false,
    refresh: vi.fn(),
  })
}

function renderLauncher() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/coordenador" element={<div>coordenador-target</div>} />
        <Route path="/*" element={<Launcher />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Launcher — acesso à área de coordenação (RBAC 2.0: membership ativa)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as typeof window.matchMedia
  })

  it('mostra a entrada de Coordenação para quem coordena ativamente ≥1 unidade (membership)', () => {
    setCoordinator(true)

    renderLauncher()

    expect(screen.getByText('Área do Coordenador Multiunidades')).toBeInTheDocument()
  })

  it('leva para /coordenador ao acionar a entrada', () => {
    setCoordinator(true)

    renderLauncher()

    fireEvent.click(
      screen.getByRole('button', { name: /Área do Coordenador Multiunidades/ }),
    )
    expect(screen.getByText('coordenador-target')).toBeInTheDocument()
  })

  it('regressão coord.test: membership de coordenação ativa mostra o card mesmo sem cargo global legado', () => {
    // coord.test tem membership de coordenação (como o Caio), mas profiles.role
    // NÃO é 'coordinator' — o card NÃO pode depender do cargo legado.
    setCoordinator(true)

    renderLauncher()

    expect(screen.getByText('Área do Coordenador Multiunidades')).toBeInTheDocument()
  })

  it('não mostra a entrada sem membership ativa de coordenação (não coordena unidade alguma)', () => {
    setCoordinator(false)

    renderLauncher()

    expect(screen.queryByText('Área do Coordenador Multiunidades')).not.toBeInTheDocument()
  })

  it('não mostra a entrada enquanto o escopo ainda não confirmou unidades (fail-closed)', () => {
    mockUseCoordinator.mockReturnValue({ units: [], isCoordinator: false, loading: true, failed: false, refresh: vi.fn() })

    renderLauncher()

    expect(screen.queryByText('Área do Coordenador Multiunidades')).not.toBeInTheDocument()
  })
})
