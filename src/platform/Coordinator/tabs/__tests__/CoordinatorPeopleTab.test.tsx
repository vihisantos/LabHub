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

function select(testid: string, value: string) {
  fireEvent.change(screen.getByTestId(testid), { target: { value } })
}

/** Cria uma unidade cujo time tem João (mesmo perfil) — base para consolidação. */
function unitWithJoao(uid: string, unitName: string, mid: string): CoordinatedUnit {
  return {
    coordination: mem(`coordination-${uid}`, 'u-coord', { role_id: 'role-coordinator' }),
    unitId: uid,
    unitName,
    leaders: [
      {
        leadership: mem(`ms-${uid}-l`, `u-${uid}-l`, { role_id: 'role-lider', managed_by: `coordination-${uid}` }),
        profile: prof(`${uid}-l`, `Líder ${unitName}`),
        members: [
          {
            membership: mem(mid, 'u-joao', { workspace_id: uid, managed_by: `ms-${uid}-l` }),
            profile: prof('joao', 'João Silva'),
          },
        ],
      },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CoordinatorPeopleTab — diretório READ-ONLY consolidado por pessoa (#363)', () => {
  it('faixa de resumo calcula métricas por PESSOA: total de pessoas, unidades, lideranças, pendentes', () => {
    renderTab()

    expect(within(screen.getByTestId('people-summary-total')).getByText('6')).toBeTruthy()
    expect(within(screen.getByTestId('people-summary-units')).getByText('1')).toBeTruthy()
    expect(within(screen.getByTestId('people-summary-leaders')).getByText('2')).toBeTruthy()
    expect(within(screen.getByTestId('people-summary-pending')).getByText('1')).toBeTruthy()
  })

  it('lista densa: 1 card por pessoa com nome, cargo, unidade e status real (todas as fontes)', () => {
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

  it('agrega 1 PERFIL = 1 CARD: João em 3 unidades vira UMA pessoa com 3 chips (nunca 3 cards)', () => {
    const pi = unitWithJoao('ws-pi', 'Piracicaba', 'ms-pi')
    const mo = unitWithJoao('ws-mo', 'Mooca', 'ms-mo')
    const pa = unitWithJoao('ws-pa', 'Paulista', 'ms-pa')
    renderTab({ units: [pi, mo, pa], requestsByUnit: {}, inactiveByUnit: {} })

    // 3 líderes das unidades + João consolidado = 4 cards.
    expect(allRows()).toHaveLength(4)
    const joaoCard = screen.getByTestId('people-row-ms-pi')
    expect(screen.queryByTestId('people-row-ms-mo')).toBeNull()
    expect(screen.queryByTestId('people-row-ms-pa')).toBeNull()

    expect(within(joaoCard).getByTestId('people-unit-ms-pi')).toHaveTextContent('Piracicaba')
    expect(within(joaoCard).getByTestId('people-unit-ms-mo')).toHaveTextContent('Mooca')
    expect(within(joaoCard).getByTestId('people-unit-ms-pa')).toHaveTextContent('Paulista')
  })

  it('filtro de UNIDADE (#363): Mooca → João com SOMENTE o vínculo de Mooca (recorta, não duplica)', () => {
    const pi = unitWithJoao('ws-pi', 'Piracicaba', 'ms-pi')
    const mo = unitWithJoao('ws-mo', 'Mooca', 'ms-mo')
    const pa = unitWithJoao('ws-pa', 'Paulista', 'ms-pa')
    renderTab({ units: [pi, mo, pa], requestsByUnit: {}, inactiveByUnit: {} })

    select('people-unit-filter', 'ws-mo')

    // João + Líder Mooca (os demais não têm vínculo na unidade). No contexto,
    // o primeiro vínculo de João é Mooca → o card é people-row-ms-mo.
    expect(allRows()).toHaveLength(2)
    const joaoCard = screen.getByTestId('people-row-ms-mo')
    expect(within(joaoCard).queryByTestId('people-unit-ms-pi')).toBeNull()
    expect(within(joaoCard).getByTestId('people-unit-ms-mo')).toHaveTextContent('Mooca')
    expect(within(joaoCard).queryByTestId('people-unit-ms-pa')).toBeNull()
  })

  it('ordena as PESSOAS por nome (pt-BR), independente da unidade/nó', () => {
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

  it('filtro "Responsável = Sem responsável" mostra as pessoas com vínculo sem leader', () => {
    renderTab()

    select('people-responsible-filter', 'unassigned')
    expect(screen.getByRole('option', { name: GROUP_UNASSIGNED_LABEL })).toBeTruthy()

    const ids = allRows().map((row) => row.getAttribute('data-testid'))
    expect(ids).toEqual(['people-row-ms-p1', 'people-row-ms-s1', 'people-row-ms-r1', 'people-row-ms-alpha'])
    expect(screen.queryByTestId('people-row-ms-l1')).toBeNull()
  })

  it('"Responsável = Sem responsável" com todo mundo vinculado → EmptyState honesto', () => {
    const assigned = unit('ws1', [
      leader('l1', 'Ana Líder', [
        { membership: mem('ms-alpha', 'u-alpha', { managed_by: 'ms-l1' }), profile: prof('alpha', 'Técnico Alpha') },
      ]),
    ], 'Campus A')
    renderTab({ units: [assigned], requestsByUnit: {}, inactiveByUnit: {} })

    select('people-responsible-filter', 'unassigned')

    expect(screen.queryAllByTestId(/^people-row-/)).toHaveLength(0)
    expect(screen.getByText('Nenhuma pessoa encontrada')).toBeTruthy()
  })

  it('coordenação e lideranças continuam fatores de exibição: Ana e Bruno têm o rótulo de coordenação', () => {
    renderTab()

    expect(screen.getByTestId('people-row-ms-l1')).toBeTruthy()
    expect(screen.getByTestId('people-row-ms-l2')).toBeTruthy()
    expect(within(screen.getByTestId('people-row-ms-l1')).getByTestId('people-leader-ms-l1')).toHaveTextContent(COORDINATOR_LEADER_LABEL)
    expect(within(screen.getByTestId('people-row-ms-l2')).getByTestId('people-leader-ms-l2')).toHaveTextContent(COORDINATOR_LEADER_LABEL)
  })

  it('liderança que ainda não tem membros permanece visível como pessoa no diretório', () => {
    renderTab()

    expect(within(screen.getByTestId('people-row-ms-l2')).getByText('Bruno Líder')).toBeTruthy()
  })

  it('filtro "Responsável" por coordenação mostra só quem responde à coordenação', () => {
    renderTab()

    select('people-responsible-filter', 'coordination')

    const ids = allRows().map((row) => row.getAttribute('data-testid'))
    expect(ids).toEqual(['people-row-ms-l1', 'people-row-ms-l2'])
    expect(screen.queryByTestId('people-row-ms-p1')).toBeNull()
  })

  it('filtro "Responsável" por líderes mostra só quem responde a um líder real (não coordenação)', () => {
    const withTeam = unit('ws1', [
      leader('l1', 'Ana Líder', [
        { membership: mem('ms-zed', 'u-zed', { managed_by: 'ms-l1' }), profile: prof('zed', 'Zelma Membro') },
      ]),
    ], 'Campus A')
    renderTab({ units: [withTeam], requestsByUnit: {}, inactiveByUnit: {} })

    select('people-responsible-filter', 'leaders')

    expect(allRows()).toHaveLength(1)
    expect(screen.getByTestId('people-row-ms-zed')).toBeInTheDocument()
    expect(screen.queryByTestId('people-row-ms-l1')).toBeNull()
  })

  it('"Responsável = Sem responsável" combina com status (interseção)', () => {
    renderTab()

    select('people-responsible-filter', 'unassigned')
    select('people-status-filter', 'pending')

    expect(allRows()).toHaveLength(1)
    expect(screen.getByTestId('people-row-ms-p1')).toBeInTheDocument()
  })

  it('"Responsável" combina com busca (interseção)', () => {
    const withTeam = unit('ws1', [
      leader('l1', 'Ana Líder', [
        { membership: mem('ms-zed', 'u-zed', { managed_by: 'ms-l1' }), profile: prof('zed', 'Zelma Membro') },
      ]),
    ], 'Campus A')
    renderTab({ units: [withTeam], requestsByUnit: {}, inactiveByUnit: {} })

    select('people-responsible-filter', 'leaders')
    fireEvent.change(screen.getByTestId('people-search'), { target: { value: 'zelma' } })

    expect(allRows()).toHaveLength(1)
    expect(screen.getByTestId('people-row-ms-zed')).toBeInTheDocument()
  })

  it('vazio legítimo: nenhuma unidade → sem cards, EmptyState honesto', () => {
    renderTab({ units: [], requestsByUnit: {}, inactiveByUnit: {} })

    expect(screen.queryAllByTestId(/^people-row-/)).toHaveLength(0)
    expect(screen.getByText('Nenhuma pessoa encontrada')).toBeTruthy()
    expect(screen.getByText(/ainda não há pessoas vinculadas/i)).toBeTruthy()
  })

  it('filtro por status é excludente e afeta a lista exibida', () => {
    renderTab()

    select('people-status-filter', 'pending')
    expect(allRows()).toHaveLength(1)
    expect(screen.getByTestId('people-row-ms-p1')).toBeInTheDocument()

    select('people-status-filter', 'active')
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

    select('people-status-filter', 'active')
    fireEvent.change(screen.getByTestId('people-search'), { target: { value: 'ana' } })
    expect(allRows()).toHaveLength(1)
    expect(screen.getByTestId('people-row-ms-l1')).toBeInTheDocument()
  })

  it('nenhuma pessoa corresponde aos filtros → EmptyState com orientação honesta (inclui unidade)', () => {
    renderTab()

    fireEvent.change(screen.getByTestId('people-search'), { target: { value: 'zzz-inexistente' } })
    expect(screen.getByText('Nenhuma pessoa encontrada')).toBeTruthy()
    expect(screen.getByText(/Ajuste a busca, o status, a unidade ou o responsável/)).toBeTruthy()
    expect(screen.queryAllByTestId(/^people-row-/)).toHaveLength(0)
  })

  it('filtro de unidade consciente: opção "Todas as unidades" vem primeiro, com as unidades reais', () => {
    renderTab({ units: [ws1, ws2], requestsByUnit: {}, inactiveByUnit: {} })

    const selectEl = screen.getByTestId('people-unit-filter')
    expect(within(selectEl).getByRole('option', { name: 'Todas as unidades' })).toBeTruthy()
    expect(within(selectEl).getByRole('option', { name: 'Campus A' })).toBeTruthy()
    expect(within(selectEl).getByRole('option', { name: 'Campus B' })).toBeTruthy()
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

  it('perfil indisponível (RLS) vira card honesto com fallback', () => {
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

  it('membro ATIVO sem responsável (RPC 071, managed_by NULL) aparece no diretório', () => {
    renderTab({ membersByUnit: { ws1: [activeMember('u1', 'Ana Sem Responsável')] } })

    const row = screen.getByTestId('people-row-ms-u1')
    expect(within(row).getByText('Ana Sem Responsável')).toBeTruthy()
    expect(within(row).getByText('Ativo')).toBeTruthy()
    expect(within(row).getByText('Sem líder definido')).toBeTruthy()
  })

  it('membro ativo com responsável definido é roteado ao LÍDER real (não a "Sem líder")', () => {
    renderTab({
      membersByUnit: {
        ws1: [activeMember('u2', 'Bruno Na Equipe', { managed_by: 'ms-l1' })],
      },
    })

    const row = screen.getByTestId('people-row-ms-u2')
    expect(within(row).queryByText('Sem líder definido')).toBeNull()
    expect(within(row).getByTestId('people-leader-ms-u2')).toHaveTextContent('Ana Líder')
  })

  it('dedup: membro ativo já presente via escopo 047 não vira pessoa duplicada', () => {
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

    select('people-responsible-filter', 'unassigned')
    expect(screen.getByTestId('people-row-ms-u1')).toBeInTheDocument()
    expect(screen.queryByTestId('people-row-ms-l1')).toBeNull()
  })

  it('filtro "Responsável" por coordenação NÃO mostra o membro ativo sem responsável', () => {
    renderTab({ membersByUnit: { ws1: [activeMember('u1', 'Ana Sem Responsável')] } })

    select('people-responsible-filter', 'coordination')
    expect(screen.queryByTestId('people-row-ms-u1')).toBeNull()
  })

  it('escopo: membros de unidade fora do escopo recebido nunca viram card', () => {
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
    expect(screen.getByTestId('people-row-ms-u1')).toBeTruthy()
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

describe('CoordinatorPeopleTab — cards de perfil (representação visual, READ-ONLY)', () => {
  it('pessoa com FOTO real (profiles.avatar) vira card com img', () => {
    // Foto vem do perfil da fonte autorizada: TeamMemberProfile.avatar.
    renderTab({
      membersByUnit: {
        ws1: [
          {
            membership: mem('ms-photo', 'u-photo'),
            profile: { ...prof('photo', 'Fernanda Foto'), avatar: 'https://cdn.labhub.app/foto.png' },
          },
        ],
      },
    })

    const card = screen.getByTestId('people-row-ms-photo')
    expect(within(card).getByTestId('people-avatar-img-ms-photo')).toHaveAttribute(
      'src',
      'https://cdn.labhub.app/foto.png',
    )
    expect(within(card).queryByTestId('people-avatar-fallback-ms-photo')).toBeNull()
  })

  it('pessoa sem foto vira card com fallback de iniciais', () => {
    renderTab({
      membersByUnit: { ws1: [activeMember('u1', 'Ana Sem Responsável')] },
    })

    const card = screen.getByTestId('people-row-ms-u1')
    expect(within(card).getByTestId('people-avatar-fallback-ms-u1')).toHaveTextContent('AR')
    expect(within(card).queryByTestId('people-avatar-img-ms-u1')).toBeNull()
  })

  it('banner real do perfil vira img no card; sem banner, gradiente', () => {
    renderTab({
      membersByUnit: {
        ws1: [
          {
            membership: mem('ms-banner', 'u-banner'),
            profile: { ...prof('banner', 'Bruno Banner'), banner: 'https://cdn.labhub.app/banner.png' },
          },
          activeMember('u1', 'Ana Sem Responsável'),
        ],
      },
    })

    expect(within(screen.getByTestId('people-row-ms-banner')).getByTestId('people-banner-img-ms-banner')).toHaveAttribute(
      'src',
      'https://cdn.labhub.app/banner.png',
    )
    // Sem banner → fallback de gradiente (nunca imagem externa).
    expect(
      within(screen.getByTestId('people-row-ms-u1')).getByTestId('people-banner-fallback-ms-u1'),
    ).toBeInTheDocument()
  })

  it('grid público das pessoas: 1 coluna no mobile, 2 quando há espaço (sem largura fixa)', () => {
    renderTab()

    const grid = screen.getByTestId('people-grid')
    expect(grid).toHaveClass('grid', 'grid-cols-1', 'sm:grid-cols-2')
    expect(grid.className).not.toMatch(/w-\[\d+px\]|max-w-\[\d+px\]/)
  })

  it('cards preservam os dados autorizados: cargo, líder e status no mesmo card', () => {
    const assigned = unit(
      'ws1',
      [
        leader('l1', 'Ana Líder', [
          { membership: mem('ms-alpha', 'u-alpha', { managed_by: 'ms-l1' }), profile: prof('alpha', 'Técnico Alpha') },
        ]),
      ],
      'Campus A',
    )
    renderTab({ units: [assigned], requestsByUnit: {}, inactiveByUnit: {} })

    const card = screen.getByTestId('people-row-ms-alpha')
    expect(within(card).getByText('Técnico Alpha')).toBeTruthy()
    expect(within(card).getByText('Técnico')).toBeTruthy() // cargo
    expect(within(card).getByTestId('people-leader-ms-alpha')).toHaveTextContent('Ana Líder')
    expect(within(card).getByTestId('people-status-ms-alpha')).toHaveTextContent('Ativo')
    expect(within(card).getByText('Campus A')).toBeTruthy() // unidade
  })
})