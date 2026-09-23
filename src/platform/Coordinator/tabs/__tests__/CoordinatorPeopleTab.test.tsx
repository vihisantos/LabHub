import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CoordinatorPeopleTab, type CoordinatorPeopleTabProps } from '../CoordinatorPeopleTab'
import type {
  CoordinatorInactiveMember,
  CoordinatorRequest,
  CoordinatorRoleOption,
  CoordinatedUnit,
} from '../../../../core/permissions/coordinatorService'
import type { Membership, TeamMember, TeamMemberProfile } from '../../../../core/permissions/membership'

const rolesById = new Map<string, CoordinatorRoleOption>([
  ['role-technician', { id: 'role-technician', slug: 'tec', name: 'Técnico' }],
  ['role-lider', { id: 'role-lider', slug: 'lider', name: 'Líder' }],
])

function mem(id: string, profileId: string, over: Partial<Membership> = {}): Membership {
  return {
    id,
    profile_id: profileId,
    workspace_id: 'ws1',
    role_id: 'role-technician',
    status: 'active',
    managed_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function prof(id: string, name: string): TeamMemberProfile {
  return { id: `u-${id}`, name, email: `pessoa-${id}@labhub.app`, status: 'active', roleId: 'role-technician' }
}

function member(id: string, name: string): TeamMember {
  return { membership: mem(`ms-${id}`, `u-${id}`), profile: prof(id, name) }
}

function leader(id: string, name: string, members: TeamMember[]): CoordinatedUnit['leaders'][number] {
  return {
    leadership: mem(`ms-${id}`, `u-${id}`, { role_id: 'role-lider', managed_by: 'coordination-ws1' }),
    profile: prof(id, name),
    members,
  }
}

function unit(id: string, leaders: CoordinatedUnit['leaders'], unitName: string): CoordinatedUnit {
  return {
    coordination: mem(`coordination-${id}`, 'u-coord', { role_id: 'role-coordinator' }),
    unitId: id,
    unitName,
    leaders,
  }
}

function request(id: string, name: string): CoordinatorRequest {
  return { membership: mem(`ms-${id}`, `u-${id}`, { status: 'pending' }), profile: prof(id, name) }
}

function inactive(id: string, name: string, status: 'suspended' | 'removed'): CoordinatorInactiveMember {
  return { membership: mem(`ms-${id}`, `u-${id}`, { status }), profile: prof(id, name) }
}

const ws1 = unit('ws1', [
  leader('l1', 'Ana Líder', [member('alpha', 'Técnico Alpha')]),
  leader('l2', 'Bruno Líder', []),
], 'Campus A')
const ws2 = unit('ws2', [leader('l3', 'Carol Líder', [])], 'Campus B')

const baseProps: CoordinatorPeopleTabProps = {
  units: [ws1],
  requestsByUnit: { ws1: [request('p1', 'Clara Pendente')] },
  requestsLoading: false,
  requestsFailed: false,
  onRetryRequests: vi.fn(),
  inactiveByUnit: {
    ws1: [inactive('s1', 'Davi Suspenso', 'suspended'), inactive('r1', 'Eva Removida', 'removed')],
  },
  inactiveLoading: false,
  inactiveFailed: false,
  onRetryInactive: vi.fn(),
  rolesById,
}

function renderTab(over: Partial<CoordinatorPeopleTabProps> = {}) {
  render(<CoordinatorPeopleTab {...baseProps} {...over} />)
}

function allRows() {
  return screen.getAllByTestId(/^people-row-/)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CoordinatorPeopleTab — diretório READ-ONLY do pessoal do escopo (PR 275)', () => {
  it('faixa de resumo calcula só métricas suportadas pelo modelo (pessoas/unidades/lideranças/pendentes)', () => {
    renderTab()

    expect(within(screen.getByTestId('people-summary-total')).getByText('6')).toBeTruthy()
    expect(within(screen.getByTestId('people-summary-units')).getByText('1')).toBeTruthy()
    expect(within(screen.getByTestId('people-summary-leaders')).getByText('2')).toBeTruthy()
    expect(within(screen.getByTestId('people-summary-pending')).getByText('1')).toBeTruthy()
  })

  it('lista densa: avatar, nome, cargo, unidade e status real de cada pessoa (todas as fontes)', () => {
    renderTab()

    const rows = allRows()
    expect(rows).toHaveLength(6)

    const leaderRow = screen.getByTestId('people-row-ms-l1')
    expect(within(leaderRow).getByText('Ana Líder')).toBeTruthy()
    expect(within(leaderRow).getByText('Líder')).toBeTruthy()
    expect(within(leaderRow).getByText('Campus A')).toBeTruthy()
    expect(within(leaderRow).getByText('Ativo')).toBeTruthy()

    expect(within(screen.getByTestId('people-row-ms-l2')).getByText('Bruno Líder')).toBeTruthy()
    expect(within(screen.getByTestId('people-row-ms-p1')).getByText('Pendente')).toBeTruthy()
    expect(within(screen.getByTestId('people-row-ms-s1')).getByText('Suspenso')).toBeTruthy()
    expect(within(screen.getByTestId('people-row-ms-r1')).getByText('Removido')).toBeTruthy()
    expect(within(screen.getByTestId('people-row-ms-alpha')).getByText('Técnico Alpha')).toBeTruthy()
  })

  it('ordena as linhas por nome (locale pt-BR)', () => {
    renderTab()

    const ids = allRows().map((row) => row.getAttribute('data-testid'))
    expect(ids).toEqual([
      'people-row-ms-l1', // Ana Líder
      'people-row-ms-l2', // Bruno Líder
      'people-row-ms-p1', // Clara Pendente
      'people-row-ms-s1', // Davi Suspenso
      'people-row-ms-r1', // Eva Removida
      'people-row-ms-alpha', // Técnico Alpha
    ])
  })

  it('filtro por status é excludente e afeta a lista exibida', () => {
    renderTab()

    fireEvent.change(screen.getByTestId('people-status-filter'), { target: { value: 'pending' } })
    expect(allRows()).toHaveLength(1)
    expect(screen.getByTestId('people-row-ms-p1')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('people-status-filter'), { target: { value: 'active' } })
    const active = allRows()
    expect(active).toHaveLength(3) // Ana, Bruno e Técnico Alpha
    expect(screen.queryByTestId('people-row-ms-p1')).toBeNull()
  })

  it('busca por nome e e-mail, case-insensitive', () => {
    renderTab()

    fireEvent.change(screen.getByTestId('people-search'), { target: { value: 'clara' } })
    expect(allRows()).toHaveLength(1)
    expect(screen.getByTestId('people-row-ms-p1')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('people-search'), { target: { value: 'PESSOA-ALPHA' } })
    expect(allRows()).toHaveLength(1)
    expect(screen.getByTestId('people-row-ms-alpha')).toBeInTheDocument()
  })

  it('busca + status combinados', () => {
    renderTab()

    fireEvent.change(screen.getByTestId('people-status-filter'), { target: { value: 'active' } })
    fireEvent.change(screen.getByTestId('people-search'), { target: { value: 'ana' } })
    expect(allRows()).toHaveLength(1)
    expect(screen.getByTestId('people-row-ms-l1')).toBeInTheDocument()
  })

  it('nenhuma pessoa corresponde aos filtros → EmptyState com orientação honesta', () => {
    renderTab()

    fireEvent.change(screen.getByTestId('people-search'), { target: { value: 'zzz-inexistente' } })
    expect(screen.getByText('Nenhuma pessoa encontrada')).toBeTruthy()
    expect(screen.getByText(/Ajuste a busca ou o status/)).toBeTruthy()
    expect(screen.queryAllByTestId(/^people-row-/)).toHaveLength(0)
  })

  it('escopo vazio legítimo → EmptyState de diretório vazio', () => {
    renderTab({ units: [], requestsByUnit: {}, inactiveByUnit: {} })

    expect(screen.getByText('Nenhuma pessoa encontrada')).toBeTruthy()
    expect(screen.getByText(/ainda não há pessoas vinculadas/i)).toBeTruthy()
  })

  it('loading → skeleton de linhas com role status (sem listar nada fabricado)', () => {
    renderTab({ requestsLoading: true })

    expect(screen.getByTestId('people-loading')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryAllByTestId(/^people-row-/)).toHaveLength(0)
  })

  it('falha na leitura → ErrorState honesto e "Tentar novamente" dispara o retry certo', () => {
    const onRetryRequests = vi.fn()
    const onRetryInactive = vi.fn()
    renderTab({ requestsFailed: true, onRetryRequests, onRetryInactive, inactiveFailed: true })

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(onRetryRequests).toHaveBeenCalled()
    expect(onRetryInactive).toHaveBeenCalled()
  })

  it('falha apenas de inativos → retry chama só a leitura de inativos', () => {
    const onRetryRequests = vi.fn()
    const onRetryInactive = vi.fn()
    renderTab({ inactiveFailed: true, onRetryRequests, onRetryInactive })

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(onRetryRequests).not.toHaveBeenCalled()
    expect(onRetryInactive).toHaveBeenCalled()
  })

  it('escopo: só pessoas das unidades recebidas — dados de unidades fora ficam de fora', () => {
    const extra = request('p3', 'Fora do Escopo') // ws3 tem dados, mas não está no escopo passado
    renderTab({
      units: [ws1, ws2],
      requestsByUnit: { ws1: baseProps.requestsByUnit.ws1, ws3: [extra] },
      inactiveByUnit: { ws1: baseProps.inactiveByUnit.ws1 },
    })

    const rows = allRows()
    expect(rows).toHaveLength(7) // Campus A (6) + Campus B (1); nada da ws3
    expect(within(screen.getByTestId('people-summary-units')).getByText('2')).toBeTruthy()
    expect(screen.queryByText('Fora do Escopo')).toBeNull()
  })

  it('é somente-leitura: nenhuma ação de gestão é oferecida na aba', () => {
    renderTab()

    expect(screen.queryByRole('button', { name: /Definir líder/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Aprovar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Suspender/i })).toBeNull()
  })

  it('perfil indisponível (RLS) vira linha honesta com fallback', () => {
    const hidden: CoordinatedUnit = {
      coordination: mem('coordination-ws1', 'u-coord'),
      unitId: 'ws1',
      unitName: 'Campus A',
      leaders: [
        {
          leadership: mem('ms-h1', 'u-h1', { role_id: 'role-viewer', managed_by: 'coordination-ws1' }),
          profile: null,
          members: [],
        },
      ],
    }
    renderTab({ units: [hidden], requestsByUnit: {}, inactiveByUnit: {} })

    expect(screen.getByText('Perfil não disponível')).toBeTruthy()
    expect(screen.queryByText('Sem e-mail registrado')).toBeTruthy()
  })
})