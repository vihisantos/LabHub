import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { clearCache, setCol } from '../../../lib/db'
import { ticketService } from '../../../apps/chamados/services/ticketService'
import { CoordinatorHome } from '../CoordinatorHome'
import { managerOptionsForMember } from '../coordinatorHelpers'
import type { Ticket } from '../../../apps/chamados/types'
import type {
  CoordinatedUnit,
  CoordinatorInactiveMember,
  CoordinatorRequest,
  CoordinatorRoleOption,
  CoordinatorUnitOverview,
} from '../../../core/permissions/coordinatorService'
import type { BreakpointState } from '../../../responsive/useBreakpoint'

const mockUseCoordinator = vi.hoisted(() => vi.fn())
const mockGetRoleForUser = vi.hoisted(() => vi.fn())
const mockUseBreakpoint = vi.hoisted(() => vi.fn())
const mockSetCoordinatorManager = vi.hoisted(() => vi.fn())
const mockGetLastCoordinatorServiceError = vi.hoisted(() => vi.fn())
const mockGetCoordinatorRequests = vi.hoisted(() => vi.fn())
const mockGetCoordinatorInactiveMembers = vi.hoisted(() => vi.fn())
const mockGetCoordinatorUnitOverview = vi.hoisted(() => vi.fn())
const mockGetCoordinatorAssignableRoles = vi.hoisted(() => vi.fn())
const mockApproveCoordinatorMembership = vi.hoisted(() => vi.fn())
const mockRejectCoordinatorMembership = vi.hoisted(() => vi.fn())
const mockSuspendCoordinatorMembership = vi.hoisted(() => vi.fn())
const mockRestoreCoordinatorMembership = vi.hoisted(() => vi.fn())
const mockRemoveCoordinatorMembership = vi.hoisted(() => vi.fn())
const mockSetCoordinatorRole = vi.hoisted(() => vi.fn())
const mockNavigate = vi.hoisted(() => vi.fn())
const workspaceContextMock = vi.hoisted(() => ({
  workspace: null as { id: string; name: string; slug: string } | null,
  workspaces: [] as Array<{ id: string; name: string; slug: string }>,
  setWorkspace: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>()
  return { ...mod, useNavigate: () => mockNavigate }
})

vi.mock('../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => workspaceContextMock,
}))

vi.mock('../../../core/permissions/useCoordinator', () => ({
  useCoordinator: () => mockUseCoordinator(),
}))

vi.mock('../../../core/permissions/service', () => ({
  permissionService: { getRoleForUser: () => mockGetRoleForUser() },
}))

vi.mock('../../../responsive/useBreakpoint', () => ({
  useBreakpoint: () => mockUseBreakpoint(),
}))

vi.mock('../../../core/permissions/coordinatorService', () => ({
  setCoordinatorManager: (...args: unknown[]) => mockSetCoordinatorManager(...args),
  getCoordinatorRequests: (...args: unknown[]) => mockGetCoordinatorRequests(...args),
  getCoordinatorInactiveMembers: (...args: unknown[]) => mockGetCoordinatorInactiveMembers(...args),
  getCoordinatorUnitOverview: (...args: unknown[]) => mockGetCoordinatorUnitOverview(...args),
  getCoordinatorAssignableRoles: (...args: unknown[]) => mockGetCoordinatorAssignableRoles(...args),
  approveCoordinatorMembership: (...args: unknown[]) => mockApproveCoordinatorMembership(...args),
  rejectCoordinatorMembership: (...args: unknown[]) => mockRejectCoordinatorMembership(...args),
  suspendCoordinatorMembership: (...args: unknown[]) => mockSuspendCoordinatorMembership(...args),
  restoreCoordinatorMembership: (...args: unknown[]) => mockRestoreCoordinatorMembership(...args),
  removeCoordinatorMembership: (...args: unknown[]) => mockRemoveCoordinatorMembership(...args),
  setCoordinatorRole: (...args: unknown[]) => mockSetCoordinatorRole(...args),
  getLastCoordinatorServiceError: () => mockGetLastCoordinatorServiceError(),
}))

