import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CoordinatorPeopleTab, type CoordinatorPeopleTabProps } from '../CoordinatorPeopleTab'
import type {
  CoordinatorInactiveMember,
  CoordinatorMember,
  CoordinatorRequest,
  CoordinatorRoleOption,
  CoordinatedUnit,
} from '../../../../core/permissions/coordinatorService'
import type { Membership, TeamMember, TeamMemberProfile } from '../../../../core/permissions/membership'
import {
  COORDINATOR_LEADER_LABEL,
  GROUP_EMPTY_LEADER_LABEL,
  GROUP_UNASSIGNED_LABEL,
} from '../../coordinatorHelpers'

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

function activeMember(id: string, name: string, over: Partial<Membership> = {}): CoordinatorMember {
  return { membership: mem(`ms-${id}`, `u-${id}`, { status: 'active', ...over }), profile: prof(id, name) }
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
  membersByUnit: {},
  membersLoading: false,
  membersFailed: false,
  onRetryMembers: vi.fn(),
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

  it('ordena a estrutura por nó (pt-BR): sem responsável → coordenação → líderes', () => {
    renderTab()

    const ids = allRows().map((row) => row.getAttribute('data-testid'))
    expect(ids).toEqual([
      'people-row-ms-p1', // Clara Pendente → Sem responsável
      'people-row-ms-s1', // Davi Suspenso → Sem responsável
      'people-row-ms-r1', // Eva Removida → Sem responsável
      'people-row-ms-alpha', // Técnico Alpha → Sem responsável
      'people-row-ms-l1', // Ana Líder → Coordenação
      'people-row-ms-l2', // Bruno Líder → Coordenação
    ])
  })

  it('seção fixa "Sem responsável" sobe ao topo com as pessoas de managed_by NULL', () => {
    renderTab()

    const section = screen.getByTestId('people-group-unassigned')
    expect(within(section).getByText(GROUP_UNASSIGNED_LABEL)).toBeTruthy()
    expect(within(section).getByText('Clara Pendente')).toBeTruthy()
    expect(within(section).getByText('Técnico Alpha')).toBeTruthy()
    expect(within(section).queryByText('Ana Líder')).toBeNull()
  })

  it('não renderiza a seção "Sem responsável" quando ninguém está sem líder', () => {
    const assigned = unit('ws1', [
      leader('l1', 'Ana Líder', [
        { membership: mem('ms-alpha', 'u-alpha', { managed_by: 'ms-l1' }), profile: prof('alpha', 'Técnico Alpha') },
      ]),
    ], 'Campus A')
    renderTab({ units: [assigned], requestsByUnit: {}, inactiveByUnit: {} })

    expect(screen.queryByTestId('people-group-unassigned')).toBeNull()
    expect(screen.getByTestId('people-group-leader-ms-l1')).toBeTruthy()
    expect(within(screen.getByTestId('people-group-leader-ms-l1')).getByText('Técnico Alpha')).toBeTruthy()
  })

  it('estrutura: coordenação sempre no topo da unidade, líderes depois (alfabético)', () => {
    renderTab()

    const coords = screen.getByTestId('people-group-coordination-ws1')
    const title = within(coords).getByTestId('people-group-title-people-group-coordination-ws1')
    expect(title.textContent).toBe(COORDINATOR_LEADER_LABEL)
    expect(title.parentElement?.textContent).toContain('Campus A')
    expect(within(coords).getByText('Ana Líder')).toBeTruthy()
    expect(within(coords).getByText('Bruno Líder')).toBeTruthy()
  })

  it('liderança sem membros continua visível na estrutura ("Nenhuma pessoa vinculada")', () => {
    renderTab()

    expect(screen.getByTestId('people-group-leader-ms-l2')).toBeTruthy()
    expect(
      within(screen.getByTestId('people-group-leader-ms-l2')).getByText(GROUP_EMPTY_LEADER_LABEL),
    ).toBeTruthy()
  })

  it('filtro "Responsável" por coordenação mostra apenas o nó de coordenação', () => {
    renderTab()

    fireEvent.change(screen.getByTestId('people-responsible-filter'), { target: { value: 'coordination' } })
    expect(screen.getByTestId('people-group-coordination-ws1')).toBeTruthy()
    expect(screen.queryByTestId('people-group-unassigned')).toBeNull()
    expect(screen.queryByTestId('people-group-leader-ms-l2')).toBeNull()
  })

  it('filtro "Responsável" por líderes mostra apenas líderes (inclusive vazios)', () => {
    renderTab()

    fireEvent.change(screen.getByTestId('people-responsible-filter'), { target: { value: 'leaders' } })
    expect(screen.getByTestId('people-group-leader-ms-l1')).toBeTruthy()
    expect(screen.getByTestId('people-group-leader-ms-l2')).toBeTruthy()
    expect(screen.queryByTestId('people-group-coordination-ws1')).toBeNull()
    expect(screen.queryByTestId('people-group-unassigned')).toBeNull()
  })

  it('filtro "Responsável" por sem responsável mostra apenas a seção fixa do topo', () => {
    renderTab()

    fireEvent.change(screen.getByTestId('people-responsible-filter'), { target: { value: 'unassigned' } })
    expect(screen.getByTestId('people-group-unassigned')).toBeTruthy()
    expect(screen.queryByTestId('people-group-coordination-ws1')).toBeNull()
    expect(screen.queryByTestId('people-group-leader-ms-l1')).toBeNull()
  })

  it('"Responsável" combina com status (interseção)', () => {
    renderTab()

    fireEvent.change(screen.getByTestId('people-responsible-filter'), { target: { value: 'unassigned' } })
    fireEvent.change(screen.getByTestId('people-status-filter'), { target: { value: 'pending' } })

    expect(allRows()).toHaveLength(1)
    expect(screen.getByTestId('people-row-ms-p1')).toBeInTheDocument()
  })

  it('"Responsável" combina com busca (interseção)', () => {
    const withTeam = unit('ws1', [
      leader('l4', 'Zara Líder', [
        { membership: mem('ms-zed', 'u-zed', { managed_by: 'ms-l4' }), profile: prof('zed', 'Zelma Membro') },
      ]),
    ], 'Campus A')
    renderTab({ units: [withTeam], requestsByUnit: {}, inactiveByUnit: {} })

    fireEvent.change(screen.getByTestId('people-responsible-filter'), { target: { value: 'leaders' } })
    fireEvent.change(screen.getByTestId('people-search'), { target: { value: 'zelma' } })

    // Só o nó do líder que gere "Zelma" permanece, com ela dentro.
    expect(allRows()).toHaveLength(1)
    expect(screen.getByTestId('people-row-ms-zed')).toBeInTheDocument()
    expect(screen.queryByTestId('people-group-coordination-ws1')).toBeNull()
  })

  it('vazio legítimo: nenhuma unidade → sem nós, EmptyState honesto', () => {
    renderTab({ units: [], requestsByUnit: {}, inactiveByUnit: {} })

    expect(screen.queryByTestId('people-group-unassigned')).toBeNull()
    expect(screen.getByText('Nenhuma pessoa encontrada')).toBeTruthy()
    expect(screen.getByText(/ainda não há pessoas vinculadas/i)).toBeTruthy()
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
    expect(screen.getByText(/Ajuste a busca, o status ou o responsável/)).toBeTruthy()
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

    expect(within(screen.getByTestId('people-row-ms-h1')).getByText('Perfil não disponível')).toBeTruthy()
    expect(screen.queryByText('Sem e-mail registrado')).toBeTruthy()
  })

  it('membro ATIVO sem responsável (RPC 071, managed_by NULL) aparece na seção fixa "Sem responsável"', () => {
    renderTab({ membersByUnit: { ws1: [activeMember('u1', 'Ana Sem Responsável')] } })

    const row = screen.getByTestId('people-row-ms-u1')
    expect(within(row).getByText('Ana Sem Responsável')).toBeTruthy()
    expect(within(row).getByText('Ativo')).toBeTruthy()
    expect(within(row).getByText('Sem líder definido')).toBeTruthy()

    const section = screen.getByTestId('people-group-unassigned')
    expect(within(section).getByText('Ana Sem Responsável')).toBeTruthy()
  })

  it('membro ativo com responsável definido é roteado ao nó do líder (e não à seção fixa)', () => {
    renderTab({
      membersByUnit: {
        ws1: [activeMember('u2', 'Bruno Na Equipe', { managed_by: 'ms-l1' })],
      },
    })

    const section = screen.getByTestId('people-group-unassigned')
    expect(within(section).queryByText('Bruno Na Equipe')).toBeNull()
    expect(screen.getByTestId('people-row-ms-u2')).toBeTruthy()
    expect(screen.getByTestId('people-group-leader-ms-l1')).toBeTruthy()
  })

  it('dedup: membro ativo já presente via escopo 047 não vira linha duplicada', () => {
    renderTab({ membersByUnit: { ws1: [activeMember('alpha', 'Técnico Alpha', { managed_by: 'ms-l1' })] } })

    const rows = allRows()
    expect(rows).toHaveLength(6) // mesmo total do cenário base (sem duplicata)
    expect(screen.getAllByTestId('people-row-ms-alpha')).toHaveLength(1)
  })

  it('busca encontra o membro ativo sem responsável (nome e e-mail)', () => {
    renderTab({ membersByUnit: { ws1: [activeMember('u1', 'Ana Sem Responsável')] } })

    fireEvent.change(screen.getByTestId('people-search'), { target: { value: 'sem responsável' } })
    expect(allRows()).toHaveLength(1)
    expect(screen.getByTestId('people-row-ms-u1')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('people-search'), { target: { value: 'PESSOA-U1' } })
    expect(allRows()).toHaveLength(1)
  })

  it('filtro "Responsável = Sem responsável" mostra o membro ativo sem responsável', () => {
    renderTab({ membersByUnit: { ws1: [activeMember('u1', 'Ana Sem Responsável')] } })

    fireEvent.change(screen.getByTestId('people-responsible-filter'), { target: { value: 'unassigned' } })
    expect(screen.getByTestId('people-row-ms-u1')).toBeInTheDocument()
    expect(screen.queryByTestId('people-group-coordination-ws1')).toBeNull()
    expect(screen.queryByTestId('people-group-leader-ms-l1')).toBeNull()
  })

  it('filtro "Responsável" por coordenação NÃO mostra o membro ativo sem responsável', () => {
    renderTab({ membersByUnit: { ws1: [activeMember('u1', 'Ana Sem Responsável')] } })

    fireEvent.change(screen.getByTestId('people-responsible-filter'), { target: { value: 'coordination' } })
    expect(screen.queryByTestId('people-row-ms-u1')).toBeNull()
  })

  it('escopo: membros de unidade fora do escopo recebido nunca viram linha', () => {
    renderTab({
      units: [ws1, ws2],
      membersByUnit: {
        ws1: [activeMember('u1', 'Ana Sem Responsável')],
        ws3: [activeMember('u3', 'Fora do Escopo Ativo')],
      },
    })

    const rows = allRows()
    expect(rows).toHaveLength(8) // ws1 (6) + ws2 (1) + membro ativo ws1 (1); nada da ws3
    expect(screen.queryByText('Fora do Escopo Ativo')).toBeNull()
    expect(within(screen.getByTestId('people-group-unassigned')).getByText('Ana Sem Responsável')).toBeTruthy()
  })

  it('falha na leitura de membros ativos → ErrorState honesto e retry só dessa leitura', () => {
    const onRetryMembers = vi.fn()
    const onRetryRequests = vi.fn()
    const onRetryInactive = vi.fn()
    renderTab({
      membersFailed: true,
      onRetryMembers,
      onRetryRequests,
      onRetryInactive,
      membersByUnit: { ws1: [activeMember('u1', 'Ana Sem Responsável')] },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(onRetryMembers).toHaveBeenCalledTimes(1)
    expect(onRetryRequests).not.toHaveBeenCalled()
    expect(onRetryInactive).not.toHaveBeenCalled()
  })

  it('loading de membros ativos exibe skeleton sem listar nada fabricado', () => {
    renderTab({ membersLoading: true })

    expect(screen.getByTestId('people-loading')).toBeInTheDocument()
    expect(screen.queryAllByTestId(/^people-row-/)).toHaveLength(0)
  })
})