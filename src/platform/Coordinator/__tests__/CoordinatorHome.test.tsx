import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CoordinatorHome } from '../CoordinatorHome'
import type { CoordinatedUnit } from '../../../core/permissions/coordinatorService'

const mockUseCoordinator = vi.hoisted(() => vi.fn())
const mockGetRoleForUser = vi.hoisted(() => vi.fn())

vi.mock('../../../core/permissions/useCoordinator', () => ({
  useCoordinator: () => mockUseCoordinator(),
}))

vi.mock('../../../core/permissions/service', () => ({
  permissionService: { getRoleForUser: () => mockGetRoleForUser() },
}))

const membership = (
  id: string,
  profileId: string,
  workspaceId: string,
  over: Partial<{
    managed_by: string | null
    role_id: string
  }> = {},
) => ({
  id,
  profile_id: profileId,
  workspace_id: workspaceId,
  role_id: over.role_id ?? 'role-x',
  status: 'active' as const,
  managed_by: over.managed_by ?? null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const teamMember = (id: string, name: string, roleId: string) => ({
  membership: membership(`ms-${id}`, `u-${id}`, 'ws1', { managed_by: 'ms-lider1' }),
  profile: { id: `u-${id}`, name, email: `${id}@b.com`, status: 'active' as const, roleId },
})

function unitWithData(): CoordinatedUnit {
  return {
    coordination: membership('coordination-ws1', 'u-coord', 'ws1'),
    unitId: 'ws1',
    unitName: 'Campus A',
    leaders: [
      {
        leadership: membership('ms-lider1', 'u-lider1', 'ws1', {
          managed_by: 'coordination-ws1',
          role_id: 'role-lider',
        }),
        profile: { id: 'u-lider1', name: 'Ana Líder', email: 'ana@b.com', status: 'active', roleId: 'role-lider' },
        members: [teamMember('m1', 'Técnico 1', 'role-technician')],
      },
    ],
  }
}

function setupOverrides(overrides: Partial<ReturnType<typeof mockUseCoordinator>>) {
  mockUseCoordinator.mockReturnValue({
    units: [],
    loading: false,
    failed: false,
    refresh: vi.fn(),
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetRoleForUser.mockReturnValue({ name: 'Líder' })
})

describe('CoordinatorHome (Fase 8 — Área do Coordenador, escopo real)', () => {
  it('estado de carregamento', () => {
    setupOverrides({ loading: true })
    render(
      <MemoryRouter initialEntries={['/coordenador']}>
        <CoordinatorHome />
      </MemoryRouter>,
    )
    expect(screen.getByText('Carregando seu escopo de coordenação...')).toBeTruthy()
    expect(screen.getByText('Área do Coordenador')).toBeTruthy()
  })

  it('falha ao buscar → tela de erro honesta + retry chama refresh', () => {
    const refresh = vi.fn()
    setupOverrides({ failed: true, refresh })
    render(
      <MemoryRouter>
        <CoordinatorHome />
      </MemoryRouter>,
    )
    expect(screen.getByText('Não foi possível carregar seu escopo')).toBeTruthy()
    const retry = screen.getByRole('button', { name: 'Tentar novamente' })
    retry.click()
    expect(refresh).toHaveBeenCalled()
  })

  it('estado vazio legítimo → honesto, orienta ao administrador', () => {
    setupOverrides({ units: [] })
    render(
      <MemoryRouter>
        <CoordinatorHome />
      </MemoryRouter>,
    )
    expect(screen.getByText('Você ainda não tem unidades de coordenação atribuídas')).toBeTruthy()
    expect(screen.getByText(/atribuir as unidades ao seu perfil/)).toBeTruthy()
  })

  it('mostra o escopo real: unidades, lideranças e equipes', () => {
    setupOverrides({ units: [unitWithData()] })
    render(
      <MemoryRouter>
        <CoordinatorHome />
      </MemoryRouter>,
    )
    expect(screen.getByText('Área do Coordenador')).toBeTruthy()
    expect(screen.getByText('Unidade: Campus A')).toBeTruthy()
    expect(screen.getByText('Ana Líder')).toBeTruthy()
    expect(screen.getByText('Técnico 1')).toBeTruthy()
    expect(screen.getByText('1 liderança')).toBeTruthy()
    expect(screen.getByText('membro nas equipes')).toBeTruthy()
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(3)
  })

  it('unidade sem liderança subordinada → linha honesta', () => {
    setupOverrides({
      units: [
        {
          coordination: membership('coordination-ws2', 'u-coord', 'ws2'),
          unitId: 'ws2',
          unitName: 'Campus B',
          leaders: [],
        },
      ],
    })
    render(
      <MemoryRouter>
        <CoordinatorHome />
      </MemoryRouter>,
    )
    expect(screen.getByText('Unidade: Campus B')).toBeTruthy()
    expect(screen.getByText('Nenhuma liderança subordinada nesta unidade ainda.')).toBeTruthy()
  })

  it('sem CTA de gestão (nenhuma ação além do voltar) — nenhuma funcionalidade falsa', () => {
    setupOverrides({ units: [unitWithData()] })
    render(
      <MemoryRouter>
        <CoordinatorHome />
      </MemoryRouter>,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(1)
    expect(buttons[0].title).toBe('Voltar ao início')
  })
})