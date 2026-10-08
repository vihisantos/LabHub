import { describe, it, expect } from 'vitest'
import {
  aggregatePeopleRows,
  composePeopleGroups,
  composePeopleRows,
  filterAggregatedPeople,
  filterPeopleGroups,
  filterPeopleRows,
  peopleStatusLabel,
  COORDINATOR_LEADER_LABEL,
  GROUP_UNASSIGNED_LABEL,
} from '../coordinatorHelpers'
import type {
  AggregatedPerson,
  PeopleLeader,
  PeopleRow,
} from '../coordinatorHelpers'
import type {
  CoordinatorInactiveMember,
  CoordinatorMember,
  CoordinatorRequest,
  CoordinatorRoleOption,
  CoordinatedUnit,
} from '../../../core/permissions/coordinatorService'
import type { Membership, MembershipStatus, TeamMember, TeamMemberProfile } from '../../../core/permissions/membership'

const rolesById = new Map<string, CoordinatorRoleOption>([
  ['role-technician', { id: 'role-technician', slug: 'tec', name: 'Técnico' }],
  ['role-lider', { id: 'role-lider', slug: 'lider', name: 'Líder' }],
  ['role-viewer', { id: 'role-viewer', slug: 'vis', name: 'Visualizador' }],
])

function mem(
  id: string,
  profileId: string,
  over: Partial<Membership> = {},
): Membership {
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

function member(id: string, name: string, over: Partial<Membership> = {}): TeamMember {
  return { membership: mem(`ms-${id}`, `u-${id}`, over), profile: prof(id, name) }
}

function leader(id: string, name: string, members: TeamMember[]): CoordinatedUnit['leaders'][number] {
  return {
    leadership: mem(`ms-${id}`, `u-${id}`, { role_id: 'role-lider', managed_by: 'coordination-ws1' }),
    profile: prof(id, name),
    members,
  }
}

function unit(id: string, leaders: CoordinatedUnit['leaders'], unitName = `Unidade ${id}`): CoordinatedUnit {
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
])

const ws1Requests: Record<string, CoordinatorRequest[]> = {
  ws1: [request('p1', 'Clara Pendente')],
}
const ws1Inactive: Record<string, CoordinatorInactiveMember[]> = {
  ws1: [inactive('s1', 'Davi Suspenso', 'suspended'), inactive('r1', 'Eva Removida', 'removed')],
}

