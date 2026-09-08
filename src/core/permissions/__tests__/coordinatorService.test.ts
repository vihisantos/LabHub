import { describe, it, expect, vi, beforeEach } from 'vitest'

const supabase = vi.hoisted(() => ({
  defaultDb: { rpc: vi.fn(), from: vi.fn() } as any,
}))

vi.mock('../../../lib/supabase', () => ({ defaultDb: supabase.defaultDb }))

import {
  getCoordinatorScope,
  setCoordinatorManager,
  getLastCoordinatorServiceError,
} from '../coordinatorService'
import type { Membership } from '../membership'

const row = (id: string, over: Partial<Membership> = {}): Membership => ({
  id,
  profile_id: `u-${id}`,
  workspace_id: 'ws1',
  role_id: 'role-x',
  status: 'active',
  managed_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
})

const coordWs1 = row('membership-coord-ws1', { workspace_id: 'ws1' })
const coordWs2 = row('membership-coord-ws2', { workspace_id: 'ws2' })
const lider = row('membership-lider', { managed_by: 'membership-coord-ws1' })
const m1 = row('membership-m1', { managed_by: 'membership-lider' })
const m2 = row('membership-m2', { managed_by: 'membership-lider' })

function mockRpc(
  plan: Record<
    string,
    (params: Record<string, unknown>) => { data?: unknown; error?: { message: string } | null }
  >,
) {
  supabase.defaultDb.rpc.mockImplementation((fn: string, params: Record<string, unknown>) => {
    const handler = plan[fn]
    if (!handler) return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } })
    return Promise.resolve(handler(params))
  })
}

let workspacesResult: { data?: unknown; error?: { message: string } | null }
let profilesResult: { data?: unknown; error?: { message: string } | null }

