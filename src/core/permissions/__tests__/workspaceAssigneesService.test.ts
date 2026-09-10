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
  role_id: 'role-x',
  status: 'active',
  managed_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function mockQuery(result: { data?: unknown; error?: { message: string } | null }) {
  return { then: (resolve: any) => resolve(result) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getWorkspaceAssignees — membros ativos do workspace via RLS (fail-closed)', () => {
  it('retorna membros ativos, deduplica por perfil e ordena por nome', async () => {
    const rows = [membershipRow, { ...membershipRow, id: 'm2', profile_id: 'u-view', role_id: 'role-y' }]
    supabase.defaultDb.from.mockImplementation((table: string) => {
      if (table === 'memberships') {
        return { select: () => ({ eq: () => ({ eq: () => mockQuery({ data: rows, error: null }) }) }) }
      }
      return {
        select: () => ({
          in: () =>
            mockQuery({
              data: [
                { id: 'u-tech', name: 'Zeca Técnico', status: 'active', role: 'technician' },
                { id: 'u-view', name: 'Ana Leitora', status: 'active', role: 'viewer' },
              ],
              error: null,
            }),
        }),
      }
    })

    const assignees = await getWorkspaceAssignees('ws1')

    expect(assignees.map((a) => a.name)).toEqual(['Ana Leitora', 'Zeca Técnico'])
    expect(assignees[1]).toMatchObject({ userId: 'u-tech', profileId: 'u-tech', roleId: 'role-technician' })
  })

  it('perfis não ativos ficam de fora', async () => {
    supabase.defaultDb.from.mockImplementation((table: string) => {
      if (table === 'memberships') {
        return { select: () => ({ eq: () => ({ eq: () => mockQuery({ data: [membershipRow], error: null }) }) }) }
      }
      return {
        select: () => ({ in: () => mockQuery({ data: [{ id: 'u-tech', name: 'Zeca', status: 'pending', role: 'technician' }], error: null }) }),
      }
    })

    const assignees = await getWorkspaceAssignees('ws1')
    expect(assignees).toEqual([])
  })

  it('erro em memberships → [] (fail-closed, nunca lista errada)', async () => {
    supabase.defaultDb.from.mockImplementation(() => ({
      select: () => ({ eq: () => ({ eq: () => mockQuery({ data: null, error: { message: 'denied' } }) }) }),
    }))

    const assignees = await getWorkspaceAssignees('ws1')
    expect(assignees).toEqual([])
  })

  it('erro em profiles → [] (fail-closed)', async () => {
    supabase.defaultDb.from.mockImplementation((table: string) => {
      if (table === 'memberships') {
        return { select: () => ({ eq: () => ({ eq: () => mockQuery({ data: [membershipRow], error: null }) }) }) }
      }
      return { select: () => ({ in: () => mockQuery({ data: null, error: { message: 'profiles denied' } }) }) }
    })

    const assignees = await getWorkspaceAssignees('ws1')
    expect(assignees).toEqual([])
  })

  it('senza membros ativos → []', async () => {
    supabase.defaultDb.from.mockImplementation(() => ({
      select: () => ({ eq: () => ({ eq: () => mockQuery({ data: [], error: null }) }) }),
    }))
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