describe('composePeopleRows — diretório READ-ONLY do escopo (PR 275)', () => {
  it('projeta lideranças, membros, pendências, suspensos e removidos com rótulo/unidade/status reais', () => {
    const rows = composePeopleRows([ws1], ws1Requests, ws1Inactive, rolesById)

    expect(rows).toHaveLength(6)
    expect(rows.map((r) => r.membership.id)).toEqual([
      'ms-l1', // Ana Líder
      'ms-l2', // Bruno Líder
      'ms-p1', // Clara Pendente
      'ms-s1', // Davi Suspenso
      'ms-r1', // Eva Removida
      'ms-alpha', // Técnico Alpha
    ])
    expect(rows.every((r) => r.unitId === 'ws1' && r.unitName === 'Unidade ws1')).toBe(true)
    expect(rows.find((r) => r.membership.id === 'ms-l1')?.roleLabel).toBe('Líder')
    expect(rows.find((r) => r.membership.id === 'ms-alpha')?.roleLabel).toBe('Técnico')
    const byId = new Map(rows.map((r) => [r.membership.id, r.status]))
    expect(byId.get('ms-l1')).toBe('active')
    expect(byId.get('ms-p1')).toBe('pending')
    expect(byId.get('ms-s1')).toBe('suspended')
    expect(byId.get('ms-r1')).toBe('removed')
  })

  it('escopo: só projeta as unidades recebidas — dados de unidades fora ficam de fora', () => {
    const rows = composePeopleRows(
      [ws1],
      { ws1: ws1Requests.ws1, ws2: [request('p2', 'Fora do Escopo')] },
      { ws1: ws1Inactive.ws1, ws2: [inactive('s2', 'Fora do Escopo 2', 'suspended')] },
      rolesById,
    )

    expect(rows).toHaveLength(6)
    expect(rows.some((r) => r.unitId === 'ws2')).toBe(false)
  })

  it('ordena por nome (locale pt-BR) e nunca muta as entradas', () => {
    const snapshotUnits = structuredClone([ws1])
    const rows = composePeopleRows([ws1], ws1Requests, ws1Inactive, rolesById)

    const names = rows.map((r) => r.profile?.name)
    expect(names).toEqual([...names].sort((a, b) => (a ?? '').localeCompare(b ?? '', 'pt-BR')))
    expect([ws1]).toEqual(snapshotUnits)
  })

  it('membro ATIVO sem responsável (RPC 071, managed_by NULL) entra no diretório com leader null', () => {
    const membersByUnit: Record<string, CoordinatorMember[]> = {
      ws1: [activeMember('u1', 'Ana Sem Responsável')],
    }
    const rows = composePeopleRows([ws1], ws1Requests, ws1Inactive, rolesById, membersByUnit)

    const row = rows.find((r) => r.membership.id === 'ms-u1')
    expect(row).toBeDefined()
    expect(row?.status).toBe('active')
    expect(row?.leader).toBeNull()
    expect(row?.unitId).toBe('ws1')
  })

  it('membro ativo sob liderança resolve o líder corretamente (mesmo resolvedor do escopo 047)', () => {
    const membersByUnit: Record<string, CoordinatorMember[]> = {
      ws1: [activeMember('u2', 'Bruno Na Equipe', { managed_by: 'ms-l1' })],
    }
    const rows = composePeopleRows([ws1], ws1Requests, ws1Inactive, rolesById, membersByUnit)

    const row = rows.find((r) => r.membership.id === 'ms-u2')
    expect(row?.leader?.membershipId).toBe('ms-l1')
    expect(row?.leader?.isCoordination).toBe(false)
  })

  it('dedup: membro ativo já presente via escopo 047 não vira linha duplicada', () => {
    const membersByUnit: Record<string, CoordinatorMember[]> = {
      ws1: [activeMember('alpha', 'Técnico Alpha', { managed_by: 'ms-l1' })],
    }
    const rows = composePeopleRows([ws1], ws1Requests, ws1Inactive, rolesById, membersByUnit)

    expect(rows).toHaveLength(6) // mesmo total do cenário base — sem duplicata
    expect(rows.filter((r) => r.membership.id === 'ms-alpha')).toHaveLength(1)
  })

  it('escopo: membros ativos de unidade fora do escopo recebido nunca entram', () => {
    const membersByUnit: Record<string, CoordinatorMember[]> = {
      ws1: [activeMember('u1', 'Ana Sem Responsável')],
      ws2: [activeMember('u2', 'Fora do Escopo Ativo')],
    }
    const rows = composePeopleRows([ws1], ws1Requests, ws1Inactive, rolesById, membersByUnit)

    expect(rows.some((r) => r.membership.id === 'ms-u2')).toBe(false)
    expect(rows.some((r) => r.membership.id === 'ms-u1')).toBe(true)
  })

  it('membersByUnit ausente (default {}) mantém o comportamento antigo', () => {
    const rows = composePeopleRows([ws1], ws1Requests, ws1Inactive, rolesById)

    expect(rows).toHaveLength(6)
  })

  it('desduplica por membership.id (a mesma membership nunca vira duas linhas)', () => {
    const rows = composePeopleRows(
      [ws1],
      { ...ws1Requests, ws1: [request('dup', 'Duplicada')] },
      { ...ws1Inactive, ws1: [inactive('dup', 'Duplicada', 'removed')] },
      rolesById,
    )

    expect(rows.filter((r) => r.membership.id === 'ms-dup')).toHaveLength(1)
  })

  it('perfil ausente (RLS) não quebra a linha — rótulo honesto', () => {
    const hiddenProfileUnit: CoordinatedUnit = {
      coordination: mem('coordination-ws1', 'u-coord'),
      unitId: 'ws1',
      unitName: 'Unidade ws1',
      leaders: [
        {
          leadership: mem('ms-h1', 'u-h1', { role_id: 'role-outside', managed_by: 'coordination-ws1' }),
          profile: null,
          members: [],
        },
      ],
    }

    const rows = composePeopleRows([hiddenProfileUnit], {}, {}, rolesById)
    expect(rows).toHaveLength(1)
    expect(rows[0].profile).toBeNull()
    expect(rows[0].roleLabel).toBe('—')
  })

  it('vazio legítimo: nenhuma unidade → zero linhas', () => {
    expect(composePeopleRows([], {}, {}, rolesById)).toEqual([])
  })
})

