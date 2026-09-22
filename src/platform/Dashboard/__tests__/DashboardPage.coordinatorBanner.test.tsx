import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { User } from '../../../core/auth/types'
import { DashboardPage } from '../DashboardPage'

const mockUseCoordinator = vi.hoisted(() => vi.fn())

vi.mock('../../../core/permissions/useCoordinator', () => ({
  useCoordinator: () => mockUseCoordinator(),
}))

vi.mock('../../../core/health/useHealth', () => ({
  useHealth: () => ({
    metrics: {
      totalAssets: 42,
      openTickets: 3,
      computersOnline: 10,
      criticalTickets: 1,
    },
    loading: false,
    reload: vi.fn(),
  }),
}))

vi.mock('../../../core/notifications/useNotifications', () => ({
  useNotifications: () => ({ unreadCount: 0 }),
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
  }),
}))

vi.mock('../../../lib/useFastSync', () => ({ useFastSync: () => {} }))

vi.mock('../../../apps/reservalab/components/PushNotificationButton', () => ({
  PushNotificationButton: () => null,
}))
vi.mock('../../NotificationCenter/NotificationsSheet', () => ({
  NotificationsSheet: () => null,
}))
vi.mock('../../Profile/ProfileSheet', () => ({ ProfileSheet: () => null }))
vi.mock('../../Profile/UserAvatar', () => ({ UserAvatar: () => null }))
vi.mock('../../Dashboard/QuickActions', () => ({ QuickActions: () => null }))
vi.mock('../../Dashboard/ModuleStats', () => ({ ModuleStats: () => null }))
vi.mock('../../Dashboard/ActivityFeed', () => ({ ActivityFeed: () => null }))
vi.mock('../../Onboarding/OnboardingOverlay', () => ({
  OnboardingOverlay: () => null,
  completeOnboarding: vi.fn(),
  hasCompletedOnboarding: () => true,
}))

interface UnitLike {
  unitId: string
}

/**
 * Estado do escopo como o hook entrega. `isCoordinatorMultiUnit` = presença do
 * CARGO "Coordenador Multiunidade" (confirmação server-side do `get_coordinator_units`).
 * A Home NUNCA usa `units.length > 1` para autorizar o banner.
 */
function mockCoordinator({
  units,
  isCoordinatorMultiUnit,
  loading = false,
  failed = false,
}: {
  units: UnitLike[]
  isCoordinatorMultiUnit: boolean
  loading?: boolean
  failed?: boolean
}) {
  mockUseCoordinator.mockReturnValue({
    units,
    isCoordinator: isCoordinatorMultiUnit || units.length > 0,
    isCoordinatorMultiUnit,
    loading,
    failed,
    refresh: vi.fn(),
  })
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/coordenador" element={<div>central-coordenador-target</div>} />
        <Route path="/*" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const BANNER_TESTID = 'coordinator-multi-unit-banner'

describe('DashboardPage — banner do Coordenador na Home (RBAC 2.0)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('coordenador comum SEM o cargo (0 unidades confirmadas) → sem banner; 4 cards permanecem', () => {
    mockCoordinator({ units: [], isCoordinatorMultiUnit: false })

    renderDashboard()

    expect(screen.queryByTestId(BANNER_TESTID)).not.toBeInTheDocument()
    expect(screen.getByText('Total de Ativos')).toBeInTheDocument()
    expect(screen.getByText('Chamados Abertos')).toBeInTheDocument()
    expect(screen.getByText('Computadores')).toBeInTheDocument()
    expect(screen.getByText('Críticos')).toBeInTheDocument()
  })

  it('possui o CARGO Coordenador Multiunidades com UMA unidade → banner aparece (o cargo autoriza, não a contagem)', () => {
    mockCoordinator({ units: [{ unitId: 'ws1' }], isCoordinatorMultiUnit: true })

    renderDashboard()

    expect(screen.getByTestId(BANNER_TESTID)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Central do Coordenador' })).toBeInTheDocument()
    expect(screen.queryByText('Total de Ativos')).not.toBeInTheDocument()
  })

  it('múltiplas unidades SEM o cargo Multiunidades (servidor não confirma o cargo) → sem banner', () => {
    // Defesa em profundidade: mesmo que o servidor liste unidades, sem a
    // confirmação do cargo a UI NÃO exibe (fail-closed — nunca `units.length > 1`).
    mockCoordinator({
      units: [{ unitId: 'ws1' }, { unitId: 'ws2' }],
      isCoordinatorMultiUnit: false,
    })

    renderDashboard()

    expect(screen.queryByTestId(BANNER_TESTID)).not.toBeInTheDocument()
    expect(screen.getByText('Total de Ativos')).toBeInTheDocument()
  })

  it('Coordenador Multiunidades com unidades válidas → banner no lugar dos 4 cards (nunca 4 cards + banner)', () => {
    mockCoordinator({
      units: [{ unitId: 'ws1' }, { unitId: 'ws2' }],
      isCoordinatorMultiUnit: true,
    })

    renderDashboard()

    expect(screen.getByTestId(BANNER_TESTID)).toBeInTheDocument()
    expect(screen.queryByText('Total de Ativos')).not.toBeInTheDocument()
    expect(screen.queryByText('Chamados Abertos')).not.toBeInTheDocument()
  })

  it('acesso administrativo sem o cargo → sem banner', () => {
    mockCoordinator({ units: [], isCoordinatorMultiUnit: false })

    renderDashboard()

    expect(screen.queryByTestId(BANNER_TESTID)).not.toBeInTheDocument()
    expect(screen.getByText('Total de Ativos')).toBeInTheDocument()
  })

  it('fail-closed: escopo ainda carregando → sem banner (nunca branqueia os cards para um estado incerto)', () => {
    mockCoordinator({ units: [], isCoordinatorMultiUnit: false, loading: true })

    renderDashboard()

    expect(screen.queryByTestId(BANNER_TESTID)).not.toBeInTheDocument()
    expect(screen.getByText('Total de Ativos')).toBeInTheDocument()
  })

  it('clique no banner navega para a Central do Coordenador existente (/coordenador)', () => {
    mockCoordinator({
      units: [{ unitId: 'ws1' }],
      isCoordinatorMultiUnit: true,
    })

    renderDashboard()

    fireEvent.click(screen.getByRole('link', { name: 'Abrir a Central do Coordenador' }))
    expect(screen.getByText('central-coordenador-target')).toBeInTheDocument()
  })
})