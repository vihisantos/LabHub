import { describe, it, expect, vi, beforeEach } from 'vitest'

const supabase = vi.hoisted(() => ({
  defaultDb: { rpc: vi.fn(), from: vi.fn() } as any,
}))

vi.mock('../../../lib/supabase', () => ({ defaultDb: supabase.defaultDb }))

import { getLeaderTeam, getLastTeamServiceError } from '../teamService'

const membershipRow = {
  id: 'membership-tech',
  profile_id: 'u-tech',
  workspace_id: 'ws1',
  role_id: 'role-x',
  status: 'active',
  managed_by: 'membership-lider',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function mockRpc(result: { data?: unknown; error?: { message: string } | null }) {
  supabase.defaultDb.rpc.mockResolvedValue(result)
}

function mockProfiles(result: { data?: unknown; error?: { message: string } | null }) {
  supabase.defaultDb.from.mockReturnValue({
    select: () => ({ in: vi.fn(async () => result) }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getLeaderTeam — leitura escopada via RPC (fail-closed)', () => {
  it('equipe populada: memberships + profiles unidos, role convertido', async () => {
    mockRpc({ data: [membershipRow], error: null })
    mockProfiles({
      data: [{ id: 'u-tech', name: 'Técnico A', email: 't@b.com', status: 'active', role: 'technician' }],
      error: null,
    })

    const team = await getLeaderTeam('ws1')

    expect(supabase.defaultDb.rpc).toHaveBeenCalledWith('get_leader_team', {
      p_workspace_id: 'ws1',
    })
    expect(team).toHaveLength(1)
    expect(team[0].membership.id).toBe('membership-tech')
    expect(team[0].profile).toMatchObject({
      id: 'u-tech',
      name: 'Técnico A',
      roleId: 'role-technician',
    })
    expect(getLastTeamServiceError()).toBeNull()
  })

  it('membro sem perfil resolvido → profile null (não quebra a lista)', async () => {
    mockRpc({ data: [membershipRow], error: null })
    mockProfiles({ data: [], error: null })
    const team = await getLeaderTeam('ws1')
    expect(team).toHaveLength(1)
    expect(team[0].profile).toBeNull()
  })

  it('RLS/USER escondendo o perfil → profile null (fail-closed, não inventa dados)', async () => {
    mockRpc({ data: [membershipRow], error: null })
    mockProfiles({ data: [], error: null })
    const team = await getLeaderTeam('ws1')
    expect(team[0].profile).toBeNull()
  })

  it('erro no RPC → [] (e sinaliza erro para a UI)', async () => {
    mockRpc({ data: null, error: { message: 'permission denied' } })
    const team = await getLeaderTeam('ws1')
    expect(team).toEqual([])
    expect(getLastTeamServiceError()).toBe('permission denied')
  })

  it('erro no fetch de profiles → [] (fail-closed, não mostra equipe incompleta)', async () => {
    mockRpc({ data: [membershipRow], error: null })
    mockProfiles({ data: null, error: { message: 'profiles denied' } })
    const team = await getLeaderTeam('ws1')
    expect(team).toEqual([])
    expect(getLastTeamServiceError()).toBe('profiles denied')
  })

  it('equipe vazia legítima → [] SEM erro (estado vazio, não falha)', async () => {
    mockRpc({ data: [], error: null })
    const team = await getLeaderTeam('ws1')
    expect(team).toEqual([])
    expect(getLastTeamServiceError()).toBeNull()
  })
})

describe('banco de dado não configurado (defesa)', () => {
  it('defaultDb null → [] fail-closed', async () => {
    const original = supabase.defaultDb
    supabase.defaultDb = null
    vi.resetModules()
    const fresh = await import('../teamService')
    try {
      expect(await fresh.getLeaderTeam('ws1')).toEqual([])
    } finally {
      supabase.defaultDb = original
    }
  })
})