describe('peopleStatusLabel — status real da membership, sem inventar', () => {
  it('mapeia os 4 status do modelo para exibição', () => {
    const cases: Array<[MembershipStatus, string]> = [
      ['active', 'Ativo'],
      ['pending', 'Pendente'],
      ['suspended', 'Suspenso'],
      ['removed', 'Removido'],
    ]
    for (const [status, label] of cases) expect(peopleStatusLabel(status)).toBe(label)
  })
})

describe('filterPeopleRows — busca e status sobre o conjunto JÁ escopado', () => {
  const rows = composePeopleRows([ws1], ws1Requests, ws1Inactive, rolesById)

  it('sem filtros devolve tudo (e não muta de volta os inputs)', () => {
    expect(filterPeopleRows(rows, { query: '', status: 'all' })).toHaveLength(rows.length)
  })

  it('busca por parte do nome é case-insensitive', () => {
    const hit = filterPeopleRows(rows, { query: 'CLARA', status: 'all' })
    expect(hit.map((r) => r.membership.id)).toEqual(['ms-p1'])
  })

  it('busca por e-mail', () => {
    const hit = filterPeopleRows(rows, { query: 'pessoa-alpha', status: 'all' })
    expect(hit.map((r) => r.membership.id)).toEqual(['ms-alpha'])
  })

  it('filtro por status é excludente', () => {
    expect(filterPeopleRows(rows, { query: '', status: 'pending' })).toHaveLength(1)
    expect(filterPeopleRows(rows, { query: '', status: 'active' })).toHaveLength(3)
    expect(filterPeopleRows(rows, { query: '', status: 'suspended' })).toHaveLength(1)
    expect(filterPeopleRows(rows, { query: '', status: 'removed' })).toHaveLength(1)
  })

  it('busca + status combinados', () => {
    const hit = filterPeopleRows(rows, { query: 'a', status: 'active' })
    expect(hit.length).toBeGreaterThan(0)
    expect(hit.every((r) => r.status === 'active')).toBe(true)
  })

  it('sem correspondência → lista vazia honesta', () => {
    expect(filterPeopleRows(rows, { query: 'zzz-inexistente' , status: 'all' })).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// PR 277 — ESTRUTURA ORGANIZACIONAL (projeção pura do escopo, READ-ONLY)
// ---------------------------------------------------------------------------

describe('composePeopleGroups — estrutura organizacional do escopo (PR 277)', () => {
  // Fixtures com `managed_by` apontando PARA a coordenação da própria unidade
  // (o helper `leader()` acima fixa `coordination-ws1`, só serve ao ws1).
  function structLeader(
    id: string,
    name: string,
    unitId: string,
    members: TeamMember[],
  ): CoordinatedUnit['leaders'][number] {
    return {
      leadership: mem(`ms-${id}`, `u-${id}`, { role_id: 'role-lider', managed_by: `coordination-${unitId}` }),
      profile: prof(id, name),
      members,
    }
  }

  // Unidade com: líder gerenciando alguém, líder vazio, pendência e
  // suspenso/removido SEM responsável (managed_by NULL) → seção fixa do topo.
  const structUnit: CoordinatedUnit = {
    coordination: mem('coordination-wsx', 'u-coord', { role_id: 'role-coordinator' }),
    unitId: 'wsx',
    unitName: 'Unidade Estrutura',
    leaders: [
      structLeader('zara', 'Zara Líder', 'wsx', [
        { membership: mem('ms-zico', 'u-zico', { managed_by: 'ms-zara' }), profile: prof('zico', 'Zico Membro') },
      ]),
      structLeader('abel', 'Abel Líder', 'wsx', []),
    ],
  }
  const structRequests: Record<string, CoordinatorRequest[]> = {
    wsx: [request('fre', 'Frei Pendente')],
  }
  const structInactive: Record<string, CoordinatorInactiveMember[]> = {
    wsx: [inactive('sat', 'Só Removido', 'removed')],
  }

  it('nós por unidade: "Sem responsável" fixo no topo, coordenação primeiro, líderes em ordem alfabética pt-BR', () => {
    const groups = composePeopleGroups([structUnit], structRequests, structInactive, rolesById)

    expect(groups.map((g) => g.kind)).toEqual(['unassigned', 'coordination', 'leader', 'leader'])
    expect(groups[0].label).toBe(GROUP_UNASSIGNED_LABEL)
    expect(groups[1].label).toBe(COORDINATOR_LEADER_LABEL)
    expect(groups[2].membershipId).toBe('ms-abel') // Abel antes de Zara
    expect(groups[3].membershipId).toBe('ms-zara')
  })

  it('roteia pelo MESMO resolvedor da lista: coordenação → nó da coordenação; líder → nó do líder; NULL → sem responsável', () => {
    const groups = composePeopleGroups([structUnit], structRequests, structInactive, rolesById)
    const coord = groups.find((g) => g.kind === 'coordination')
    const zara = groups.find((g) => g.kind === 'leader' && g.membershipId === 'ms-zara')
    const abel = groups.find((g) => g.kind === 'leader' && g.membershipId === 'ms-abel')
    const un = groups.find((g) => g.kind === 'unassigned')

    // Líderes são gerenciados pela coordenação (managed_by) → vivem no nó dela.
    expect(coord?.people.map((p) => p.membership.id)).toEqual(['ms-abel', 'ms-zara'])
    expect(zara?.people.map((p) => p.membership.id)).toEqual(['ms-zico'])
    expect(abel?.people).toEqual([])
    expect(un?.people.map((p) => p.membership.id)).toEqual(['ms-fre', 'ms-sat'])
  })

  it('liderança sem membros permanece no nó como estrutura (sem inventar vínculo)', () => {
    const groups = composePeopleGroups([structUnit], structRequests, structInactive, rolesById)
    const abel = groups.find((g) => g.kind === 'leader' && g.membershipId === 'ms-abel')

    expect(abel?.people).toEqual([])
  })

  it('seção "Sem responsável" é omitida quando não há ninguém sem responsável', () => {
    const allManaged: CoordinatedUnit = {
      coordination: mem('coordination-wsy', 'u-coord', { role_id: 'role-coordinator' }),
      unitId: 'wsy',
      unitName: 'Unidade Toda Gerida',
      leaders: [
        structLeader('luana', 'Luana Líder', 'wsy', [
          { membership: mem('ms-leo', 'u-leo', { managed_by: 'ms-luana' }), profile: prof('leo', 'Leo Membro') },
        ]),
      ],
    }

    const groups = composePeopleGroups([allManaged], {}, {}, rolesById)

    expect(groups.some((g) => g.kind === 'unassigned')).toBe(false)
    expect(groups.map((g) => g.kind)).toEqual(['coordination', 'leader'])
  })

  it('escopo: só unidades recebidas geram nós — dados fora ficam de fora', () => {
    const groups = composePeopleGroups(
      [structUnit],
      { wsx: structRequests.wsx, wsf: [request('out', 'Fora do Escopo')] },
      { wsx: structInactive.wsx, wsf: [inactive('out2', 'Fora 2', 'removed')] },
      rolesById,
    )
    const all = groups.flatMap((g) => g.people.map((p) => p.membership.id))

    expect(all).not.toContain('ms-out')
    expect(all).not.toContain('ms-out2')
  })

  it('nunca muta as entradas', () => {
    const snapshot = structuredClone([structUnit])

    composePeopleGroups([structUnit], structRequests, structInactive, rolesById)

    expect([structUnit]).toEqual(snapshot)
  })

  it('membro ATIVO sem responsável (RPC 071) sobe na seção fixa "Sem responsável"', () => {
    const membersByUnit: Record<string, CoordinatorMember[]> = {
      wsx: [activeMember('u1', 'Ana Sem Responsável')],
    }
    const groups = composePeopleGroups([structUnit], structRequests, structInactive, rolesById, membersByUnit)
    const un = groups.find((g) => g.kind === 'unassigned')

    expect(un?.label).toBe(GROUP_UNASSIGNED_LABEL)
    expect(un?.people.map((p) => p.membership.id)).toContain('ms-u1')
  })

  it('membro ativo de membersByUnit roteado pelo MESMO resolvedor: líder → nó do líder', () => {
    const membersByUnit: Record<string, CoordinatorMember[]> = {
      wsx: [activeMember('u2', 'Bruno Na Equipe', { managed_by: 'ms-zara' })],
    }
    const groups = composePeopleGroups([structUnit], structRequests, structInactive, rolesById, membersByUnit)
    const zara = groups.find((g) => g.kind === 'leader' && g.membershipId === 'ms-zara')

    expect(zara?.people.map((p) => p.membership.id)).toContain('ms-u2')
  })

  it('membro ativo duplicado da hierarquia (047) não duplica no nó', () => {
    const membersByUnit: Record<string, CoordinatorMember[]> = {
      wsx: [activeMember('zico', 'Zico Membro', { managed_by: 'ms-zara' })],
    }
    const groups = composePeopleGroups([structUnit], structRequests, structInactive, rolesById, membersByUnit)
    const zara = groups.find((g) => g.kind === 'leader' && g.membershipId === 'ms-zara')

    expect(zara?.people.filter((p) => p.membership.id === 'ms-zico')).toHaveLength(1)
  })

  it('membersByUnit ausente (default {}) mantém a estrutura antiga', () => {
    const groups = composePeopleGroups([structUnit], structRequests, structInactive, rolesById)

    expect(groups.map((g) => g.kind)).toEqual(['unassigned', 'coordination', 'leader', 'leader'])
  })

  it('vazio legítimo: nenhuma unidade → zero nós', () => {
    expect(composePeopleGroups([], {}, {}, rolesById)).toEqual([])
  })
})

describe('filterPeopleGroups — filtro por responsável sobre a estrutura (PR 277)', () => {
  const structUnit: CoordinatedUnit = unit('wsx', [
    leader('zara', 'Zara Líder', [member('zico', 'Zico Membro', { managed_by: 'ms-zara' })]),
    leader('abel', 'Abel Líder', []),
  ], 'Unidade Estrutura')
  const structRequests: Record<string, CoordinatorRequest[]> = {
    wsx: [request('fre', 'Frei Pendente')],
  }
  const structInactive: Record<string, CoordinatorInactiveMember[]> = {
    wsx: [inactive('sat', 'Só Removido', 'removed')],
  }
  const groups = composePeopleGroups([structUnit], structRequests, structInactive, rolesById)

  it('"all" devolve a estrutura inteira — nós com e sem pessoas', () => {
    const out = filterPeopleGroups(groups, { query: '', status: 'all', responsible: 'all' })

    expect(out.map((g) => g.kind)).toEqual(['unassigned', 'coordination', 'leader', 'leader'])
    expect(out.find((g) => g.kind === 'leader' && g.membershipId === 'ms-abel')?.people).toEqual([])
  })

  it('"coordination" mantém apenas nós de coordenação', () => {
    const out = filterPeopleGroups(groups, { query: '', status: 'all', responsible: 'coordination' })

    expect(out.map((g) => g.kind)).toEqual(['coordination'])
    expect(out[0].label).toBe(COORDINATOR_LEADER_LABEL)
  })

  it('"leaders" mantém apenas líderes — inclusive os vazios', () => {
    const out = filterPeopleGroups(groups, { query: '', status: 'all', responsible: 'leaders' })

    expect(out.map((g) => g.membershipId)).toEqual(['ms-abel', 'ms-zara'])
    expect(out.find((g) => g.membershipId === 'ms-abel')?.people).toEqual([])
    expect(out.find((g) => g.membershipId === 'ms-zara')?.people).toHaveLength(1)
  })

  it('"unassigned" mantém apenas o nó "Sem responsável"', () => {
    const out = filterPeopleGroups(groups, { query: '', status: 'all', responsible: 'unassigned' })

    expect(out.map((g) => g.kind)).toEqual(['unassigned'])
    expect(out[0].label).toBe(GROUP_UNASSIGNED_LABEL)
  })

  it('responsável + status combinados (interseção)', () => {
    const out = filterPeopleGroups(groups, { query: '', status: 'removed', responsible: 'unassigned' })

    expect(out.flatMap((g) => g.people.map((p) => p.membership.id))).toEqual(['ms-sat'])
  })

  it('responsável + busca combinados', () => {
    const out = filterPeopleGroups(groups, { query: 'zico', status: 'all', responsible: 'leaders' })

    expect(out.map((g) => g.membershipId)).toEqual(['ms-zara'])
    expect(out.flatMap((g) => g.people.map((p) => p.membership.id))).toEqual(['ms-zico'])
  })

  it('busca sem correspondência colapsa os nós vazios → estrutura vazia (EmptyState honesto)', () => {
    const out = filterPeopleGroups(groups, { query: 'zzz-inexistente', status: 'all', responsible: 'all' })

    expect(out).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// PR 363 — PESSOA CONSOLIDADA (1 perfil → 1 card → N unidades autorizadas).
// ---------------------------------------------------------------------------

describe('aggregatePeopleRows — 1 perfil = 1 card com N unidades (#363)', () => {
  function prow(opts: {
    mid: string
    uid: string
    unit: string
    profileId: string
    name?: string
    status?: MembershipStatus
    roleLabel?: string
    leader?: PeopleLeader | null
    profile?: TeamMemberProfile | null
  }): PeopleRow {
    const profile =
      opts.profile === undefined
        ? prof(opts.profileId, opts.name ?? 'João Silva')
        : opts.profile
    return {
      membership: mem(opts.mid, opts.profileId, {
        workspace_id: opts.uid,
        status: opts.status ?? 'active',
      }),
      profile,
      roleLabel: opts.roleLabel ?? 'Analista de TI',
      unitId: opts.uid,
      unitName: opts.unit,
      status: opts.status ?? 'active',
      leader: opts.leader ?? null,
    }
  }

  it('João com 3 memberships (Piracicaba/Mooca/Paulista) vira 1 pessoa com 3 unidades — nunca 3 pessoas', () => {
    const people = aggregatePeopleRows([
      prow({ mid: 'ms-pi', uid: 'ws-pi', unit: 'Piracicaba', profileId: 'u-joao' }),
      prow({ mid: 'ms-mo', uid: 'ws-mo', unit: 'Mooca', profileId: 'u-joao' }),
      prow({ mid: 'ms-pa', uid: 'ws-pa', unit: 'Paulista', profileId: 'u-joao' }),
    ])

    expect(people).toHaveLength(1)
    expect(people[0].profileId).toBe('u-joao')
    expect(people[0].units.map((u) => u.unitName)).toEqual(['Piracicaba', 'Mooca', 'Paulista'])
  })

  it('agrega por ID estável (profile_id), NUNCA por nome: nomes iguais ≠ mesma pessoa', () => {
    const pessoas = aggregatePeopleRows([
      prow({ mid: 'ms-a', uid: 'ws1', unit: 'Unidade A', profileId: 'u-a', name: 'João Silva' }),
      prow({ mid: 'ms-b', uid: 'ws2', unit: 'Unidade B', profileId: 'u-b', name: 'João Silva' }),
    ])

    expect(pessoas).toHaveLength(2)
  })

  it('mesmo id e nomes divergentes → 1 pessoa (o id estável manda)', () => {
    const people = aggregatePeopleRows([
      prow({ mid: 'ms-a', uid: 'ws1', unit: 'Unidade A', profileId: 'u-joao', name: 'João Silva' }),
      prow({ mid: 'ms-b', uid: 'ws2', unit: 'Unidade B', profileId: 'u-joao', name: 'João S.' }),
    ])

    expect(people).toHaveLength(1)
    expect(people[0].units).toHaveLength(2)
  })

  it('preserva cargo/status/líder de CADA vínculo (nenhuma prioridade inventada)', () => {
    const people = aggregatePeopleRows([
      prow({ mid: 'ms-a', uid: 'ws1', unit: 'Unidade A', profileId: 'u-joao', status: 'active', roleLabel: 'Analista de TI', leader: null }),
      prow({
        mid: 'ms-b',
        uid: 'ws2',
        unit: 'Unidade B',
        profileId: 'u-joao',
        status: 'pending',
        roleLabel: 'Estagiário',
        leader: { membershipId: 'ms-l1', name: 'Maria', email: 'maria@labhub.app', isCoordination: false },
      }),
    ])

    const units = people[0].units
    expect(units.map((u) => u.status)).toEqual(['active', 'pending'])
    expect(units.map((u) => u.roleLabel)).toEqual(['Analista de TI', 'Estagiário'])
    expect(units[0].leader).toBeNull()
    expect(units[1].leader?.name).toBe('Maria')
  })

  it('perfil oculto (RLS) em uma fonte não apaga o nome — o profile_id consolida', () => {
    const people = aggregatePeopleRows([
      prow({ mid: 'ms-a', uid: 'ws1', unit: 'Unidade A', profileId: 'u-joao', profile: null }),
      prow({ mid: 'ms-b', uid: 'ws2', unit: 'Unidade B', profileId: 'u-joao' }),
    ])

    expect(people).toHaveLength(1)
    expect(people[0].name).toBe('João Silva')
    expect(people[0].profile).not.toBeNull()
  })

  it('perfil oculto em TODAS as fontes → fallback honesto', () => {
    const people = aggregatePeopleRows([
      prow({ mid: 'ms-a', uid: 'ws1', unit: 'Unidade A', profileId: 'u-h1', profile: null }),
    ])

    expect(people[0].name).toBe('Perfil não disponível')
    expect(people[0].email).toBe('Sem e-mail registrado')
  })

  it('ordena pessoas por nome (locale pt-BR) e nunca perde vínculo', () => {
    const people = aggregatePeopleRows([
      prow({ mid: 'ms-z', uid: 'ws1', unit: 'Zeta', profileId: 'u-z', name: 'Zico' }),
      prow({ mid: 'ms-a', uid: 'ws2', unit: 'Alfa', profileId: 'u-a', name: 'Ana' }),
      prow({ mid: 'ms-j', uid: 'ws3', unit: 'João', profileId: 'u-j', name: 'João Silva' }),
    ])

    expect(people.map((p) => p.name)).toEqual(['Ana', 'João Silva', 'Zico'])
    expect(people.reduce((acc, p) => acc + p.units.length, 0)).toBe(3)
  })
})

describe('filterAggregatedPeople — unidade como contexto; status/responsável por vínculo (#363)', () => {
  const profileOf = (id: string, name: string): TeamMemberProfile => ({
    id,
    name,
    email: `pessoa-${id}@labhub.app`,
    status: 'active',
    roleId: 'role-technician',
  })
  const joao: AggregatedPerson = {
    profileId: 'u-joao',
    profile: profileOf('u-joao', 'João Silva'),
    name: 'João Silva',
    email: 'pessoa-u-joao@labhub.app',
    units: [
      { membershipId: 'ms-pi', unitId: 'ws-pi', unitName: 'Piracicaba', roleLabel: 'Analista de TI', status: 'active', leader: null },
      { membershipId: 'ms-mo', unitId: 'ws-mo', unitName: 'Mooca', roleLabel: 'Analista de TI', status: 'active', leader: null },
      { membershipId: 'ms-pa', unitId: 'ws-pa', unitName: 'Paulista', roleLabel: 'Técnico', status: 'pending', leader: null },
    ],
  }
  const maria: AggregatedPerson = {
    profileId: 'u-maria',
    profile: profileOf('u-maria', 'Maria Coordenadora'),
    name: 'Maria Coordenadora',
    email: 'pessoa-u-maria@labhub.app',
    units: [
      {
        membershipId: 'ms-ma',
        unitId: 'ws-pi',
        unitName: 'Piracicaba',
        roleLabel: 'Líder',
        status: 'active',
        leader: { membershipId: 'ms-coord', name: COORDINATOR_LEADER_LABEL, email: null, isCoordination: true },
      },
    ],
  }
  const zulma: AggregatedPerson = {
    profileId: 'u-zulma',
    profile: profileOf('u-zulma', 'Zulma Membro'),
    name: 'Zulma Membro',
    email: 'pessoa-u-zulma@labhub.app',
    units: [
      {
        membershipId: 'ms-zu',
        unitId: 'ws-mo',
        unitName: 'Mooca',
        roleLabel: 'Técnico',
        status: 'active',
        leader: { membershipId: 'ms-l9', name: 'Zé Líder', email: 'ze@labhub.app', isCoordination: false },
      },
    ],
  }
  const todos = [joao, maria, zulma]

  it('"all" (Todas as unidades) devolve todos e não recorta vínculo algum', () => {
    const out = filterAggregatedPeople(todos, { query: '', status: 'all', responsible: 'all', unit: 'all' })

    expect(out).toHaveLength(3)
    expect(out.find((p) => p.profileId === 'u-joao')?.units).toHaveLength(3)
  })

  it('unidade específica: João (Piracicaba/Mooca/Paulista) com Mooca → 1 card e SOMENTE Mooca', () => {
    const out = filterAggregatedPeople(todos, { query: '', status: 'all', responsible: 'all', unit: 'ws-mo' })

    expect(out.map((p) => p.profileId)).toEqual(['u-joao', 'u-zulma'])
    expect(out.find((p) => p.profileId === 'u-joao')?.units.map((u) => u.unitName)).toEqual(['Mooca'])
  })

  it('pessoa sem vínculo na unidade filtrada não aparece (mesmo pertencendo ao escopo)', () => {
    const out = filterAggregatedPeople(todos, { query: '', status: 'all', responsible: 'all', unit: 'ws-pa' })

    expect(out.map((p) => p.profileId)).toEqual(['u-joao'])
    expect(out.some((p) => p.profileId === 'u-maria')).toBe(false)
  })

  it('status casa em QUALQUER vínculo do contexto — e respeita o contexto de unidade', () => {
    // Com Todas as unidades: João tem pendente (Paulista) → casa.
    const all = filterAggregatedPeople(todos, { query: '', status: 'pending', responsible: 'all', unit: 'all' })
    expect(all.map((p) => p.profileId)).toEqual(['u-joao'])
    // Com Mooca selecionada: o vínculo de João lá é ATIVO → João NÃO casa (não inventa).
    const mo = filterAggregatedPeople(todos, { query: '', status: 'pending', responsible: 'all', unit: 'ws-mo' })
    expect(mo).toEqual([])
  })

  it('responsável casa em QUALQUER vínculo (coordenação / líder / sem responsável)', () => {
    const coord = filterAggregatedPeople(todos, { query: '', status: 'all', responsible: 'coordination', unit: 'all' })
    expect(coord.map((p) => p.profileId)).toEqual(['u-maria'])

    const leaders = filterAggregatedPeople(todos, { query: '', status: 'all', responsible: 'leaders', unit: 'all' })
    expect(leaders.map((p) => p.profileId)).toEqual(['u-zulma'])

    const unassigned = filterAggregatedPeople(todos, { query: '', status: 'all', responsible: 'unassigned', unit: 'all' })
    expect(unassigned.map((p) => p.profileId)).toEqual(['u-joao'])
  })

  it('busca por nome/e-mail sobre a pessoa consolidada', () => {
    const byName = filterAggregatedPeople(todos, { query: 'zulma', status: 'all', responsible: 'all', unit: 'all' })
    expect(byName.map((p) => p.profileId)).toEqual(['u-zulma'])

    const byEmail = filterAggregatedPeople(todos, { query: 'PESSOA-U-MARIA', status: 'all', responsible: 'all', unit: 'all' })
    expect(byEmail.map((p) => p.profileId)).toEqual(['u-maria'])
  })

  it('união honesta de filtros funciona sem mágica', () => {
    const out = filterAggregatedPeople(todos, { query: 'joão', status: 'active', responsible: 'unassigned', unit: 'all' })
    // João tem um vínculo ATIVO sem responsável → casa.
    expect(out.map((p) => p.profileId)).toEqual(['u-joao'])
  })

  it('não muta a entrada (as pessoas originais continuam intactas)', () => {
    const snapshot = structuredClone(todos)

    filterAggregatedPeople(todos, { query: '', status: 'all', responsible: 'all', unit: 'ws-mo' })

    expect(todos).toEqual(snapshot)
    expect(joao.units).toHaveLength(3)
  })

  it('sem correspondência → lista vazia honesta', () => {
    const out = filterAggregatedPeople(todos, { query: 'zzz-inexistente', status: 'all', responsible: 'all', unit: 'all' })

    expect(out).toEqual([])
  })
})