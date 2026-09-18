import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CoordinatorHome } from '../CoordinatorHome'
import { managerOptionsForMember } from '../coordinatorHelpers'
import type {
  CoordinatedUnit,
  CoordinatorInactiveMember,
  CoordinatorRequest,
  CoordinatorRoleOption,
} from '../../../core/permissions/coordinatorService'
import type { BreakpointState } from '../../../responsive/useBreakpoint'

const mockUseCoordinator = vi.hoisted(() => vi.fn())
const mockGetRoleForUser = vi.hoisted(() => vi.fn())
const mockUseBreakpoint = vi.hoisted(() => vi.fn())
const mockSetCoordinatorManager = vi.hoisted(() => vi.fn())
const mockGetLastCoordinatorServiceError = vi.hoisted(() => vi.fn())
const mockGetCoordinatorRequests = vi.hoisted(() => vi.fn())
const mockGetCoordinatorInactiveMembers = vi.hoisted(() => vi.fn())
const mockGetCoordinatorAssignableRoles = vi.hoisted(() => vi.fn())
const mockApproveCoordinatorMembership = vi.hoisted(() => vi.fn())
const mockRejectCoordinatorMembership = vi.hoisted(() => vi.fn())
const mockSuspendCoordinatorMembership = vi.hoisted(() => vi.fn())
const mockRestoreCoordinatorMembership = vi.hoisted(() => vi.fn())
const mockRemoveCoordinatorMembership = vi.hoisted(() => vi.fn())
const mockSetCoordinatorRole = vi.hoisted(() => vi.fn())

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
  mockGetRoleForUser.mockReturnValue({ name: 'Líder' })
  mockGetLastCoordinatorServiceError.mockReturnValue(null)
  mockSetCoordinatorManager.mockResolvedValue(true)
  mockGetCoordinatorRequests.mockResolvedValue([])
  mockGetCoordinatorInactiveMembers.mockResolvedValue([])
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
})
