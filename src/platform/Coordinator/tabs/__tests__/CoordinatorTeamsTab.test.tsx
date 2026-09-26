import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CoordinatorTeamsTab, type CoordinatorTeamsTabProps } from '../CoordinatorTeamsTab'
import type { Ticket } from '../../../../apps/chamados/types'
import type { CoordinatorRoleOption, CoordinatedUnit } from '../../../../core/permissions/coordinatorService'
import type { Membership, TeamMember, TeamMemberProfile } from '../../../../core/permissions/membership'

const NOW = new Date('2026-08-13T10:00:00Z')
const HOUR = 1000 * 60 * 60

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
  return { id: `u-${id}`, name, email: `${id}@labhub.app`, status: 'active', roleId: 'role-technician' }
}

function member(id: string, name: string, over: Partial<Membership> = {}): TeamMember {
  return {
    membership: mem(`ms-${id}`, `u-${id}`, { managed_by: 'ms-l1', ...over }),
    profile: prof(id, name),
  }
}

function leader(id: string, name: string, members: TeamMember[]): CoordinatedUnit['leaders'][number] {
  return {
    leadership: mem(`ms-${id}`, `u-${id}`, { role_id: 'role-lider', managed_by: 'coordination-ws1' }),
    profile: { ...prof(id, name), roleId: 'role-lider' },
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

function tk(over: Partial<Ticket> & Pick<Ticket, 'id'>): Ticket {
  return {
    ticketNumber: 7,
    workspace_id: 'ws1',
    roomId: 'r1',
    roomName: 'Sala 101',
    assetName: 'Computador',
    problemCategory: 'Internet',
    problemDescription: 'sem conexão',
    status: 'aberto',
    priority: 'normal',
    reportedBy: 'Prof. Ana',
    reportedByEmail: 'ana@labhub.local',
    assignedTo: 'Técnico',
    createdAt: new Date(NOW.getTime() - 1 * HOUR).toISOString(),
    updatedAt: new Date(NOW.getTime() - 1 * HOUR).toISOString(),
    resolvedAt: null,
    ...over,
  }
}

interface RenderResult {
  onOpenChamados: ReturnType<typeof vi.fn>
}

function renderTab(
  units: CoordinatedUnit[],
  scopeTickets: Ticket[] = [],
  over: Partial<CoordinatorTeamsTabProps> = {},
): RenderResult {
  const onOpenChamados = vi.fn()
  render(
    <CoordinatorTeamsTab
      units={units}
      scopeTickets={scopeTickets}
      slaConfigs={{}}
      rolesById={rolesById}
      openChamadosFor={() => onOpenChamados}
      {...over}
    />,
  )
  return { onOpenChamados }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CoordinatorTeamsTab — organização e operação das equipes (V1)', () => {
  it('renderiza a aba com faixa de resumo (equipes/membros/chamados dos membros)', () => {
    const ws1 = unit('ws1', [leader('l1', 'Ana Líder', [member('alpha', 'Técnico Alpha')])], 'Campus A')
    renderTab([ws1])

    expect(screen.getByTestId('tab-teams')).toBeInTheDocument()
    expect(screen.getByText('Chamados dos membros')).toBeInTheDocument()
    expect(screen.getByTestId('teams-summary-teams')).toHaveTextContent('1')
    expect(screen.getByTestId('teams-summary-members')).toHaveTextContent('2')
    expect(screen.getByTestId('teams-summary-open')).toHaveTextContent('0')
  })

  it('resumo "Chamados dos membros" conta apenas chamados de pessoas projetadas (não o KPI da unidade)', () => {
    const ws1 = unit('ws1', [leader('l1', 'Ana Líder', [member('alpha', 'Técnico Alpha')])], 'Campus A')
    const tickets = [
      tk({ id: 't-do-membro', assignedToUserId: 'u-alpha' }),
      tk({ id: 't-fora-da-projecao', assignedToUserId: 'u-externo' }),
    ]
    renderTab([ws1], tickets)

    expect(screen.getByTestId('teams-summary-open')).toHaveTextContent('1')
    expect(screen.getByTestId('teams-team-open-ms-l1')).toHaveTextContent('1 chamado')
  })

  it('agrupa por unidade e identifica a unidade de cada equipe (multiunidade)', () => {
    const ws1 = unit('ws1', [leader('l1', 'Ana Líder', [member('alpha', 'Técnico Alpha')])], 'Campus A')
    const ws2 = unit('ws2', [leader('l2', 'Bruno Líder', [])], 'Campus B')
    renderTab([ws1, ws2])

    expect(screen.getByTestId('teams-unit-ws1')).toBeInTheDocument()
    expect(screen.getByTestId('teams-unit-ws2')).toBeInTheDocument()
    expect(within(screen.getByTestId('teams-unit-ws1')).getByText('Campus A')).toBeTruthy()
    expect(within(screen.getByTestId('teams-team-ws1-ms-l1')).getByText(/Campus A/)).toBeTruthy()
    expect(within(screen.getByTestId('teams-team-ws2-ms-l2')).getByText(/Campus B/)).toBeTruthy()
  })

  it('mostra líder, cargo, contagem de membros e membros com métricas', () => {
    const ws1 = unit('ws1', [
      leader('l1', 'Ana Líder', [member('alpha', 'Técnico Alpha'), member('beta', 'Técnico Beta')]),
    ], 'Campus A')
    const tickets = [
      tk({ id: 't1', assignedToUserId: 'u-alpha' }),
      tk({ id: 't2', assignedToUserId: 'u-alpha', status: 'em_atendimento', priority: 'alta' }),
      tk({ id: 't3', assignedToUserId: 'u-beta', status: 'aberto', priority: 'normal', createdAt: new Date(NOW.getTime() - 20 * HOUR).toISOString() }),
    ]
    renderTab([ws1], tickets)

    const team = screen.getByTestId('teams-team-ws1-ms-l1')
    expect(within(team).getByText('Ana Líder')).toBeTruthy()
    expect(within(team).getByText('Líder')).toBeTruthy()
    expect(screen.getByTestId('teams-team-members-ms-l1')).toHaveTextContent('2 membros')
    expect(screen.getByTestId('teams-team-open-ms-l1')).toHaveTextContent('3 chamados')

    expect(screen.getByTestId('teams-member-ms-alpha')).toBeInTheDocument()
    expect(screen.getByTestId('teams-member-ms-beta')).toBeInTheDocument()
    expect(screen.getByTestId('teams-member-open-ms-alpha')).toHaveTextContent('2')
    expect(screen.getByTestId('teams-member-open-ms-beta')).toHaveTextContent('1')
  })

  it('métricas por equipe: abertos, em andamento, alta/críticos e SLA em risco', () => {
    const ws1 = unit('ws1', [leader('l1', 'Ana Líder', [member('alpha', 'Técnico Alpha')])], 'Campus A')
    const tickets = [
      tk({ id: 'ok', assignedToUserId: 'u-alpha', status: 'aberto', priority: 'normal', createdAt: new Date(NOW.getTime() - 1 * HOUR).toISOString() }),
      tk({ id: 'andamento', assignedToUserId: 'u-alpha', status: 'em_atendimento', priority: 'alta', createdAt: new Date(NOW.getTime() - 2 * HOUR).toISOString() }),
      tk({ id: 'near', assignedToUserId: 'u-alpha', status: 'aberto', priority: 'normal', createdAt: new Date(NOW.getTime() - 20 * HOUR).toISOString() }),
    ]
    renderTab([ws1], tickets)

    expect(screen.getByTestId('teams-team-stat-open-ms-l1')).toHaveTextContent('3')
    expect(screen.getByTestId('teams-team-stat-inProgress-ms-l1')).toHaveTextContent('1')
    expect(screen.getByTestId('teams-team-stat-highPriority-ms-l1')).toHaveTextContent('1')
    expect(screen.getByTestId('teams-team-stat-slaRisk-ms-l1')).toHaveTextContent('1')
  })

  it('membro sem chamados aparece normalmente com 0 chamados', () => {
    const ws1 = unit('ws1', [leader('l1', 'Ana Líder', [member('alpha', 'Técnico Alpha')])], 'Campus A')
    renderTab([ws1], [])

    expect(screen.getByTestId('teams-member-ms-alpha')).toBeInTheDocument()
    expect(screen.getByTestId('teams-member-open-ms-alpha')).toHaveTextContent('0')
  })

  it('líder sem membros permanece visível (estrutura organizacional real)', () => {
    const ws1 = unit('ws1', [leader('l1', 'Ana Líder', [])], 'Campus A')
    renderTab([ws1])

    const team = screen.getByTestId('teams-team-ws1-ms-l1')
    expect(within(team).getByText('Ana Líder')).toBeTruthy()
    expect(screen.getByTestId('teams-team-members-ms-l1')).toHaveTextContent('0 membros')
    expect(within(team).getByText('Sem equipe direta ainda.')).toBeTruthy()
  })

  it('membros sem responsável resolvível caem na seção "Sem responsável definido"', () => {
    const ws1 = unit('ws1', [
      leader('l1', 'Ana Líder', [member('solto', 'Técnico Solto', { managed_by: null })]),
    ], 'Campus A')
    renderTab([ws1])

    expect(screen.getByTestId('teams-unassigned')).toBeInTheDocument()
    expect(within(screen.getByTestId('teams-unassigned')).getByText('Sem responsável definido')).toBeTruthy()
    expect(screen.getByTestId('teams-member-ms-solto')).toBeInTheDocument()
    expect(screen.queryByTestId('teams-member-ms-solto2')).toBeNull()
  })

  it('estado vazio: nenhuma equipe e nenhum sem responsável → EmptyState honesto', () => {
    const ws1 = unit('ws1', [], 'Campus A')
    renderTab([ws1])

    expect(screen.getByText('Nenhuma equipe encontrada')).toBeInTheDocument()
    expect(screen.queryByTestId('teams-unassigned')).toBeNull()
  })

  it('não possui estados internos de loading/erro — o shell controla isso ao redor da aba', () => {
    const ws1 = unit('ws1', [leader('l1', 'Ana Líder', [])], 'Campus A')
    renderTab([ws1])

    expect(screen.queryByTestId('teams-loading')).toBeNull()
    expect(screen.queryByText(/Não foi possível carregar as equipes/)).toBeNull()
    expect(screen.getByTestId('tab-teams')).toBeInTheDocument()
  })

  it('"Ver chamados da unidade" reutiliza openChamadosFor da unidade dentro do escopo', () => {
    const ws1 = unit('ws1', [leader('l1', 'Ana Líder', [])], 'Campus A')
    const { onOpenChamados } = renderTab([ws1])

    fireEvent.click(screen.getByRole('button', { name: 'Ver chamados da unidade' }))
    expect(onOpenChamados).toHaveBeenCalledTimes(1)
  })

  it('sem callback de navegação (unidade fora do contexto) → botão desabilitado (fail-safe)', () => {
    const ws1 = unit('ws1', [leader('l1', 'Ana Líder', [])], 'Campus A')
    renderTab([ws1], [], { openChamadosFor: () => null })

    expect(screen.getByTestId('teams-open-ws1-ms-l1')).toBeDisabled()
  })
})