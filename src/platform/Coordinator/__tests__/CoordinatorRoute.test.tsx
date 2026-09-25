import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { User } from '../../../core/auth/types'
import { AuthGuard } from '../../../core/auth/AuthGuard'
import { LeadershipAreaGuard } from '../../../core/permissions/LeadershipAreaGuard'
import type { CoordinatedUnit } from '../../../core/permissions/coordinatorService'
import { CoordinatorHome } from '../CoordinatorHome'

const mockUseAuth = vi.hoisted(() => vi.fn())
const mockUseLeadership = vi.hoisted(() => vi.fn())
const mockUseCoordinator = vi.hoisted(() => vi.fn())
const mockGetRoleForUser = vi.hoisted(() => vi.fn())

vi.mock('../../../core/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../../../core/auth/service', () => ({
  authService: { refreshProfile: vi.fn() },
}))

vi.mock('../../../core/permissions/useLeadership', () => ({
  useLeadership: () => mockUseLeadership(),
}))

vi.mock('../../../core/permissions/useCoordinator', () => ({
  useCoordinator: () => mockUseCoordinator(),
}))

vi.mock('../../../core/permissions/service', () => ({
  permissionService: { getRoleForUser: () => mockGetRoleForUser() },
}))

vi.mock('../../../core/permissions/coordinatorService', () => ({
  setCoordinatorManager: vi.fn(),
  getCoordinatorRequests: vi.fn(async () => []),
  getCoordinatorInactiveMembers: vi.fn(async () => []),
  getCoordinatorMembers: vi.fn(async () => []),
  getCoordinatorUnitOverview: vi.fn(async () => null),
  getCoordinatorAssignableRoles: vi.fn(async () => []),
  approveCoordinatorMembership: vi.fn(async () => true),
  rejectCoordinatorMembership: vi.fn(async () => true),
  suspendCoordinatorMembership: vi.fn(async () => true),
  restoreCoordinatorMembership: vi.fn(async () => true),
  removeCoordinatorMembership: vi.fn(async () => true),
  setCoordinatorRole: vi.fn(async () => true),
  getLastCoordinatorServiceError: () => null,
}))

