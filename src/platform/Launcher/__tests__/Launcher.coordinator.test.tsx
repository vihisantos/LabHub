import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { User } from '../../../core/auth/types'
import { Launcher } from '../Launcher'

const mockUseLeadership = vi.hoisted(() => vi.fn())

vi.mock('../../../core/permissions/useLeadership', () => ({
  useLeadership: () => mockUseLeadership(),
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

function setLeadership(area: 'team' | 'coordination' | null) {
  mockUseLeadership.mockReturnValue({
    user: { id: 'u-coord', roleId: 'role-coordinator' },
    role: undefined,
    isLeadership: area !== null,
    level: area === 'coordination' ? 2 : area === 'team' ? 1 : 0,
    area,
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

describe('Launcher — acesso à área de coordenação', () => {
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

  it('mostra a entrada de Coordenação para o cargo Coordenador Multiunidades', () => {
    setLeadership('coordination')

    renderLauncher()

    expect(screen.getByText('Área do Coordenador Multiunidades')).toBeInTheDocument()
  })

  it('leva para /coordenador ao acionar a entrada', () => {
    setLeadership('coordination')

    renderLauncher()

    fireEvent.click(
      screen.getByRole('button', { name: /Área do Coordenador Multiunidades/ }),
    )
    expect(screen.getByText('coordenador-target')).toBeInTheDocument()
  })

  it('não mostra a entrada para líder de unidade (escopo team)', () => {
    setLeadership('team')

    renderLauncher()

    expect(screen.queryByText('Área do Coordenador Multiunidades')).not.toBeInTheDocument()
  })

  it('não mostra a entrada para cargo sem liderança', () => {
    setLeadership(null)

    renderLauncher()

    expect(screen.queryByText('Área do Coordenador Multiunidades')).not.toBeInTheDocument()
  })
})
