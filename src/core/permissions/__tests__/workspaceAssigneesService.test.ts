import { describe, it, expect, vi, beforeEach } from 'vitest'

const supabase = vi.hoisted(() => ({
  defaultDb: { from: vi.fn() } as any,
}))

vi.mock('../../../lib/supabase', () => ({ defaultDb: supabase.defaultDb }))

import { getWorkspaceAssignees } from '../workspaceAssigneesService'

const membershipRow = {
  id: 'membership-1',
  profile_id: 'u-tech',
  workspace_id: 'ws1',
  role_id: 'role-tec',
  status: 'active',
  managed_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

type Result = { data?: unknown; error?: { message: string } | null }

function mockQuery(result: Result) {
  return { then: (resolve: any) => resolve(result) }
}

/** Chain de `memberships`: select().eq().eq() */
function membershipsChain(result: Result) {
  return { select: () => ({ eq: () => ({ eq: () => mockQuery(result) }) }) }
}

/** Chain de `profiles`: select().in() */
function profilesChain(result: Result) {
  return { select: () => ({ in: () => mockQuery(result) }) }
}

/** Chain de `role_permissions`: select().in().eq().eq() */
function rolePermissionsChain(result: Result) {
  return {
    select: () => ({
      in: () => ({ eq: () => ({ eq: () => mockQuery(result) }) }),
    }),
  }
}

/** Chain de `membership_overrides`: select().in().eq() */
function membershipOverridesChain(result: Result) {
  return {
    select: () => ({
      in: () => ({ eq: () => mockQuery(result) }),
    }),
  }
}

/** Monta o `from` com as rotas por tabela (defaults fail-closed). */
function tableRouter(overrides: Partial<Record<string, Result>> = {}) {
  return (table: string) => {
    if (table === 'memberships') {
      return membershipsChain(overrides.memberships ?? { data: [membershipRow], error: null })
    }
    if (table === 'profiles') {
      return profilesChain(overrides.profiles ?? { data: [], error: null })
    }
    if (table === 'role_permissions') {
      return rolePermissionsChain(overrides.role_permissions ?? { data: [], error: null })
    }
    if (table === 'membership_overrides') {
      return membershipOverridesChain(overrides.membership_overrides ?? { data: [], error: null })
    }
    return mockQuery({ data: [], error: null })
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getWorkspaceAssignees — membros ativos e elegíveis (ticket.claim + overrides) via RLS', () => {
  it('retorna só membros ATIVOS e ELEGÍVEIS pela role base, ordenados por nome', async () => {
    const rows = [
      membershipRow, // u-tech, role-tec
      { ...membershipRow, id: 'm2', profile_id: 'u-view', role_id: 'role-view' },
    ]
    supabase.defaultDb.from.mockImplementation(
      tableRouter({
        memberships: { data: rows, error: null },
        profiles: {
          data: [
            { id: 'u-tech', name: 'Zeca Técnico', status: 'active', role: 'technician', is_super_admin: false },
            { id: 'u-view', name: 'Ana Leitora', status: 'active', role: 'viewer', is_super_admin: false },
          ],
          error: null,
        },
        // Só `role-tec` tem `ticket.claim` → u-view (viewer) fica de fora.
        role_permissions: { data: [{ role_id: 'role-tec' }], error: null },
      }),
    )

    const assignees = await getWorkspaceAssignees('ws1')

    expect(assignees.map((a) => a.name)).toEqual(['Zeca Técnico'])
    expect(assignees[0]).toMatchObject({ userId: 'u-tech', profileId: 'u-tech', roleId: 'role-technician' })
  })

  it('cargo SEM ticket.claim (ex.: cargo de gestão) fica de fora', async () => {
    supabase.defaultDb.from.mockImplementation(
      tableRouter({
        profiles: {
          data: [{ id: 'u-tech', name: 'Gestor', status: 'active', role: 'coordinator', is_super_admin: false }],
          error: null,
        },
        role_permissions: { data: [], error: null },
      }),
    )

    expect(await getWorkspaceAssignees('ws1')).toEqual([])
  })

  it('override de NEGAÇÃO exclui quem a role base concederia', async () => {
    supabase.defaultDb.from.mockImplementation(
      tableRouter({
        profiles: {
          data: [{ id: 'u-tech', name: 'Zeca', status: 'active', role: 'technician', is_super_admin: false }],
          error: null,
        },
        role_permissions: { data: [{ role_id: 'role-tec' }], error: null },
        membership_overrides: { data: [{ membership_id: 'membership-1', effect: 'deny' }], error: null },
      }),
    )

    expect(await getWorkspaceAssignees('ws1')).toEqual([])
  })

  it('override de CONCESSÃO inclui quem a role base negaria', async () => {
    supabase.defaultDb.from.mockImplementation(
      tableRouter({
        profiles: {
          data: [{ id: 'u-tech', name: 'Zeca', status: 'active', role: 'viewer', is_super_admin: false }],
          error: null,
        },
        // role base NÃO concede ticket.claim…
        role_permissions: { data: [], error: null },
        // …mas o override concede.
        membership_overrides: { data: [{ membership_id: 'membership-1', effect: 'allow' }], error: null },
      }),
    )

    const assignees = await getWorkspaceAssignees('ws1')

    expect(assignees.map((a) => a.name)).toEqual(['Zeca'])
  })

  it('super admin é elegível mesmo sem ticket.claim na role (bypass global)', async () => {
    supabase.defaultDb.from.mockImplementation(
      tableRouter({
        profiles: {
          data: [{ id: 'u-tech', name: 'Root', status: 'active', role: 'viewer', is_super_admin: true }],
          error: null,
        },
        role_permissions: { data: [], error: null },
      }),
    )

    const assignees = await getWorkspaceAssignees('ws1')

    expect(assignees.map((a) => a.name)).toEqual(['Root'])
  })

  it('perfis não ativos ficam de fora (mesmo com ticket.claim)', async () => {
    supabase.defaultDb.from.mockImplementation(
      tableRouter({
        profiles: {
          data: [{ id: 'u-tech', name: 'Zeca', status: 'pending', role: 'technician', is_super_admin: false }],
          error: null,
        },
        role_permissions: { data: [{ role_id: 'role-tec' }], error: null },
      }),
    )

    expect(await getWorkspaceAssignees('ws1')).toEqual([])
  })

  it('erro em memberships → [] (fail-closed, nunca lista errada)', async () => {
    supabase.defaultDb.from.mockImplementation(
      tableRouter({ memberships: { data: null, error: { message: 'denied' } } }),
    )

    expect(await getWorkspaceAssignees('ws1')).toEqual([])
  })

  it('erro em profiles → [] (fail-closed)', async () => {
    supabase.defaultDb.from.mockImplementation(
      tableRouter({ profiles: { data: null, error: { message: 'profiles denied' } } }),
    )

    expect(await getWorkspaceAssignees('ws1')).toEqual([])
  })

  it('erro em role_permissions → [] (fail-closed: sem prova de elegibilidade, sem lista)', async () => {
    supabase.defaultDb.from.mockImplementation(
      tableRouter({ role_permissions: { data: null, error: { message: 'perms denied' } } }),
    )

    expect(await getWorkspaceAssignees('ws1')).toEqual([])
  })

  it('erro em membership_overrides → [] (fail-closed: override não lido, sem lista)', async () => {
    supabase.defaultDb.from.mockImplementation(
      tableRouter({ membership_overrides: { data: null, error: { message: 'overrides denied' } } }),
    )

    expect(await getWorkspaceAssignees('ws1')).toEqual([])
  })

  it('sem membros ativos → [] (não consulta perfis nem permissões)', async () => {
    supabase.defaultDb.from.mockImplementation(
      tableRouter({ memberships: { data: [], error: null } }),
    )
    expect(await getWorkspaceAssignees('ws1')).toEqual([])
  })
})

describe('banco não configurado (defesa)', () => {
  it('defaultDb null → [] fail-closed', async () => {
    const original = supabase.defaultDb
    supabase.defaultDb = null
    vi.resetModules()
    const fresh = await import('../workspaceAssigneesService')
    try {
      expect(await fresh.getWorkspaceAssignees('ws1')).toEqual([])
    } finally {
      supabase.defaultDb = original
    }
  })
})
