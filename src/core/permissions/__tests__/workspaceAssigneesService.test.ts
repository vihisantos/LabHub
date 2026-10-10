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

function mockQuery(result: { data?: unknown; error?: { message: string } | null }) {
  return { then: (resolve: any) => resolve(result) }
}

/** Chain de `memberships`: select().eq().eq() */
function membershipsChain(result: { data?: unknown; error?: { message: string } | null }) {
  return { select: () => ({ eq: () => ({ eq: () => mockQuery(result) }) }) }
}

/** Chain de `profiles`: select().in() */
function profilesChain(result: { data?: unknown; error?: { message: string } | null }) {
  return { select: () => ({ in: () => mockQuery(result) }) }
}

/** Chain de `role_permissions`: select().in().eq().eq() */
function rolePermissionsChain(result: { data?: unknown; error?: { message: string } | null }) {
  return {
    select: () => ({
      in: () => ({ eq: () => ({ eq: () => mockQuery(result) }) }),
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getWorkspaceAssignees — membros ativos e elegíveis (ticket.claim) via RLS', () => {
  it('retorna só membros ATIVOS e ELEGÍVEIS (ticket.claim), ordenados por nome', async () => {
    const rows = [
      membershipRow, // u-tech, role-tec
      { ...membershipRow, id: 'm2', profile_id: 'u-view', role_id: 'role-view' },
    ]
    supabase.defaultDb.from.mockImplementation((table: string) => {
      if (table === 'memberships') return membershipsChain({ data: rows, error: null })
      if (table === 'profiles') {
        return profilesChain({
          data: [
            { id: 'u-tech', name: 'Zeca Técnico', status: 'active', role: 'technician' },
            { id: 'u-view', name: 'Ana Leitora', status: 'active', role: 'viewer' },
          ],
          error: null,
        })
      }
      // Só `role-tec` tem `ticket.claim` → u-view (viewer) fica de fora.
      return rolePermissionsChain({ data: [{ role_id: 'role-tec' }], error: null })
    })

    const assignees = await getWorkspaceAssignees('ws1')

    expect(assignees.map((a) => a.name)).toEqual(['Zeca Técnico'])
    expect(assignees[0]).toMatchObject({ userId: 'u-tech', profileId: 'u-tech', roleId: 'role-technician' })
  })

  it('cargo SEM ticket.claim (ex.: cargo de gestão) fica de fora', async () => {
    supabase.defaultDb.from.mockImplementation((table: string) => {
      if (table === 'memberships') return membershipsChain({ data: [membershipRow], error: null })
      if (table === 'profiles') {
        return profilesChain({
          data: [{ id: 'u-tech', name: 'Gestor', status: 'active', role: 'coordinator' }],
          error: null,
        })
      }
      return rolePermissionsChain({ data: [], error: null })
    })

    expect(await getWorkspaceAssignees('ws1')).toEqual([])
  })

  it('perfis não ativos ficam de fora (mesmo com ticket.claim)', async () => {
    supabase.defaultDb.from.mockImplementation((table: string) => {
      if (table === 'memberships') return membershipsChain({ data: [membershipRow], error: null })
      if (table === 'profiles') {
        return profilesChain({
          data: [{ id: 'u-tech', name: 'Zeca', status: 'pending', role: 'technician' }],
          error: null,
        })
      }
      return rolePermissionsChain({ data: [{ role_id: 'role-tec' }], error: null })
    })

    expect(await getWorkspaceAssignees('ws1')).toEqual([])
  })

  it('erro em memberships → [] (fail-closed, nunca lista errada)', async () => {
    supabase.defaultDb.from.mockImplementation(() =>
      membershipsChain({ data: null, error: { message: 'denied' } }),
    )

    expect(await getWorkspaceAssignees('ws1')).toEqual([])
  })

  it('erro em profiles → [] (fail-closed)', async () => {
    supabase.defaultDb.from.mockImplementation((table: string) => {
      if (table === 'memberships') return membershipsChain({ data: [membershipRow], error: null })
      return profilesChain({ data: null, error: { message: 'profiles denied' } })
    })

    expect(await getWorkspaceAssignees('ws1')).toEqual([])
  })

  it('erro em role_permissions → [] (fail-closed: sem prova de elegibilidade, sem lista)', async () => {
    supabase.defaultDb.from.mockImplementation((table: string) => {
      if (table === 'memberships') return membershipsChain({ data: [membershipRow], error: null })
      if (table === 'profiles') {
        return profilesChain({
          data: [{ id: 'u-tech', name: 'Zeca', status: 'active', role: 'technician' }],
          error: null,
        })
      }
      return rolePermissionsChain({ data: null, error: { message: 'perms denied' } })
    })

    expect(await getWorkspaceAssignees('ws1')).toEqual([])
  })

  it('sem membros ativos → [] (não consulta perfis nem permissões)', async () => {
    supabase.defaultDb.from.mockImplementation(() => membershipsChain({ data: [], error: null }))
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