const activeUser: User = {
  id: 'u-coord',
  email: 'coord@labhub.com',
  name: 'Coordenador',
  roleId: 'role-coordinator',
  status: 'active',
  is_super_admin: false,
  workspace_ids: ['ws1'],
  accent: 'blue',
  theme_variant: 'light',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

function coordinatedUnit(): CoordinatedUnit {
  return {
    coordination: {
      id: 'coordination-ws1',
      profile_id: 'u-coord',
      workspace_id: 'ws1',
      role_id: 'role-coordinator',
      status: 'active',
      managed_by: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    unitId: 'ws1',
    unitName: 'Campus A',
    leaders: [],
  }
}

function setAuth(overrides: Record<string, unknown> = {}) {
  mockUseAuth.mockReturnValue({
    user: activeUser,
    loading: false,
    isConfigured: true,
    ...overrides,
  })
}

function setLeadership(overrides: Record<string, unknown> = {}) {
  mockUseLeadership.mockReturnValue({
    user: activeUser,
    role: undefined,
    isLeadership: false,
    level: 0,
    area: null,
    ...overrides,
  })
}

function setCoordinator(overrides: Record<string, unknown> = {}) {
  mockUseCoordinator.mockReturnValue({
    units: [],
    isCoordinator: false,
    loading: false,
    failed: false,
    refresh: vi.fn(),
    ...overrides,
  })
}

function renderCoordinatorRoute() {
  return render(
    <MemoryRouter initialEntries={['/coordenador']}>
      <Routes>
        <Route path="/login" element={<div>login-page</div>} />
        <Route path="/approval-pending" element={<div>approval-pending-page</div>} />
        <Route
          path="/coordenador"
          element={
            <AuthGuard fallback={<Navigate to="/login" replace />}>
              <LeadershipAreaGuard scope="coordination">
                <CoordinatorHome />
              </LeadershipAreaGuard>
            </AuthGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('rota /coordenador — composição AuthGuard + LeadershipAreaGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAuth()
    setLeadership()
    setCoordinator()
  })

  it('libera a rota para coordenador por membership ativa e renderiza o CoordinatorHome', () => {
    setLeadership({ isLeadership: true, level: 2, area: 'coordination' })
    setCoordinator({ units: [coordinatedUnit()], isCoordinator: true })

    renderCoordinatorRoute()

    expect(screen.getByText('Área do Coordenador')).toBeInTheDocument()
    expect(screen.getByText('Unidade: Campus A')).toBeInTheDocument()
    expect(screen.queryByText('Acesso restrito')).not.toBeInTheDocument()
  })

  it('regressão coord.test: entra com membership de coordenação ativa mesmo sem cargo legado de liderança', () => {
    setLeadership({ isLeadership: false, area: null })
    setCoordinator({ units: [coordinatedUnit()], isCoordinator: true })

    renderCoordinatorRoute()

    expect(screen.getByText('Área do Coordenador')).toBeInTheDocument()
    expect(screen.queryByText('Acesso restrito')).not.toBeInTheDocument()
  })

  it('NÃO entra só por ter cargo coordinator global sem membership ativa (sem unidade coordenada)', () => {
    setLeadership({ isLeadership: true, level: 2, area: 'coordination' })
    setCoordinator({ units: [], isCoordinator: false })

    renderCoordinatorRoute()

    expect(screen.getByText('Acesso restrito')).toBeInTheDocument()
    expect(screen.queryByText('Área do Coordenador')).not.toBeInTheDocument()
  })

  it('não libera a área de coordenação para líder de unidade (escopo team, sem unidade coordenada)', () => {
    setLeadership({ isLeadership: true, level: 1, area: 'team' })

    renderCoordinatorRoute()

    expect(screen.getByText('Acesso restrito')).toBeInTheDocument()
    expect(screen.queryByText('Área do Coordenador')).not.toBeInTheDocument()
  })

  it('não libera a área para cargo técnico (não-liderança)', () => {
    setLeadership({ isLeadership: false, area: null })

    renderCoordinatorRoute()

    expect(screen.getByText('Acesso restrito')).toBeInTheDocument()
    expect(screen.queryByText('Área do Coordenador')).not.toBeInTheDocument()
  })

  it('não libera a área por ser super admin quando o cargo não é de coordenação', () => {
    setAuth({ user: { ...activeUser, is_super_admin: true, roleId: 'role-admin' } })
    setLeadership({ isLeadership: false, area: null })

    renderCoordinatorRoute()

    expect(screen.getByText('Acesso restrito')).toBeInTheDocument()
    expect(screen.queryByText('Área do Coordenador')).not.toBeInTheDocument()
  })

  it('redireciona usuário não autenticado para o login (fallback do AuthGuard)', () => {
    setAuth({ user: null })

    renderCoordinatorRoute()

    expect(screen.getByText('login-page')).toBeInTheDocument()
    expect(screen.queryByText('Área do Coordenador')).not.toBeInTheDocument()
    expect(screen.queryByText('Acesso restrito')).not.toBeInTheDocument()
  })

  it('bloqueia conta pendente na rota de aprovação antes dos guards de área', () => {
    setAuth({ user: { ...activeUser, status: 'pending' } })

    renderCoordinatorRoute()

    expect(screen.getByText('approval-pending-page')).toBeInTheDocument()
    expect(screen.queryByText('Área do Coordenador')).not.toBeInTheDocument()
  })

  it('mantém a verificação enquanto a autenticação carrega', () => {
    setAuth({ loading: true })

    renderCoordinatorRoute()

    expect(screen.getByText('Verificando autenticação...')).toBeInTheDocument()
    expect(screen.queryByText('Área do Coordenador')).not.toBeInTheDocument()
  })
})
