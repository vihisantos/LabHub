import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CoordinatorHome, managerOptionsForMember } from '../CoordinatorHome'
import type { CoordinatedUnit } from '../../../core/permissions/coordinatorService'

const mockUseCoordinator = vi.hoisted(() => vi.fn())
const mockGetRoleForUser = vi.hoisted(() => vi.fn())
const mockSetCoordinatorManager = vi.hoisted(() => vi.fn())
const mockGetLastCoordinatorServiceError = vi.hoisted(() => vi.fn())

vi.mock('../../../core/permissions/useCoordinator', () => ({
  useCoordinator: () => mockUseCoordinator(),
}))

vi.mock('../../../core/permissions/service', () => ({
  permissionService: { getRoleForUser: () => mockGetRoleForUser() },
}))

vi.mock('../../../core/permissions/coordinatorService', () => ({
  setCoordinatorManager: (...args: unknown[]) => mockSetCoordinatorManager(...args),
  getLastCoordinatorServiceError: () => mockGetLastCoordinatorServiceError(),
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

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  mockGetRoleForUser.mockReturnValue({ name: 'Líder' })
  mockSetCoordinatorManager.mockResolvedValue(true)
  mockGetLastCoordinatorServiceError.mockReturnValue(null)
})

describe('CoordinatorHome (Fase 8.2 — Área do Coordenador, gestão real)', () => {
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

    it('mostra o escopo real: unidades, lideranças e equipes', () => {
      renderHome([unitWithData()])
      expect(screen.getByText('Área do Coordenador')).toBeTruthy()
      expect(screen.getByText('Unidade: Campus A')).toBeTruthy()
      expect(screen.getByText('Ana Líder')).toBeTruthy()
      expect(screen.getByText('Técnico 1')).toBeTruthy()
      expect(screen.getByText('1 liderança')).toBeTruthy()
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

  describe('gestão real — atribuir a gestor (setCoordinatorManager)', () => {
    it('abre o sheet com apenas gestores permitidos; atribui e atualiza a árvore', async () => {
      const refresh = renderHome([twoLeadersUnit()])

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

      fireEvent.click(screen.getByRole('button', { name: 'Remover Técnico 1 da equipe' }))

      await act(async () => {})

      expect(mockSetCoordinatorManager).toHaveBeenCalledWith('ms-m1', null)
      expect(refresh).toHaveBeenCalled()
    })

    it('erro do RPC na atribuição → mensagem inline no sheet, NÃO fecha, NÃO refresca', async () => {
      const refresh = renderHome([twoLeadersUnit()])
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
      mockSetCoordinatorManager.mockResolvedValue(false)
      mockGetLastCoordinatorServiceError.mockReturnValue('guard 046 rejeitou: ciclo de gestão')

      fireEvent.click(screen.getByRole('button', { name: 'Remover Técnico 1 da equipe' }))

      await act(async () => {})

      expect(screen.getByText(/guard 046 rejeitou: ciclo de gestão/)).toBeTruthy()
      expect(refresh).not.toHaveBeenCalled()
    })
  })

  describe('gestão real — impedir ações duplicadas', () => {
    it('enquanto uma escrita está em andamento, todas as ações de gestão são desabilitadas', async () => {
      renderHome([twoLeadersUnit()])

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

    it('sem CTA de criar membership nem de alterar cargo (só managed_by)', () => {
      renderHome([unitWithData()])
      const createLabels = screen.getAllByRole('button').filter((b) => {
        const label = (b as HTMLButtonElement).title
        return /criar|cargo|cadastrar/i.test(label ?? '')
      })
      expect(createLabels).toHaveLength(0)
      expect(screen.getByRole('button', { name: 'Vincular Técnico 1 a gestor' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Remover Técnico 1 da equipe' })).toBeTruthy()
    })
  })
})