function mockFromPlan() {
  supabase.defaultDb.from.mockImplementation((table: string) => ({
    select: () => ({
      in: vi.fn(async () => {
        if (table === 'workspaces') return workspacesResult
        if (table === 'profiles') return profilesResult
        return { data: null, error: { message: `unexpected table ${table}` } }
      }),
    }),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  workspacesResult = { data: [], error: null }
  profilesResult = { data: [], error: null }
  mockFromPlan()
})

describe('getCoordinatorScope — escopo de coordenação via RPC (fail-closed)', () => {
  it('escopo completo: unidades → lideranças → equipes, com nomes reais', async () => {
    mockRpc({
      get_coordinator_units: () => ({ data: [coordWs1, coordWs2], error: null }),
      get_coordinator_leaders: (p) =>
        p.p_workspace_id === 'ws1'
          ? { data: [lider], error: null }
          : { data: [], error: null },
      get_memberships_by_manager: (p) =>
        p.p_manager_membership_id === 'membership-lider'
          ? { data: [m1, m2], error: null }
          : { data: [], error: null },
    })
    workspacesResult = {
      data: [
        { id: 'ws1', name: 'Campus A' },
        { id: 'ws2', name: 'Campus B' },
      ],
      error: null,
    }
    profilesResult = {
      data: [
        { id: 'u-membership-lider', name: 'Ana', email: 'ana@b.com', status: 'active', role: 'lider' },
        { id: 'u-membership-m1', name: 'Téc 1', email: 't1@b.com', status: 'active', role: 'technician' },
        { id: 'u-membership-m2', name: 'Téc 2', email: 't2@b.com', status: 'active', role: 'technician' },
      ],
      error: null,
    }

    const scope = await getCoordinatorScope()

    expect(supabase.defaultDb.rpc).toHaveBeenCalledWith('get_coordinator_units')
    expect(supabase.defaultDb.rpc).toHaveBeenCalledWith('get_coordinator_leaders', {
      p_workspace_id: 'ws1',
    })
    expect(supabase.defaultDb.rpc).toHaveBeenCalledWith('get_memberships_by_manager', {
      p_manager_membership_id: 'membership-lider',
    })
    expect(scope).toHaveLength(2)

    expect(scope[0].unitName).toBe('Campus A')
    expect(scope[0].coordination.id).toBe('membership-coord-ws1')
    expect(scope[0].leaders).toHaveLength(1)
    expect(scope[0].leaders[0].profile).toMatchObject({ name: 'Ana', roleId: 'role-lider' })
    expect(scope[0].leaders[0].members).toHaveLength(2)
    expect(scope[0].leaders[0].members[0].profile).toMatchObject({
      name: 'Téc 1',
      roleId: 'role-technician',
    })

    expect(scope[1].unitName).toBe('Campus B')
    expect(scope[1].leaders).toEqual([])
    expect(getLastCoordinatorServiceError()).toBeNull()
  })

  it('unidade invisível por RLS → fallback "Unidade" (não inventa nome)', async () => {
    mockRpc({
      get_coordinator_units: () => ({ data: [coordWs1], error: null }),
      get_coordinator_leaders: () => ({ data: [], error: null }),
    })
    workspacesResult = { data: [], error: null }

    const scope = await getCoordinatorScope()

    expect(scope).toHaveLength(1)
    expect(scope[0].unitName).toBe('Unidade')
    expect(getLastCoordinatorServiceError()).toBeNull()
  })

  it('liderança sem perfil visível → profile null (fail-closed)', async () => {
    mockRpc({
      get_coordinator_units: () => ({ data: [coordWs1], error: null }),
      get_coordinator_leaders: () => ({ data: [lider], error: null }),
      get_memberships_by_manager: () => ({ data: [m1], error: null }),
    })
    profilesResult = { data: [], error: null }

    const scope = await getCoordinatorScope()

    expect(scope[0].leaders[0].profile).toBeNull()
    expect(scope[0].leaders[0].members[0].profile).toBeNull()
    expect(getLastCoordinatorServiceError()).toBeNull()
  })

  it('erro no RPC de unidades → [] e erro sinalizado', async () => {
    mockRpc({
      get_coordinator_units: () => ({ data: null, error: { message: 'permission denied' } }),
    })
    const scope = await getCoordinatorScope()
    expect(scope).toEqual([])
    expect(getLastCoordinatorServiceError()).toBe('permission denied')
  })

  it('erro em qualquer RPC do escopo → [] (fail-closed, não mostra escopo incompleto)', async () => {
    mockRpc({
      get_coordinator_units: () => ({ data: [coordWs1], error: null }),
      get_coordinator_leaders: () => ({ data: null, error: { message: 'denied' } }),
    })
    const scope = await getCoordinatorScope()
    expect(scope).toEqual([])
    expect(getLastCoordinatorServiceError()).toBe('denied')
  })

  it('erro no fetch de profiles → [] (fail-closed)', async () => {
    mockRpc({
      get_coordinator_units: () => ({ data: [coordWs1], error: null }),
      get_coordinator_leaders: () => ({ data: [], error: null }),
    })
    profilesResult = { data: null, error: { message: 'profiles denied' } }
    const scope = await getCoordinatorScope()
    expect(scope).toEqual([])
    expect(getLastCoordinatorServiceError()).toBe('profiles denied')
  })

  it('escopo vazio legítimo (sem unidades) → [] SEM erro', async () => {
    mockRpc({ get_coordinator_units: () => ({ data: [], error: null }) })
    const scope = await getCoordinatorScope()
    expect(scope).toEqual([])
    expect(getLastCoordinatorServiceError()).toBeNull()
  })
})

describe('setCoordinatorManager — escrita escopada de managed_by (RPC)', () => {
  it('re-parenta a relação: chama o RPC com os dois parâmetros', async () => {
    supabase.defaultDb.rpc.mockResolvedValue({ data: null, error: null })

    const ok = await setCoordinatorManager('membership-m1', 'membership-lider')

    expect(ok).toBe(true)
    expect(supabase.defaultDb.rpc).toHaveBeenCalledWith('coordinator_set_manager', {
      p_membership_id: 'membership-m1',
      p_manager_id: 'membership-lider',
    })
    expect(getLastCoordinatorServiceError()).toBeNull()
  })

  it('NULL remove da equipe (managerId = null persistido como tal)', async () => {
    supabase.defaultDb.rpc.mockResolvedValue({ data: null, error: null })

    const ok = await setCoordinatorManager('membership-m1', null)

    expect(ok).toBe(true)
    expect(supabase.defaultDb.rpc).toHaveBeenCalledWith('coordinator_set_manager', {
      p_membership_id: 'membership-m1',
      p_manager_id: null,
    })
  })

  it('RPC negando → false + erro sinalizado', async () => {
    supabase.defaultDb.rpc.mockResolvedValue({
      data: null,
      error: { message: 'manager is outside the coordinator scope in this unit' },
    })

    const ok = await setCoordinatorManager('membership-m1', 'membership-other')

    expect(ok).toBe(false)
    expect(getLastCoordinatorServiceError()).toBe(
      'manager is outside the coordinator scope in this unit',
    )
  })
})

describe('banco de dado não configurado (defesa)', () => {
  it('defaultDb null → getCoordinatorScope [] fail-closed', async () => {
    const original = supabase.defaultDb
    supabase.defaultDb = null
    vi.resetModules()
    const fresh = await import('../coordinatorService')
    try {
      expect(await fresh.getCoordinatorScope()).toEqual([])
      expect(await fresh.setCoordinatorManager('x', null)).toBe(false)
    } finally {
      supabase.defaultDb = original
    }
  })
})