const membership = (
  id: string,
  profileId: string,
  workspaceId: string,
  over: Partial<{
    managed_by: string | null
    role_id: string
    status: 'pending' | 'active' | 'suspended' | 'removed'
  }> = {},
) => ({
  id,
  profile_id: profileId,
  workspace_id: workspaceId,
  role_id: over.role_id ?? 'role-x',
  status: over.status ?? ('active' as const),
  managed_by: over.managed_by ?? null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const teamMember = (
  id: string,
  name: string,
  roleId: string,
  managerId = 'ms-lider1',
) => ({
  membership: membership(`ms-${id}`, `u-${id}`, 'ws1', { managed_by: managerId }),
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

function twoLeadersUnit(): CoordinatedUnit {
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
        members: [teamMember('m1', 'Técnico 1', 'role-technician', 'ms-lider1')],
      },
      {
        leadership: membership('ms-lider2', 'u-lider2', 'ws1', {
          managed_by: 'coordination-ws1',
          role_id: 'role-lider',
        }),
        profile: { id: 'u-lider2', name: 'Bruno Líder', email: 'bruno@b.com', status: 'active', roleId: 'role-lider' },
        members: [teamMember('m2', 'Técnico 2', 'role-technician', 'ms-lider2')],
      },
    ],
  }
}

const assignableRoles: CoordinatorRoleOption[] = [
  { id: 'role-technician', slug: 'tec', name: 'Técnico' },
  { id: 'role-viewer', slug: 'vis', name: 'Visualizador' },
  { id: 'role-est', slug: 'est', name: 'Gestor de Estoque' },
  { id: 'role-opv', slug: 'opv', name: 'Operador TV' },
  { id: 'role-lider', slug: 'lider', name: 'Líder' },
]

function pendingRequest(id: string, name: string): CoordinatorRequest {
  return {
    membership: membership(`ms-${id}`, `u-${id}`, 'ws1', { status: 'pending' }),
    profile: { id: `u-${id}`, name, email: `${id}@b.com`, status: 'active', roleId: 'role-technician' },
  }
}

function inactiveMember(
  id: string,
  name: string,
  status: 'suspended' | 'removed',
): CoordinatorInactiveMember {
  return {
    membership: membership(`ms-${id}`, `u-${id}`, 'ws1', { status }),
    profile: {
      id: `u-${id}`,
      name,
      email: `${id}@b.com`,
      status: 'active',
      roleId: 'role-technician',
    },
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

function renderHome(units: CoordinatedUnit[]) {
  const refresh = vi.fn()
  setupOverrides({ units, refresh })
  render(
    <MemoryRouter initialEntries={['/coordenador']}>
      <CoordinatorHome />
    </MemoryRouter>,
  )
  return refresh
}

function setBp(bp: BreakpointState['bp']) {
  mockUseBreakpoint.mockReturnValue({
    bp,
    isCompact: bp === 'compact',
    isTablet: bp === 'tablet',
    isDesktop: bp === 'desktop',
    isWide: bp === 'wide',
  })
}

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  mockNavigate.mockReset()
  workspaceContextMock.workspace = null
  workspaceContextMock.workspaces = []
  workspaceContextMock.setWorkspace.mockReset()
  mockGetRoleForUser.mockReturnValue({ name: 'Líder' })
  mockGetLastCoordinatorServiceError.mockReturnValue(null)
  mockSetCoordinatorManager.mockResolvedValue(true)
  mockGetCoordinatorRequests.mockResolvedValue([])
  mockGetCoordinatorInactiveMembers.mockResolvedValue([])
  mockGetCoordinatorUnitOverview.mockResolvedValue(null)
  mockGetCoordinatorAssignableRoles.mockResolvedValue([])
  mockApproveCoordinatorMembership.mockResolvedValue(true)
  mockRejectCoordinatorMembership.mockResolvedValue(true)
  mockSuspendCoordinatorMembership.mockResolvedValue(true)
  mockRestoreCoordinatorMembership.mockResolvedValue(true)
  mockRemoveCoordinatorMembership.mockResolvedValue(true)
  mockSetCoordinatorRole.mockResolvedValue(true)
  // jsdom não tem matchMedia → o comportamento real já é compact; fixar o mock
  // garante determinismo também para o teste de faixas desktop/wide.
  setBp('compact')
})

describe('CoordinatorHome (Área do Coordenador — gestão por RPC escopada)', () => {
  describe('managerOptionsForMember — candidatos restringidos ao escopo do RPC', () => {
    it('exclui o gestor atual e oferece coordenação + demais lideranças da unidade', () => {
      const unit = twoLeadersUnit()
      const member = unit.leaders[0].members[0]

      const options = managerOptionsForMember(unit, member)

      expect(options.map((o) => o.membershipId)).toEqual([
        'coordination-ws1',
        'ms-lider2',
      ])
      expect(options[0].label).toBe('Coordenador(a) desta unidade')
      expect(options[1].label).toBe('Bruno Líder')
    })

    it('nunca propõe o próprio membro como gestor (fail-safe puro)', () => {
      const unit = twoLeadersUnit()
      const membersOfLider1 = unit.leaders[0].members[0]
      const selfAsLeader = {
        membership: { ...membersOfLider1.membership, id: 'ms-lider1' },
        profile: membersOfLider1.profile,
      }

      const options = managerOptionsForMember(unit, selfAsLeader)

      expect(options.map((o) => o.membershipId)).not.toContain('ms-lider1')
      expect(options.map((o) => o.membershipId)).toEqual(['coordination-ws1', 'ms-lider2'])
    })

    it('única liderança atual → só resta a coordenação como candidato', () => {
      const unit = unitWithData()
      const member = unit.leaders[0].members[0]

      const options = managerOptionsForMember(unit, member)

      expect(options.map((o) => o.membershipId)).toEqual(['coordination-ws1'])
    })
  })

  describe('tela — estados honestos', () => {
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

    it('mostra o escopo real: unidades, lideranças e equipes', async () => {
      renderHome([unitWithData()])
      await act(async () => {})
      expect(screen.getByText('Área do Coordenador')).toBeTruthy()
      expect(screen.getByText('Unidade: Campus A')).toBeTruthy()
      expect(screen.getByText('Ana Líder')).toBeTruthy()
      expect(screen.getByText('Técnico 1')).toBeTruthy()
      expect(screen.getByText('liderança direta')).toBeTruthy()
      expect(screen.getByText('membro nas equipes')).toBeTruthy()
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
  })

  describe('solicitações pendentes por unidade (Fase 1 RPC 065)', () => {
    it('lista nome, e-mail e estado pendente (sem inventar pedidos)', async () => {
      mockGetCoordinatorRequests.mockImplementation(async (ws: string) =>
        ws === 'ws1' ? [pendingRequest('p1', 'Nova Pessoa')] : [],
      )
      renderHome([unitWithData()])
      await act(async () => {})

      expect(screen.getByText('Nova Pessoa')).toBeTruthy()
      expect(screen.getByText('p1@b.com')).toBeTruthy()
      expect(screen.getByText('Pendente')).toBeTruthy()
      expect(screen.getByRole('button', { name: /Aprovar/ })).toBeTruthy()
      expect(screen.getByRole('button', { name: /Rejeitar/ })).toBeTruthy()
    })

    it('aprovar chama o RPC, recarrega escopo e solicitações (sem reload de página)', async () => {
      mockGetCoordinatorRequests.mockResolvedValue([pendingRequest('p1', 'Nova Pessoa')])
      const refresh = renderHome([unitWithData()])
      await act(async () => {})

      fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }))
      await act(async () => {})

      expect(mockApproveCoordinatorMembership).toHaveBeenCalledWith('ms-p1')
      expect(refresh).toHaveBeenCalled()
      expect(mockGetCoordinatorRequests).toHaveBeenCalledTimes(2)
    })

    it('rejeitar exige confirmação e só então chama o RPC', async () => {
      mockGetCoordinatorRequests.mockResolvedValue([pendingRequest('p1', 'Nova Pessoa')])
      const refresh = renderHome([unitWithData()])
      await act(async () => {})

      fireEvent.click(screen.getByRole('button', { name: /Rejeitar/ }))

      const dialog = screen.getByRole('alertdialog', { name: 'Rejeitar solicitação?' })
      expect(mockRejectCoordinatorMembership).not.toHaveBeenCalled()

      fireEvent.click(within(dialog).getByRole('button', { name: 'Rejeitar' }))
      await act(async () => {})

      expect(mockRejectCoordinatorMembership).toHaveBeenCalledWith('ms-p1')
      expect(refresh).toHaveBeenCalled()
    })

    it('erro ao aprovar → banner honesto e sem refresh falso', async () => {
      mockGetCoordinatorRequests.mockResolvedValue([pendingRequest('p1', 'Nova Pessoa')])
      const refresh = renderHome([unitWithData()])
      await act(async () => {})

      mockApproveCoordinatorMembership.mockResolvedValue(false)
      mockGetLastCoordinatorServiceError.mockReturnValue('only an active coordinator can approve')

      fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }))
      await act(async () => {})

      expect(screen.getByText('only an active coordinator can approve')).toBeTruthy()
      expect(refresh).not.toHaveBeenCalled()
    })

    it('falha ao carregar solicitações → retry recarrega sem derrubar o escopo', async () => {
      mockGetLastCoordinatorServiceError.mockReturnValue('requests denied')
      renderHome([unitWithData()])
      await act(async () => {})

      expect(screen.getByText(/Não foi possível carregar as solicitações/)).toBeTruthy()

      mockGetLastCoordinatorServiceError.mockReturnValue(null)
      fireEvent.click(screen.getAllByRole('button', { name: 'Tentar novamente' })[0])
      await act(async () => {})

      expect(screen.getByText('Nenhuma solicitação pendente.')).toBeTruthy()
      expect(screen.getByText('Unidade: Campus A')).toBeTruthy()
    })
  })

  describe('gestão real — atribuir a gestor (setCoordinatorManager)', () => {
    it('abre o sheet com apenas gestores permitidos; atribui e atualiza a árvore', async () => {
      const refresh = renderHome([twoLeadersUnit()])
      await act(async () => {})

      fireEvent.click(screen.getByRole('button', { name: 'Vincular Técnico 1 a gestor' }))
      expect(screen.getByText('Vincular membro a gestor')).toBeTruthy()

      const dialog = screen.getByRole('dialog', { name: 'Vincular membro a gestor' })
      const radios = within(dialog).getAllByRole('radio')
      expect(radios).toHaveLength(2)
      expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual([
        'coordination-ws1',
        'ms-lider2',
      ])
      expect(within(dialog).getAllByText('Bruno Líder')).toHaveLength(1)
      expect(within(dialog).queryByText('Ana Líder')).toBeNull()

      fireEvent.click(radios[1])
      fireEvent.click(screen.getByRole('button', { name: 'Vincular' }))

      await act(async () => {})

      expect(mockSetCoordinatorManager).toHaveBeenCalledWith('ms-m1', 'ms-lider2')
      expect(refresh).toHaveBeenCalled()
      await waitFor(() => expect(screen.queryByText('Vincular membro a gestor')).toBeNull())
    })

    it('remover da equipe chama setCoordinatorManager(id, null) e atualiza a árvore', async () => {
      const refresh = renderHome([twoLeadersUnit()])
      await act(async () => {})

      fireEvent.click(screen.getByRole('button', { name: 'Remover Técnico 1 da equipe' }))

      await act(async () => {})

      expect(mockSetCoordinatorManager).toHaveBeenCalledWith('ms-m1', null)
      expect(refresh).toHaveBeenCalled()
    })

    it('erro do RPC na atribuição → mensagem inline no sheet, NÃO fecha, NÃO refresca', async () => {
      const refresh = renderHome([twoLeadersUnit()])
      await act(async () => {})
      mockSetCoordinatorManager.mockResolvedValue(false)
      mockGetLastCoordinatorServiceError.mockReturnValue('manager is outside the coordinator scope in this unit')

      fireEvent.click(screen.getByRole('button', { name: 'Vincular Técnico 1 a gestor' }))
      fireEvent.click(screen.getAllByRole('radio')[0])
      fireEvent.click(screen.getByRole('button', { name: 'Vincular' }))

      await act(async () => {})

      expect(screen.getByText('Vincular membro a gestor')).toBeTruthy()
      expect(
        screen.getByText('manager is outside the coordinator scope in this unit'),
      ).toBeTruthy()
      expect(mockSetCoordinatorManager).toHaveBeenCalledWith('ms-m1', 'coordination-ws1')
      expect(refresh).not.toHaveBeenCalled()
    })

    it('erro do RPC na remoção → banner de erro honesto, sem refresh falso', async () => {
      const refresh = renderHome([twoLeadersUnit()])
      await act(async () => {})
      mockSetCoordinatorManager.mockResolvedValue(false)
      mockGetLastCoordinatorServiceError.mockReturnValue('guard 046 rejeitou: ciclo de gestão')

      fireEvent.click(screen.getByRole('button', { name: 'Remover Técnico 1 da equipe' }))

      await act(async () => {})

      expect(screen.getByText(/guard 046 rejeitou: ciclo de gestão/)).toBeTruthy()
      expect(refresh).not.toHaveBeenCalled()
    })
  })

  describe('gestão de cargo e status (setCoordinatorRole / suspend / remove)', () => {
    function unitWithManagedMember(): CoordinatedUnit {
      const unit = unitWithData()
      unit.leaders[0].members[0].membership.role_id = 'role-technician'
      return unit
    }

    async function openManage(name: string) {
      fireEvent.click(screen.getByRole('button', { name: `Gerenciar ${name}` }))
      await act(async () => {})
      return screen.getByRole('dialog', { name: 'Gerenciar membro' })
    }

    it('oferece SOMENTE tec/vis/est/opv/lider e pré-seleciona o cargo atual', async () => {
      mockGetCoordinatorAssignableRoles.mockResolvedValue(assignableRoles)
      renderHome([unitWithManagedMember()])
      await act(async () => {})

      const dialog = await openManage('Técnico 1')
      const radios = within(dialog).getAllByRole('radio')

      const values = radios.map((r) => (r as HTMLInputElement).value)
      expect(values).toEqual(['tec', 'vis', 'est', 'opv', 'lider'])
      expect(values).not.toContain('adm')
      expect(values).not.toContain('coordinator')
      expect((within(dialog).getByRole('radio', { name: 'Técnico' }) as HTMLInputElement).checked).toBe(true)
    })

    it('salvar cargo envia só o slug permitido e atualiza a árvore', async () => {
      mockGetCoordinatorAssignableRoles.mockResolvedValue(assignableRoles)
      const refresh = renderHome([unitWithManagedMember()])
      await act(async () => {})

      const dialog = await openManage('Técnico 1')
      fireEvent.click(within(dialog).getByRole('radio', { name: 'Gestor de Estoque' }))
      fireEvent.click(screen.getByRole('button', { name: 'Salvar cargo' }))

      await act(async () => {})

      expect(mockSetCoordinatorRole).toHaveBeenCalledWith('ms-m1', 'est')
      expect(refresh).toHaveBeenCalled()
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Gerenciar membro' })).toBeNull())
    })

    it('erro do servidor na troca de cargo → erro inline, NÃO fecha, NÃO refresca', async () => {
      mockGetCoordinatorAssignableRoles.mockResolvedValue(assignableRoles)
      const refresh = renderHome([unitWithManagedMember()])
      await act(async () => {})

      const dialog = await openManage('Técnico 1')
      fireEvent.click(within(dialog).getByRole('radio', { name: 'Líder' }))

      mockSetCoordinatorRole.mockResolvedValue(false)
      mockGetLastCoordinatorServiceError.mockReturnValue(
        'only active memberships can have their role changed',
      )
      fireEvent.click(screen.getByRole('button', { name: 'Salvar cargo' }))
      await act(async () => {})

      expect(screen.getByRole('dialog', { name: 'Gerenciar membro' })).toBeTruthy()
      expect(screen.getByText('only active memberships can have their role changed')).toBeTruthy()
      expect(refresh).not.toHaveBeenCalled()
    })

    it('suspender exige confirmação e chama o RPC escopado', async () => {
      const refresh = renderHome([unitWithManagedMember()])
      await act(async () => {})

      await openManage('Técnico 1')
      fireEvent.click(screen.getByRole('button', { name: 'Suspender' }))

      const confirm = screen.getByRole('alertdialog', { name: 'Suspender membro?' })
      expect(mockSuspendCoordinatorMembership).not.toHaveBeenCalled()

      fireEvent.click(within(confirm).getByRole('button', { name: 'Suspender' }))
      await act(async () => {})

      expect(mockSuspendCoordinatorMembership).toHaveBeenCalledWith('ms-m1')
      expect(refresh).toHaveBeenCalled()
    })

    it('remover da unidade exige confirmação e chama o RPC escopado', async () => {
      const refresh = renderHome([unitWithManagedMember()])
      await act(async () => {})

      await openManage('Técnico 1')
      fireEvent.click(screen.getByRole('button', { name: 'Remover da unidade' }))

      const confirm = screen.getByRole('alertdialog', { name: 'Remover da unidade?' })
      fireEvent.click(within(confirm).getByRole('button', { name: 'Remover' }))
      await act(async () => {})

      expect(mockRemoveCoordinatorMembership).toHaveBeenCalledWith('ms-m1')
      expect(refresh).toHaveBeenCalled()
    })

    it('duas ações distintas de status: erro na remoção mantém o diálogo e mostra o motivo', async () => {
      const refresh = renderHome([unitWithManagedMember()])
      await act(async () => {})

      await openManage('Técnico 1')
      fireEvent.click(screen.getByRole('button', { name: 'Remover da unidade' }))

      const confirm = screen.getByRole('alertdialog', { name: 'Remover da unidade?' })
      mockRemoveCoordinatorMembership.mockResolvedValue(false)
      mockGetLastCoordinatorServiceError.mockReturnValue('only active memberships can be removed')
      fireEvent.click(within(confirm).getByRole('button', { name: 'Remover' }))
      await act(async () => {})

      expect(screen.getByRole('alertdialog', { name: 'Remover da unidade?' })).toBeTruthy()
      expect(screen.getByText('only active memberships can be removed')).toBeTruthy()
      expect(refresh).not.toHaveBeenCalled()
    })

    it('gerenciar liderança também está disponível (não só membros)', async () => {
      mockGetCoordinatorAssignableRoles.mockResolvedValue(assignableRoles)
      renderHome([unitWithManagedMember()])
      await act(async () => {})

      const dialog = await openManage('Ana Líder')
      expect(within(dialog).getAllByRole('radio')).toHaveLength(5)
    })
  })

  describe('gestão real — impedir ações duplicadas', () => {
    it('enquanto uma escrita está em andamento, todas as ações de gestão são desabilitadas', async () => {
      renderHome([twoLeadersUnit()])
      await act(async () => {})

      let resolveAssign!: (v: boolean) => void
      mockSetCoordinatorManager.mockReturnValue(new Promise((res) => { resolveAssign = res }))

      fireEvent.click(screen.getByRole('button', { name: 'Vincular Técnico 1 a gestor' }))
      fireEvent.click(screen.getAllByRole('radio')[1])
      fireEvent.click(screen.getByRole('button', { name: 'Vincular' }))

      await act(async () => {})

      expect(screen.getByText('Vinculando...')).toBeTruthy()
      expect(
        (screen.getByRole('button', { name: 'Remover Técnico 2 da equipe' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true)
      expect(
        (screen.getByRole('button', { name: 'Vincular Técnico 2 a gestor' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true)

      await act(async () => {
        resolveAssign(true)
      })
    })

    it('não oferece criação de membership; oferece vincular/gerenciar/remover', async () => {
      renderHome([unitWithData()])
      await act(async () => {})

      const createLabels = screen.getAllByRole('button').filter((b) => {
        const label = (b as HTMLButtonElement).title
        return /criar|cadastrar/i.test(label ?? '')
      })
      expect(createLabels).toHaveLength(0)
      expect(screen.getByRole('button', { name: 'Vincular Técnico 1 a gestor' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Gerenciar Técnico 1' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Remover Técnico 1 da equipe' })).toBeTruthy()
    })
  })

  describe('Fase 10 — membros inativos (suspended/removed)', () => {
    it('separa Suspensos (restaurável) de Removidos (informativo, sem ação)', async () => {
      mockGetCoordinatorInactiveMembers.mockResolvedValue([
        inactiveMember('s1', 'Suspenso Um', 'suspended'),
        inactiveMember('r1', 'Removido Um', 'removed'),
      ])
      renderHome([unitWithData()])
      await act(async () => {})

      expect(screen.getByText('Membros inativos')).toBeTruthy()
      expect(screen.getByText('Suspensos')).toBeTruthy()
      expect(screen.getByText('Removidos')).toBeTruthy()
      expect(screen.getByText('Suspenso Um')).toBeTruthy()
      expect(screen.getByText('Removido Um')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Restaurar Suspenso Um' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Restaurar Removido Um' })).toBeNull()
      expect(screen.getByText('Restauração indisponível')).toBeTruthy()
      expect(mockGetCoordinatorInactiveMembers).toHaveBeenCalledWith('ws1')
    })

    it('restaurar exige confirmação e, ao confirmar, chama o RPC e recarrega', async () => {
      mockGetCoordinatorInactiveMembers.mockResolvedValue([
        inactiveMember('s1', 'Suspenso Um', 'suspended'),
      ])
      const refresh = renderHome([unitWithData()])
      await act(async () => {})

      fireEvent.click(screen.getByRole('button', { name: 'Restaurar Suspenso Um' }))
      const dialog = screen.getByRole('alertdialog', { name: 'Restaurar membro?' })
      expect(mockRestoreCoordinatorMembership).not.toHaveBeenCalled()

      fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurar' }))
      await act(async () => {})

      expect(mockRestoreCoordinatorMembership).toHaveBeenCalledWith('ms-s1')
      expect(refresh).toHaveBeenCalled()
      expect(mockGetCoordinatorInactiveMembers).toHaveBeenCalledTimes(2)
    })

    it('erro ao restaurar → mensagem honesta no diálogo, sem refresh falso', async () => {
      mockGetCoordinatorInactiveMembers.mockResolvedValue([
        inactiveMember('s1', 'Suspenso Um', 'suspended'),
      ])
      const refresh = renderHome([unitWithData()])
      await act(async () => {})

      mockRestoreCoordinatorMembership.mockResolvedValue(false)
      mockGetLastCoordinatorServiceError.mockReturnValue(
        'administrative or coordination memberships cannot be restored by the RPC',
      )

      fireEvent.click(screen.getByRole('button', { name: 'Restaurar Suspenso Um' }))
      fireEvent.click(
        within(screen.getByRole('alertdialog', { name: 'Restaurar membro?' })).getByRole('button', {
          name: 'Restaurar',
        }),
      )
      await act(async () => {})

      expect(
        screen.getByText('administrative or coordination memberships cannot be restored by the RPC'),
      ).toBeTruthy()
      expect(refresh).not.toHaveBeenCalled()
    })

    it('falha ao carregar inativos → seção honesta + retry recarrega sem derrubar o escopo', async () => {
      mockGetLastCoordinatorServiceError.mockReturnValue('inactive denied')
      renderHome([unitWithData()])
      await act(async () => {})

      expect(screen.getByText(/Não foi possível carregar os membros inativos/)).toBeTruthy()

      mockGetLastCoordinatorServiceError.mockReturnValue(null)
      mockGetCoordinatorInactiveMembers.mockResolvedValue([
        inactiveMember('s1', 'Suspenso Um', 'suspended'),
      ])
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Tentar novamente' }).at(-1) as HTMLButtonElement,
      )
      await act(async () => {})

      expect(screen.getByText('Suspenso Um')).toBeTruthy()
      expect(screen.getByText('Unidade: Campus A')).toBeTruthy()
    })

    it('impede restauração duplicada enquanto a escrita está em andamento', async () => {
      mockGetCoordinatorInactiveMembers.mockResolvedValue([
        inactiveMember('s1', 'Suspenso Um', 'suspended'),
      ])
      const refresh = renderHome([unitWithData()])
      await act(async () => {})

      let resolveRestore!: (v: boolean) => void
      mockRestoreCoordinatorMembership.mockReturnValue(
        new Promise((res) => {
          resolveRestore = res
        }),
      )

      fireEvent.click(screen.getByRole('button', { name: 'Restaurar Suspenso Um' }))
      fireEvent.click(
        within(screen.getByRole('alertdialog', { name: 'Restaurar membro?' })).getByRole('button', {
          name: 'Restaurar',
        }),
      )
      await act(async () => {})

      expect(
        (screen.getByRole('button', { name: 'Restaurar Suspenso Um' }) as HTMLButtonElement).disabled,
      ).toBe(true)

      await act(async () => {
        resolveRestore(true)
      })

      expect(mockRestoreCoordinatorMembership).toHaveBeenCalledTimes(1)
      expect(refresh).toHaveBeenCalled()
    })
  })

  describe('Central do Coordenador — Visão da unidade (RPC 070, READ-ONLY)', () => {
    const overviewFixture: CoordinatorUnitOverview = {
      workspace: { id: 'ws1', name: 'Campus A' },
      tickets: { open: 2, in_progress: 3, unassigned: 4, high_priority: 2, urgent: 1 },
      recent: [
        {
          id: 'tk-1',
          ticketNumber: 7,
          roomName: 'Sala 101',
          problemCategory: 'Imprensa',
          status: 'em_atendimento',
          priority: 'alta',
          assignedToUserId: '',
          createdAt: '2026-01-11T00:00:00Z',
          updatedAt: '2026-01-11T00:00:00Z',
        },
      ],
    }

    it('mostra os totais da unidade vindos do RPC, sem inventar números', async () => {
      mockGetCoordinatorUnitOverview.mockResolvedValue(overviewFixture)
      renderHome([unitWithData()])
      await act(async () => {})

      expect(mockGetCoordinatorUnitOverview).toHaveBeenCalledWith('ws1')
      expect(screen.getByText('Visão da unidade')).toBeTruthy()
      expect(screen.getByTestId('unit-stat-open')).toHaveTextContent('Abertos2')
      expect(screen.getByTestId('unit-stat-in_progress')).toHaveTextContent('Em andamento3')
      expect(screen.getByTestId('unit-stat-unassigned')).toHaveTextContent('Sem responsável4')
      expect(screen.getByTestId('unit-stat-high_priority')).toHaveTextContent('Alta prioridade2')
      expect(screen.getByTestId('unit-stat-urgent')).toHaveTextContent('Urgentes1')
      expect(screen.getByText('Sala 101 — Imprensa')).toBeTruthy()
      expect(screen.getByText(/#7/)).toBeTruthy()
    })

    it('falha na visão (ex.: negado pelo RPC) → erro honesto + retry sem derrubar o escopo', async () => {
      mockGetCoordinatorUnitOverview.mockResolvedValue(null)
      mockGetLastCoordinatorServiceError.mockReturnValue(
        'only an active coordinator of this unit can view its overview',
      )
      renderHome([unitWithData()])
      await act(async () => {})

      expect(screen.getByText(/Não foi possível carregar a visão desta unidade/)).toBeTruthy()

      mockGetLastCoordinatorServiceError.mockReturnValue(null)
      mockGetCoordinatorUnitOverview.mockResolvedValue(overviewFixture)
      fireEvent.click(
        within(screen.getByTestId('coordinator-unit-overview')).getByRole('button', {
          name: 'Tentar novamente',
        }),
      )
      await act(async () => {})

      expect(screen.getByTestId('unit-stat-open')).toHaveTextContent('Abertos2')
      expect(screen.getByText('Unidade: Campus A')).toBeTruthy()
    })

    it('unidade vazia (zeros honestos) não é erro', async () => {
      mockGetCoordinatorUnitOverview.mockResolvedValue({
        workspace: { id: 'ws1', name: 'Campus A' },
        tickets: { open: 0, in_progress: 0, unassigned: 0, high_priority: 0, urgent: 0 },
        recent: [],
      })
      renderHome([unitWithData()])
      await act(async () => {})

      expect(screen.getByTestId('unit-stat-open')).toHaveTextContent('Abertos0')
      expect(screen.queryByText(/Sala 101/)).toBeNull()
      expect(mockGetLastCoordinatorServiceError()).toBeNull()
    })

    it('Abrir chamados troca o workspace ativo para a unidade e navega ao app existente', async () => {
      const target = { id: 'ws1', name: 'Campus A', slug: 'campus-a' }
      workspaceContextMock.workspaces = [target]
      mockGetCoordinatorUnitOverview.mockResolvedValue(overviewFixture)
      renderHome([unitWithData()])
      await act(async () => {})

      fireEvent.click(screen.getByRole('button', { name: 'Abrir chamados' }))

      expect(workspaceContextMock.setWorkspace).toHaveBeenCalledWith(target, {
        persist: false,
      })
      expect(mockNavigate).toHaveBeenCalledWith('/chamados')
    })

    it('Fase 2.1 — card "Abertos" troca o workspace e navega com o query param do filtro', async () => {
      const target = { id: 'ws1', name: 'Campus A', slug: 'campus-a' }
      workspaceContextMock.workspaces = [target]
      mockGetCoordinatorUnitOverview.mockResolvedValue(overviewFixture)
      renderHome([unitWithData()])
      await act(async () => {})

      fireEvent.click(screen.getByTestId('unit-stat-open'))

      expect(workspaceContextMock.setWorkspace).toHaveBeenCalledWith(target, {
        persist: false,
      })
      expect(mockNavigate).toHaveBeenCalledWith('/chamados?status=aberto')
    })

    it('Fase 2.1 — card "Sem responsável" navega com ?unassigned=1', async () => {
      const target = { id: 'ws1', name: 'Campus A', slug: 'campus-a' }
      workspaceContextMock.workspaces = [target]
      mockGetCoordinatorUnitOverview.mockResolvedValue(overviewFixture)
      renderHome([unitWithData()])
      await act(async () => {})

      fireEvent.click(screen.getByTestId('unit-stat-unassigned'))

      expect(workspaceContextMock.setWorkspace).toHaveBeenCalledWith(target, {
        persist: false,
      })
      expect(mockNavigate).toHaveBeenCalledWith('/chamados?unassigned=1')
    })

    it('Fase 2.1 — chamado recente navega ao detail existente e troca o workspace quando a unidade difere da ativa', async () => {
      const target = { id: 'ws1', name: 'Campus A', slug: 'campus-a' }
      workspaceContextMock.workspaces = [target]
      workspaceContextMock.workspace = { id: 'ws9', name: 'Outra', slug: 'outra' }
      mockGetCoordinatorUnitOverview.mockResolvedValue(overviewFixture)
      renderHome([unitWithData()])
      await act(async () => {})

      fireEvent.click(screen.getByTestId('unit-recent-tk-1'))

      expect(workspaceContextMock.setWorkspace).toHaveBeenCalledWith(target, {
        persist: false,
      })
      expect(mockNavigate).toHaveBeenCalledWith('/chamados/tickets/tk-1')
    })

    it('Fase 2.1 — chamado da unidade já ativa navega sem troca desnecessária de workspace', async () => {
      const target = { id: 'ws1', name: 'Campus A', slug: 'campus-a' }
      workspaceContextMock.workspaces = [target]
      workspaceContextMock.workspace = target
      mockGetCoordinatorUnitOverview.mockResolvedValue(overviewFixture)
      renderHome([unitWithData()])
      await act(async () => {})

      fireEvent.click(screen.getByTestId('unit-recent-tk-1'))

      expect(workspaceContextMock.setWorkspace).not.toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/chamados/tickets/tk-1')
    })

    it('unidade fora do contexto de workspaces → nenhuma ação de abrir chamados (fail-safe)', async () => {
      workspaceContextMock.workspaces = [{ id: 'ws9', name: 'Outra', slug: 'outra' }]
      mockGetCoordinatorUnitOverview.mockResolvedValue(overviewFixture)
      renderHome([unitWithData()])
      await act(async () => {})

      expect(screen.queryByRole('button', { name: 'Abrir chamados' })).toBeNull()
    })
  })

  describe('Fase 2.2.1 — SLA por unidade (services/sla.ts, cache autorizado)', () => {
  const NOW = new Date('2026-08-13T10:00:00Z')
  const HOUR = 1000 * 60 * 60

  const slaTicket = (id: string, workspaceId: string, createdAt: string, priority = 'normal') => ({
    id,
    workspace_id: workspaceId,
    roomId: '',
    roomName: 'Sala',
    problemCategory: 'Problema',
    status: 'aberto',
    priority,
    createdAt,
    updatedAt: createdAt,
    archived: false,
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    clearCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearCache()
  })

  it('SLA aparece para cada unidade, isolado por workspace_id (1 leitura do cache)', async () => {
    setCol('chamados', [
      slaTicket('ok-ws1', 'ws1', new Date(NOW.getTime() - 1 * HOUR).toISOString()),
      slaTicket('overdue-ws1', 'ws1', new Date(NOW.getTime() - 30 * HOUR).toISOString()),
      slaTicket('ok-ws2', 'ws2', new Date(NOW.getTime() - 1 * HOUR).toISOString()),
    ])
    mockGetCoordinatorUnitOverview.mockResolvedValue(null)
    renderHome([unitWithData()])
    await act(async () => {})

    expect(screen.getByTestId('sla-stat-within')).toHaveTextContent('Dentro do SLA1')
    expect(screen.getByTestId('sla-stat-overdue')).toHaveTextContent('Vencidos1')
    expect(screen.getByTestId('sla-stat-rate')).toHaveTextContent('Taxa de SLA50%')
  })

  it('configuração customizada da unidade é respeitada (sla_configs)', async () => {
    setCol('chamados', [
      slaTicket('near-default', 'ws1', new Date(NOW.getTime() - 20 * HOUR).toISOString()),
    ])
    setCol('sla_configs', [
      {
        id: 'ws1',
        workspace_id: 'ws1',
        hours: { baixa: 72, normal: 2, alta: 8, urgente: 2 },
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ])
    mockGetCoordinatorUnitOverview.mockResolvedValue(null)
    renderHome([unitWithData()])
    await act(async () => {})

    expect(screen.getByTestId('sla-stat-overdue')).toHaveTextContent('Vencidos1')
    expect(screen.getByTestId('sla-stat-near')).toHaveTextContent('Próximos do vencimento0')
  })

  it('unidade sem chamados com SLA aplicável → zeros honestos e taxa "—"', async () => {
    setCol('chamados', [
      {
        ...slaTicket('resolvido-ws1', 'ws1', new Date(NOW.getTime() - 1 * HOUR).toISOString()),
        status: 'resolvido',
      },
    ])
    mockGetCoordinatorUnitOverview.mockResolvedValue(null)
    renderHome([unitWithData()])
    await act(async () => {})

    expect(screen.getByTestId('sla-stat-within')).toHaveTextContent('Dentro do SLA0')
    expect(screen.getByTestId('sla-stat-rate')).toHaveTextContent('Taxa de SLA—')
  })

  it('navegação do SLA preserva o mecanismo da Fase 2.1 (setWorkspace persist:false)', async () => {
    const target = { id: 'ws1', name: 'Campus A', slug: 'campus-a' }
    workspaceContextMock.workspaces = [target]
    workspaceContextMock.workspace = { id: 'ws9', name: 'Outra', slug: 'outra' }
    setCol('chamados', [
      slaTicket('ok-ws1', 'ws1', new Date(NOW.getTime() - 1 * HOUR).toISOString()),
    ])
    mockGetCoordinatorUnitOverview.mockResolvedValue(null)
    renderHome([unitWithData()])
    await act(async () => {})

    fireEvent.click(screen.getByTestId('sla-stat-within'))

    expect(workspaceContextMock.setWorkspace).toHaveBeenCalledWith(target, {
      persist: false,
    })
    expect(mockNavigate).toHaveBeenCalledWith('/chamados')
  })

  it('SLA reage a mudanças no cache bruto via sinal passivo (sem remontar o ciclo)', async () => {
    setCol('chamados', [slaTicket('t-at', 'ws1', new Date(NOW.getTime() - 30 * HOUR).toISOString())])
    mockGetCoordinatorUnitOverview.mockResolvedValue(null)
    renderHome([unitWithData()])
    await act(async () => {})

    expect(screen.getByTestId('sla-stat-overdue')).toHaveTextContent('Vencidos1')

    // Cache bruto muda (pelo ciclo já montado no app de chamados ou por
    // qualquer gravação local) → onCollectionChange('chamados') — emitido pelo
    // setCol existente — faz o Central recomputar sem novo poll/subscription.
    act(() => {
      setCol('chamados', [
        slaTicket('t-at', 'ws1', new Date(NOW.getTime() - 1 * HOUR).toISOString()),
      ])
    })

    expect(screen.getByTestId('sla-stat-overdue')).toHaveTextContent('Vencidos0')
    expect(screen.getByTestId('sla-stat-within')).toHaveTextContent('Dentro do SLA1')
  })

  it('Central NÃO cria segundo ciclo de tickets: sem setInterval de polling e sem pullRemote', async () => {
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const pullSpy = vi.spyOn(ticketService, 'pullRemote')
    setCol('chamados', [slaTicket('t-at', 'ws1', new Date(NOW.getTime() - 30 * HOUR).toISOString())])
    mockGetCoordinatorUnitOverview.mockResolvedValue(null)
    renderHome([unitWithData()])
    await act(async () => {})

    expect(screen.getByTestId('sla-stat-overdue')).toHaveTextContent('Vencidos1')
    // O ciclo 15s + realtime + pullRemote vive apenas no app de chamados; o
    // Central monta o SLA apenas como leitor passivo do cache bruto.
    expect(intervalSpy).not.toHaveBeenCalled()
    expect(pullSpy).not.toHaveBeenCalled()
    intervalSpy.mockRestore()
    pullSpy.mockRestore()
  })
})

describe('Visão geral (PR B) — KPIs, recentes, SLA e solicitações globais', () => {
  const NOW = new Date('2026-08-13T10:00:00Z')
  const HOUR = 1000 * 60 * 60

  const cacheTicket = (id: string, workspaceId: string, over: Partial<Ticket> = {}): Ticket => ({
    id,
    ticketNumber: 7,
    workspace_id: workspaceId,
    roomId: '',
    roomName: 'Sala 101',
    assetName: '',
    problemCategory: 'Internet',
    problemDescription: '',
    status: 'aberto',
    priority: 'normal',
    reportedBy: '',
    reportedByEmail: '',
    assignedTo: '',
    assignedToUserId: 'u-tech',
    archived: false,
    resolvedAt: null,
    createdAt: new Date(NOW.getTime() - 1 * HOUR).toISOString(),
    updatedAt: new Date(NOW.getTime() - 1 * HOUR).toISOString(),
    ...over,
  })

  function secondUnit(): CoordinatedUnit {
    return {
      coordination: membership('coordination-ws2', 'u-coord2', 'ws2'),
      unitId: 'ws2',
      unitName: 'Campus B',
      leaders: [
        {
          leadership: membership('ms-lider3', 'u-lider3', 'ws2', {
            managed_by: 'coordination-ws2',
            role_id: 'role-lider',
          }),
          profile: {
            id: 'u-lider3',
            name: 'Carla Líder',
            email: 'carla@b.com',
            status: 'active',
            roleId: 'role-lider',
          },
          members: [teamMember('m9', 'Técnico 9', 'role-technician', 'ms-lider3')],
        },
      ],
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    clearCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearCache()
  })

  it('KPIs de chamados leem o cache do escopo e ignoram o resto (sem inventar números)', async () => {
    setCol('chamados', [
      cacheTicket('t-aberto', 'ws1', { status: 'aberto' }),
      cacheTicket('t-em-atendimento', 'ws1', { status: 'em_atendimento', assignedToUserId: '' }),
      cacheTicket('t-fora', 'ws2', { status: 'aberto' }),
    ])
    mockGetCoordinatorUnitOverview.mockResolvedValue(null)
    renderHome([unitWithData()])
    await act(async () => {})

    expect(screen.getByTestId('overview-kpi-aberto')).toHaveTextContent('Chamados abertos')
    expect(screen.getByTestId('overview-kpi-aberto')).toHaveTextContent('1')
    expect(screen.getByTestId('overview-kpi-em_atendimento')).toHaveTextContent('Em atendimento')
    expect(screen.getByTestId('overview-kpi-em_atendimento')).toHaveTextContent('1')
    expect(screen.getByTestId('overview-kpi-unassigned')).toHaveTextContent('Sem responsável')
    expect(screen.getByTestId('overview-kpi-unassigned')).toHaveTextContent('1')
    expect(screen.getByTestId('overview-sla-within')).toHaveTextContent('Dentro do SLA')
    expect(screen.getByTestId('overview-sla-within')).toHaveTextContent('2')
    expect(screen.getByTestId('overview-sla-rate')).toHaveTextContent('Taxa de SLA')
    expect(screen.getByTestId('overview-sla-rate')).toHaveTextContent('100%')
  })

  it('escopo multiunidade: KPIs somam as unidades do escopo e ficam somente-leitura', async () => {
    setCol('chamados', [
      cacheTicket('a', 'ws1', { status: 'aberto' }),
      cacheTicket('b', 'ws1', { status: 'aberto' }),
      cacheTicket('c', 'ws2', { status: 'aberto' }),
      cacheTicket('fora', 'ws3', { status: 'aberto' }),
    ])
    mockGetCoordinatorUnitOverview.mockResolvedValue(null)
    renderHome([unitWithData(), secondUnit()])
    await act(async () => {})

    expect(screen.getByTestId('overview-kpi-aberto')).toHaveTextContent('Chamados abertos')
    expect(screen.getByTestId('overview-kpi-aberto')).toHaveTextContent('3')
    // Sem escopo de UMA unidade, o card global não pode escolher um workspace:
    // deve ser um bloco de leitura, não um botão.
    expect((screen.getByTestId('overview-kpi-aberto') as HTMLElement).tagName).toBe('DIV')
    expect((screen.getByTestId('overview-kpi-overdue') as HTMLElement).tagName).toBe('DIV')
    expect(screen.queryByTestId('overview-recent-fora')).toBeNull()
  })

  it('escopo de UMA unidade: cards globais navegam com os deep links da PR A', async () => {
    const target = { id: 'ws1', name: 'Campus A', slug: 'campus-a' }
    workspaceContextMock.workspaces = [target]
    setCol('chamados', [
      cacheTicket('t-near', 'ws1', { createdAt: new Date(NOW.getTime() - 20 * HOUR).toISOString() }),
      cacheTicket('t-overdue', 'ws1', {
        createdAt: new Date(NOW.getTime() - 30 * HOUR).toISOString(),
      }),
    ])
    mockGetCoordinatorUnitOverview.mockResolvedValue(null)
    renderHome([unitWithData()])
    await act(async () => {})

    fireEvent.click(screen.getByTestId('overview-kpi-aberto'))
    expect(workspaceContextMock.setWorkspace).toHaveBeenCalledWith(target, { persist: false })
    expect(mockNavigate).toHaveBeenLastCalledWith('/chamados?status=aberto')

    fireEvent.click(screen.getByTestId('overview-kpi-near'))
    expect(mockNavigate).toHaveBeenLastCalledWith('/chamados?sla=near')

    fireEvent.click(screen.getByTestId('overview-kpi-overdue'))
    expect(mockNavigate).toHaveBeenLastCalledWith('/chamados?sla=overdue')

    fireEvent.click(screen.getByTestId('overview-sla-within'))
    expect(mockNavigate).toHaveBeenLastCalledWith('/chamados')
  })

  it('recentes: últimos chamados do cache no escopo, cada um abre o detail existente', async () => {
    const target = { id: 'ws1', name: 'Campus A', slug: 'campus-a' }
    workspaceContextMock.workspaces = [target]
    workspaceContextMock.workspace = { id: 'ws9', name: 'Outra', slug: 'outra' }
    setCol('chamados', [
      cacheTicket('tk-1', 'ws1', { updatedAt: new Date(NOW.getTime() - 1000).toISOString() }),
      cacheTicket('tk-2', 'ws1', {
        problemCategory: 'Projetor',
        ticketNumber: 8,
        updatedAt: new Date(NOW.getTime() - 2 * HOUR).toISOString(),
      }),
      cacheTicket('tk-fora', 'ws2', { problemCategory: 'Áudio' }),
    ])
    mockGetCoordinatorUnitOverview.mockResolvedValue(null)
    renderHome([unitWithData()])
    await act(async () => {})

    expect(screen.getByText('Sala 101 — Internet')).toBeTruthy()
    expect(screen.getByText('Sala 101 — Projetor')).toBeTruthy()
    expect(screen.getByText('#7')).toBeTruthy()
    expect(screen.getByText('#8')).toBeTruthy()
    expect(screen.queryByText('Sala 101 — Áudio')).toBeNull()

    fireEvent.click(screen.getByTestId('overview-recent-tk-1'))
    expect(workspaceContextMock.setWorkspace).toHaveBeenCalledWith(target, { persist: false })
    expect(mockNavigate).toHaveBeenCalledWith('/chamados/tickets/tk-1')
  })

  it('recentes: unidade fora do contexto de workspaces → item sem ação (fail-safe)', async () => {
    workspaceContextMock.workspaces = [{ id: 'ws9', name: 'Outra', slug: 'outra' }]
    setCol('chamados', [cacheTicket('tk-1', 'ws1')])
    mockGetCoordinatorUnitOverview.mockResolvedValue(null)
    renderHome([unitWithData()])
    await act(async () => {})

    expect((screen.getByTestId('overview-recent-tk-1') as HTMLElement).tagName).toBe('SPAN')
    expect(
      within(screen.getByTestId('overview-recents')).queryByRole('button'),
    ).toBeNull()
  })

  it('solicitações globais consolidam as unidades e substituem o bloco da grid', async () => {
    mockGetCoordinatorRequests.mockResolvedValue([pendingRequest('p1', 'Nova Pessoa')])
    mockGetCoordinatorUnitOverview.mockResolvedValue(null)
    renderHome([unitWithData()])
    await act(async () => {})

    const panel = screen.getByTestId('overview-requests')
    expect(within(panel).getByText('Nova Pessoa')).toBeTruthy()
    expect(within(panel).getByText('p1@b.com')).toBeTruthy()
    expect(within(panel).getByText('Pendente')).toBeTruthy()
    expect(within(panel).getByText('Campus A')).toBeTruthy()
    // Consolidação: o nome aparece só uma vez na tela (não duplicado na grid).
    expect(screen.getAllByText('Nova Pessoa')).toHaveLength(1)

    fireEvent.click(within(panel).getByRole('button', { name: /Aprovar/ }))
    await act(async () => {})
    expect(mockApproveCoordinatorMembership).toHaveBeenCalledWith('ms-p1')
  })

  it('SLA global reage ao cache bruto pelo sinal passivo da PR A', async () => {
    setCol('chamados', [cacheTicket('t-at', 'ws1', { createdAt: new Date(NOW.getTime() - 30 * HOUR).toISOString() })])
    mockGetCoordinatorUnitOverview.mockResolvedValue(null)
    renderHome([unitWithData()])
    await act(async () => {})

    expect(screen.getByTestId('overview-sla-overdue')).toHaveTextContent('Vencidos')
    expect(screen.getByTestId('overview-sla-overdue')).toHaveTextContent('1')

    act(() => {
      setCol('chamados', [
        cacheTicket('t-at', 'ws1', { createdAt: new Date(NOW.getTime() - 1 * HOUR).toISOString() }),
      ])
    })

    expect(screen.getByTestId('overview-sla-overdue')).toHaveTextContent('Vencidos')
    expect(screen.getByTestId('overview-sla-overdue')).toHaveTextContent('0')
    expect(screen.getByTestId('overview-sla-within')).toHaveTextContent('Dentro do SLA')
    expect(screen.getByTestId('overview-sla-within')).toHaveTextContent('1')
  })
})

describe('responsivo (Fase 1) — layout por faixa via camada src/responsive', () => {
    it('compact: coluna única, sem painel lateral (comportamento legado)', async () => {
      setBp('compact')
      renderHome([unitWithData()])
      await act(async () => {})

      expect(screen.queryByTestId('coordinator-side-info')).toBeNull()
      expect(screen.getByText('Unidade: Campus A')).toBeTruthy()
    })

    it('desktop: painel lateral (aside) ao lado da grade de unidades', async () => {
      setBp('desktop')
      renderHome([twoLeadersUnit()])
      await act(async () => {})

      expect(screen.getByTestId('coordinator-side-info')).toBeInTheDocument()
      expect(screen.getByText('Unidade: Campus A')).toBeTruthy()
      expect(screen.getByText('Ana Líder')).toBeTruthy()
    })

    it('wide: mesmo painel lateral (grade densa)', async () => {
      setBp('wide')
      renderHome([unitWithData()])
      await act(async () => {})

      expect(screen.getByTestId('coordinator-side-info')).toBeInTheDocument()
      expect(screen.getByText('Unidade: Campus A')).toBeTruthy()
    })

    it('sheet em desktop/wide renderiza como Dialog (Radix) com o mesmo conteúdo', async () => {
      setBp('desktop')
      renderHome([twoLeadersUnit()])
      await act(async () => {})

      fireEvent.click(screen.getByRole('button', { name: 'Vincular Técnico 1 a gestor' }))

      const dialog = screen.getByRole('dialog', { name: 'Vincular membro a gestor' })
      expect(within(dialog).getAllByRole('radio')).toHaveLength(2)
      expect(within(dialog).getAllByText('Bruno Líder')).toHaveLength(1)
    })

    it('confirmação destrutiva preserva alertdialog também no desktop', async () => {
      mockGetCoordinatorRequests.mockResolvedValue([pendingRequest('p1', 'Nova Pessoa')])
      setBp('wide')
      renderHome([unitWithData()])
      await act(async () => {})

      fireEvent.click(screen.getByRole('button', { name: /Rejeitar/ }))

      const confirm = screen.getByRole('alertdialog', { name: 'Rejeitar solicitação?' })
      expect(mockRejectCoordinatorMembership).not.toHaveBeenCalled()

      fireEvent.click(within(confirm).getByRole('button', { name: 'Rejeitar' }))
      await act(async () => {})

      expect(mockRejectCoordinatorMembership).toHaveBeenCalledWith('ms-p1')
    })
  })

  describe('responsivo (Fase 2) — refinamento da grade e do painel lateral', () => {
    it('unidades em grade com coluna limitada (maxWidth): cards não esticam no wide', async () => {
      setBp('wide')
      renderHome([unitWithData()])
      await act(async () => {})

      const grid = screen.getByTestId('coordinator-units-grid')
      expect(grid.style.gridTemplateColumns).toBe(
        'repeat(auto-fit, minmax(min(380px, 100%), min(560px, 100%)))',
      )
    })

    it('mínimo overflow-safe: min(_, 100%) evita scroll horizontal em faixa estreita', async () => {
      setBp('compact')
      renderHome([unitWithData()])
      await act(async () => {})

      const grid = screen.getByTestId('coordinator-units-grid')
      expect(grid.style.gridTemplateColumns).toContain('min(380px, 100%)')
    })

    it('painel lateral (desktop/wide) traz resumo do escopo com contagens já carregadas', async () => {
      mockGetCoordinatorRequests.mockResolvedValue([pendingRequest('p1', 'Nova Pessoa')])
      mockGetCoordinatorInactiveMembers.mockResolvedValue([
        inactiveMember('s1', 'Suspenso Um', 'suspended'),
        inactiveMember('r1', 'Removido Um', 'removed'),
      ])
      setBp('desktop')
      renderHome([twoLeadersUnit()])
      await act(async () => {})

      const aside = screen.getByTestId('coordinator-side-info')
      expect(within(aside).getByText('Resumo do escopo')).toBeTruthy()
      expect(within(aside).getByText('Solicitações pendentes')).toBeTruthy()
      expect(within(aside).getAllByText('1')).toHaveLength(3)
      expect(within(aside).getAllByText('2')).toHaveLength(1)
      expect(within(aside).getByText('Suspensos')).toBeTruthy()
      expect(within(aside).getByText('Removidos')).toBeTruthy()
      expect(within(aside).getByText('Lideranças diretas')).toBeTruthy()
    })
  })
})
