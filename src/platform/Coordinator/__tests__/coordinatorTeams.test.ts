import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { composeTeams } from '../coordinatorTeams'
import type { Ticket } from '../../../apps/chamados/types'
import type { CoordinatedLeader, CoordinatedUnit, CoordinatorRoleOption } from '../../../core/permissions/coordinatorService'
import type { Membership, TeamMember } from '../../../core/permissions/membership'

const NOW = new Date('2026-08-13T10:00:00Z')
const HOUR = 1000 * 60 * 60

function membership(
  id: string,
  profileId: string,
  workspaceId: string,
  managedBy: string | null,
): Membership {
  return {
    id,
    profile_id: profileId,
    workspace_id: workspaceId,
    role_id: 'role-z',
    status: 'active',
    managed_by: managedBy,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function teamMember(membershipId: string, profileId: string, workspaceId: string, managedBy: string | null): TeamMember {
  return {
    membership: membership(membershipId, profileId, workspaceId, managedBy),
    profile: { id: profileId, name: `Perfil ${profileId}`, email: `${profileId}@labhub.local`, status: 'active', roleId: 'tec' },
  }
}

function leader(
  leadershipId: string,
  profileId: string,
  workspaceId: string,
  members: TeamMember[] = [],
): CoordinatedLeader {
  return {
    leadership: membership(leadershipId, profileId, workspaceId, `coordination-${workspaceId}`),
    profile: { id: profileId, name: `Líder ${profileId}`, email: `${profileId}@labhub.local`, status: 'active', roleId: 'lider' },
    members,
  }
}

function unit(unitId: string, leaders: CoordinatedLeader[]): CoordinatedUnit {
  return {
    coordination: membership(`coordination-${unitId}`, 'u-coord', unitId, null),
    unitId,
    unitName: `Unidade ${unitId}`,
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

const rolesById = new Map<string, CoordinatorRoleOption>([
  ['role-z', { id: 'role-z', slug: 'tec', name: 'Técnico' }],
  ['role-l', { id: 'role-l', slug: 'lider', name: 'Líder' }],
])

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('composeTeams — projeção organizational + operacional (V1)', () => {
  it('cria uma equipe por liderança direta, com líder, membros e métricas', () => {
    const ws = unit('ws1', [
      leader('lead-1', 'u-lider', 'ws1', [
        teamMember('m-1', 'u-m1', 'ws1', 'lead-1'),
        teamMember('m-2', 'u-m2', 'ws1', 'lead-1'),
      ]),
    ])
    const projection = composeTeams([ws], [], {}, rolesById)

    expect(projection.teams).toHaveLength(1)
    const team = projection.teams[0]
    expect(team.unitId).toBe('ws1')
    expect(team.unitName).toBe('Unidade ws1')
    expect(team.leader.member.membership.id).toBe('lead-1')
    expect(team.members.map((m) => m.member.membership.id)).toEqual(['m-1', 'm-2'])
    expect(team.memberCount).toBe(2)
  })

  it('agrupa equipes por unidade (multiunidade não mistura)', () => {
    const ws1 = unit('ws1', [leader('lead-1', 'u-l1', 'ws1', [teamMember('m-1', 'u-m1', 'ws1', 'lead-1')])])
    const ws2 = unit('ws2', [leader('lead-2', 'u-l2', 'ws2', [teamMember('m-2', 'u-m2', 'ws2', 'lead-2')])])
    const projection = composeTeams([ws1, ws2], [], {}, rolesById)

    expect(projection.teams).toHaveLength(2)
    expect(projection.teams.map((t) => t.unitId)).toEqual(['ws1', 'ws2'])
    for (const team of projection.teams) {
      for (const member of [team.leader, ...team.members]) {
        expect(member.member.membership.workspace_id).toBe(team.unitId)
      }
    }
  })

  it('agrupa membros pelo líder correto (managed_by resolve para a liderança certa)', () => {
    const ws = unit('ws1', [
      leader('lead-a', 'u-la', 'ws1', [
        teamMember('m-1', 'u-m1', 'ws1', 'lead-a'),
      ]),
      leader('lead-b', 'u-lb', 'ws1', [
        teamMember('m-2', 'u-m2', 'ws1', 'lead-b'),
      ]),
    ])
    const projection = composeTeams([ws], [], {}, rolesById)

    const teamA = projection.teams.find((t) => t.leader.member.membership.id === 'lead-a')
    const teamB = projection.teams.find((t) => t.leader.member.membership.id === 'lead-b')
    expect(teamA?.members.map((m) => m.member.membership.id)).toEqual(['m-1'])
    expect(teamB?.members.map((m) => m.member.membership.id)).toEqual(['m-2'])
  })

  it('líder sem membros permanece visível com memberCount 0 e métricas vazias', () => {
    const ws = unit('ws1', [leader('lead-vazio', 'u-lv', 'ws1')])
    const projection = composeTeams([ws], [], {}, rolesById)

    expect(projection.teams).toHaveLength(1)
    const team = projection.teams[0]
    expect(team.members).toEqual([])
    expect(team.memberCount).toBe(0)
    expect(team.metrics).toEqual({ open: 0, inProgress: 0, highPriority: 0, slaRisk: 0 })
  })

  it('membro com managed_by NULL ou fora do escopo vai para a seção Sem responsável (sem inferir líder)', () => {
    const ws = unit('ws1', [
      leader('lead-a', 'u-la', 'ws1', [
        teamMember('m-solto', 'u-ms', 'ws1', null),
        teamMember('m-fora', 'u-mf', 'ws1', 'lead-inexistente'),
      ]),
    ])
    const projection = composeTeams([ws], [], {}, rolesById)

    expect(projection.teams[0].members).toEqual([])
    expect(projection.unassigned.map((u) => u.member.membership.id)).toEqual(['m-fora', 'm-solto'])
    for (const row of projection.unassigned) {
      expect(row.unitId).toBe('ws1')
    }
  })

  it('membro sem chamados aparece normalmente com métricas zero', () => {
    const ws = unit('ws1', [
      leader('lead-1', 'u-lider', 'ws1', [
        teamMember('m-1', 'u-m1', 'ws1', 'lead-1'),
      ]),
    ])
    const projection = composeTeams([ws], [], {}, rolesById)

    const member = projection.teams[0].members[0]
    expect(member.member.membership.id).toBe('m-1')
    expect(member.metrics).toEqual({ open: 0, inProgress: 0, highPriority: 0, slaRisk: 0 })
  })

  it('equipe com chamados soma só os tickets do membro gerido (assignedToUserId === profile_id)', () => {
    const ws = unit('ws1', [
      leader('lead-1', 'u-lider', 'ws1', [
        teamMember('m-1', 'u-m1', 'ws1', 'lead-1'),
        teamMember('m-2', 'u-m2', 'ws1', 'lead-1'),
      ]),
    ])
    const tickets = [
      tk({ id: 't1', assignedToUserId: 'u-m1' }),
      tk({ id: 't2', assignedToUserId: 'u-m2' }),
      tk({ id: 't3', assignedToUserId: 'outro-perfil-fora' }),
    ]
    const projection = composeTeams([ws], tickets, {}, rolesById)

    const team = projection.teams[0]
    const m1 = team.members.find((m) => m.member.membership.id === 'm-1')!
    const m2 = team.members.find((m) => m.member.membership.id === 'm-2')!
    expect(m1.metrics.open).toBe(1)
    expect(m2.metrics.open).toBe(1)
    expect(team.metrics.open).toBe(2)
  })

  it('equipe com múltiplos chamados soma cada um (várias status/prioridades/SLA)', () => {
    const ws = unit('ws1', [
      leader('lead-1', 'u-lider', 'ws1', [teamMember('m-1', 'u-m1', 'ws1', 'lead-1')]),
    ])
    const tickets = [
      tk({ id: 'ok', assignedToUserId: 'u-m1', status: 'aberto', priority: 'normal', createdAt: new Date(NOW.getTime() - 1 * HOUR).toISOString() }),
      tk({ id: 'andamento', assignedToUserId: 'u-m1', status: 'em_atendimento', priority: 'alta', createdAt: new Date(NOW.getTime() - 2 * HOUR).toISOString() }),
      tk({ id: 'sla-near', assignedToUserId: 'u-m1', status: 'aberto', priority: 'normal', createdAt: new Date(NOW.getTime() - 20 * HOUR).toISOString() }),
      tk({ id: 'urgente', assignedToUserId: 'u-m1', status: 'aberto', priority: 'urgente', createdAt: new Date(NOW.getTime() - 1 * HOUR).toISOString() }),
    ]
    const projection = composeTeams([ws], tickets, {}, rolesById)

    const member = projection.teams[0].members[0]
    expect(member.metrics.open).toBe(4)
    expect(member.metrics.inProgress).toBe(1)
    expect(member.metrics.highPriority).toBe(2)
    expect(member.metrics.slaRisk).toBe(1)
    expect(projection.teams[0].metrics).toEqual(member.metrics)
  })

  it('tickets fora do escopo nunca entram nas métricas (fail-closed)', () => {
    const ws = unit('ws1', [
      leader('lead-1', 'u-lider', 'ws1', [teamMember('m-1', 'u-m1', 'ws1', 'lead-1')]),
    ])
    const tickets = [
      tk({ id: 'fora', workspace_id: 'ws99', assignedToUserId: 'u-m1' }),
      tk({ id: 'sem-workspace', workspace_id: undefined, assignedToUserId: 'u-m1' }),
    ]
    const projection = composeTeams([ws], tickets, {}, rolesById)

    expect(projection.teams[0].metrics.open).toBe(0)
    expect(projection.teams[0].members[0].metrics.open).toBe(0)
  })

  it('chamado arquivado/fechado não conta como aberto (mesma semântica do app)', () => {
    const ws = unit('ws1', [
      leader('lead-1', 'u-lider', 'ws1', [teamMember('m-1', 'u-m1', 'ws1', 'lead-1')]),
    ])
    const tickets = [
      tk({ id: 'arq', assignedToUserId: 'u-m1', archived: true }),
      tk({ id: 'fechado', assignedToUserId: 'u-m1', status: 'fechado' }),
      tk({ id: 'resolvido', assignedToUserId: 'u-m1', status: 'resolvido' }),
      tk({ id: 'aberto', assignedToUserId: 'u-m1' }),
    ]
    const projection = composeTeams([ws], tickets, {}, rolesById)

    expect(projection.teams[0].metrics.open).toBe(1)
    expect(projection.teams[0].members[0].metrics.open).toBe(1)
  })

  it('deduplica por membership.id (uma membership nunca fecha em duas equipes)', () => {
    const ws = unit('ws1', [
      leader('lead-a', 'u-la', 'ws1', [teamMember('m-dupe', 'u-d', 'ws1', 'lead-a')]),
      leader('lead-b', 'u-lb', 'ws1', [teamMember('m-dupe', 'u-d', 'ws1', 'lead-a')]),
    ])
    const projection = composeTeams([ws], [], {}, rolesById)

    const allMembers = projection.teams.flatMap((t) => t.members.map((m) => m.member.membership.id))
    expect(allMembers).toEqual(['m-dupe'])
    expect(projection.teams[0].memberCount + projection.teams[1].memberCount).toBe(1)
  })

  it('métricas vazias: sem chamados e sem membros → zeros honestos', () => {
    const ws = unit('ws1', [leader('lead-1', 'u-lider', 'ws1')])
    const projection = composeTeams([ws], [], {}, rolesById)

    expect(projection.summary).toEqual({ teamCount: 1, personCount: 1, openCount: 0 })
    expect(projection.unassigned).toEqual([])
    expect(projection.teams[0].metrics).toEqual({ open: 0, inProgress: 0, highPriority: 0, slaRisk: 0 })
  })

  it('summary soma pessoas e chamados abertos incluindo a seção Sem responsável', () => {
    const ws = unit('ws1', [
      leader('lead-1', 'u-lider', 'ws1', [
        teamMember('m-1', 'u-m1', 'ws1', 'lead-1'),
        teamMember('m-solto', 'u-ms', 'ws1', null),
      ]),
    ])
    const tickets = [
      tk({ id: 't1', assignedToUserId: 'u-m1' }),
      tk({ id: 't2', assignedToUserId: 'u-ms' }),
    ]
    const projection = composeTeams([ws], tickets, {}, rolesById)

    expect(projection.summary.teamCount).toBe(1)
    expect(projection.summary.personCount).toBe(3)
    expect(projection.summary.openCount).toBe(2)
  })

  it('ordena líderes e membros por nome (locale pt-BR) e nunca muta as entradas', () => {
    const membersA = [
      teamMember('m-b', 'u-b', 'ws1', 'lead-a'),
      teamMember('m-a', 'u-a', 'ws1', 'lead-a'),
    ]
    const ws = unit('ws1', [
      leader('lead-b', 'u-lb', 'ws1'),
      leader('lead-a', 'u-la', 'ws1', membersA),
    ])
    const snapshotUnit = structuredClone(ws)
    const snapshotTickets = [] as Ticket[]

    const projection = composeTeams([ws], snapshotTickets, {}, rolesById)

    expect(projection.teams.map((t) => t.leader.member.profile?.name)).toEqual(['Líder u-la', 'Líder u-lb'])
    expect(projection.teams[0].members.map((m) => m.member.membership.id)).toEqual(['m-a', 'm-b'])
    expect(ws).toEqual(snapshotUnit)
  })
})