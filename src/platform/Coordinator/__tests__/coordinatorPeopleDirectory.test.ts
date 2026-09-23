import { describe, it, expect } from 'vitest'
import {
  composePeopleRows,
  filterPeopleRows,
  peopleStatusLabel,
} from '../coordinatorHelpers'
import type {
  CoordinatorInactiveMember,
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