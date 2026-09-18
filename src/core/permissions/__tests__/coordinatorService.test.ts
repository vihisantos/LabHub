import { describe, it, expect, vi, beforeEach } from 'vitest'

const supabase = vi.hoisted(() => ({
  defaultDb: { rpc: vi.fn(), from: vi.fn() } as any,
}))

vi.mock('../../../lib/supabase', () => ({ defaultDb: supabase.defaultDb }))

import {
  getCoordinatorScope,
  getCoordinatorRequests,
  getCoordinatorInactiveMembers,
  getCoordinatorAssignableRoles,
  getCoordinatorUnitOverview,
  setCoordinatorManager,
  approveCoordinatorMembership,
  rejectCoordinatorMembership,
  suspendCoordinatorMembership,
  restoreCoordinatorMembership,
  removeCoordinatorMembership,
  setCoordinatorRole,
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
let rolesResult: { data?: unknown; error?: { message: string } | null }

function mockFromPlan() {
  supabase.defaultDb.from.mockImplementation((table: string) => ({
    select: () => ({
      in: vi.fn(async () => {
        if (table === 'workspaces') return workspacesResult
        if (table === 'profiles') return profilesResult
        if (table === 'roles') return rolesResult
        return { data: null, error: { message: `unexpected table ${table}` } }
      }),
    }),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  workspacesResult = { data: [], error: null }
  profilesResult = { data: [], error: null }
  rolesResult = { data: [], error: null }
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

const projRow = (
  id: string,
  status: Membership['status'],
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  membership_id: `ms-${id}`,
  profile_id: `u-${id}`,
  workspace_id: 'ws1',
  role_id: 'role-x',
  status,
  managed_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  profile_name: 'Novo',
  profile_email: 'novo@b.com',
  profile_status: 'active',
  profile_role: 'technician',
  ...over,
})

describe('getCoordinatorRequests — solicitações pendentes (RPC 065/066, fail-closed)', () => {
  it('mapeia a projeção (membership + perfil) SEM SELECT direto em profiles', async () => {
    mockRpc({
      coordinator_get_requests: () => ({ data: [projRow('pend', 'pending')], error: null }),
    })

    const requests = await getCoordinatorRequests('ws1')

    expect(supabase.defaultDb.rpc).toHaveBeenCalledWith('coordinator_get_requests', {
      p_workspace_id: 'ws1',
    })
    expect(supabase.defaultDb.from).not.toHaveBeenCalled()
    expect(requests).toHaveLength(1)
    expect(requests[0].membership).toMatchObject({
      id: 'ms-pend',
      profile_id: 'u-pend',
      status: 'pending',
    })
    expect(requests[0].profile).toMatchObject({
      id: 'u-pend',
      name: 'Novo',
      email: 'novo@b.com',
      status: 'active',
      roleId: 'role-technician',
    })
    expect(getLastCoordinatorServiceError()).toBeNull()
  })

  it('sem solicitações → [] sem erro', async () => {
    mockRpc({ coordinator_get_requests: () => ({ data: [], error: null }) })
    const requests = await getCoordinatorRequests('ws1')
    expect(requests).toEqual([])
    expect(getLastCoordinatorServiceError()).toBeNull()
  })

  it('projeção sem perfil (profile_name null) → profile null (não inventa)', async () => {
    mockRpc({
      coordinator_get_requests: () => ({
        data: [projRow('pend', 'pending', { profile_name: null, profile_email: null })],
        error: null,
      }),
    })
    const requests = await getCoordinatorRequests('ws1')
    expect(requests[0].profile).toBeNull()
  })

  it('profile_status não-ativo é normalizado para pending', async () => {
    mockRpc({
      coordinator_get_requests: () => ({
        data: [projRow('pend', 'pending', { profile_status: 'inactive' })],
        error: null,
      }),
    })
    const requests = await getCoordinatorRequests('ws1')
    expect(requests[0].profile?.status).toBe('pending')
  })

  it('RPC negando (fora do escopo) → [] + erro', async () => {
    mockRpc({
      coordinator_get_requests: () => ({ data: null, error: { message: 'permission denied' } }),
    })
    const requests = await getCoordinatorRequests('ws1')
    expect(requests).toEqual([])
    expect(getLastCoordinatorServiceError()).toBe('permission denied')
  })
})

describe('getCoordinatorInactiveMembers — suspended/removed (RPC 066, fail-closed)', () => {
  it('mapeia suspensos e removidos pela projeção, sem SELECT direto em profiles', async () => {
    mockRpc({
      coordinator_get_inactive_members: () => ({
        data: [
          projRow('sus', 'suspended'),
          projRow('rem', 'removed', {
            profile_name: 'Antigo',
            profile_email: 'antigo@b.com',
            profile_role: 'viewer',
          }),
        ],
        error: null,
      }),
    })

    const members = await getCoordinatorInactiveMembers('ws1')

    expect(supabase.defaultDb.rpc).toHaveBeenCalledWith('coordinator_get_inactive_members', {
      p_workspace_id: 'ws1',
    })
    expect(supabase.defaultDb.from).not.toHaveBeenCalled()
    expect(members.map((m) => m.membership.status)).toEqual(['suspended', 'removed'])
    expect(members[1].profile).toMatchObject({
      name: 'Antigo',
      email: 'antigo@b.com',
      roleId: 'role-viewer',
    })
    expect(getLastCoordinatorServiceError()).toBeNull()
  })

  it('sem membros inativos → [] sem erro', async () => {
    mockRpc({ coordinator_get_inactive_members: () => ({ data: [], error: null }) })
    const members = await getCoordinatorInactiveMembers('ws1')
    expect(members).toEqual([])
    expect(getLastCoordinatorServiceError()).toBeNull()
  })

  it('RPC negando (fora do escopo) → [] + erro', async () => {
    mockRpc({
      coordinator_get_inactive_members: () => ({
        data: null,
        error: { message: 'not a coordinator of this unit' },
      }),
    })
    const members = await getCoordinatorInactiveMembers('ws1')
    expect(members).toEqual([])
    expect(getLastCoordinatorServiceError()).toBe('not a coordinator of this unit')
  })
})

describe('getCoordinatorAssignableRoles — cargos atribuíveis (RLS roles, fail-closed)', () => {
  it('retorna apenas os slugs permitidos, na ordem canônica, com id e nome', async () => {
    rolesResult = {
      data: [
        { id: 'r-lider', slug: 'lider', name: 'Líder' },
        { id: 'r-adm', slug: 'adm', name: 'Admin de Workspace' },
        { id: 'r-tec', slug: 'tec', name: 'Técnico' },
        { id: 'r-opv', slug: 'opv', name: 'Operador TV' },
        { id: 'r-vis', slug: 'vis', name: 'Visualizador' },
        { id: 'r-est', slug: 'est', name: 'Gestor de Estoque' },
      ],
      error: null,
    }

    const options = await getCoordinatorAssignableRoles()

    expect(options.map((o) => o.slug)).toEqual(['tec', 'vis', 'est', 'opv', 'lider'])
    expect(options[0]).toEqual({ id: 'r-tec', slug: 'tec', name: 'Técnico' })
    expect(options.map((o) => o.slug)).not.toContain('adm')
    expect(options.map((o) => o.slug)).not.toContain('coordinator')
    expect(supabase.defaultDb.from).toHaveBeenCalledWith('roles')
    expect(getLastCoordinatorServiceError()).toBeNull()
  })

  it('slug permitido ausente na tabela é omitido (não inventa)', async () => {
    rolesResult = { data: [{ id: 'r-tec', slug: 'tec', name: 'Técnico' }], error: null }

    const options = await getCoordinatorAssignableRoles()

    expect(options.map((o) => o.slug)).toEqual(['tec'])
  })

  it('erro na leitura de roles → [] + erro sinalizado', async () => {
    rolesResult = { data: null, error: { message: 'roles denied' } }

    const options = await getCoordinatorAssignableRoles()

    expect(options).toEqual([])
    expect(getLastCoordinatorServiceError()).toBe('roles denied')
  })
})

describe('ciclo de vida do coordenador — RPCs de escrita (065)', () => {
  const cases: Array<[string, (id: string) => Promise<boolean>, string]> = [
    ['approve', approveCoordinatorMembership, 'coordinator_approve_membership'],
    ['reject', rejectCoordinatorMembership, 'coordinator_reject_membership'],
    ['suspend', suspendCoordinatorMembership, 'coordinator_suspend_membership'],
    ['restore', restoreCoordinatorMembership, 'coordinator_restore_membership'],
    ['remove', removeCoordinatorMembership, 'coordinator_remove_membership'],
  ]

  it.each(cases)('%s chama o RPC com p_membership_id e retorna true', async (_n, fn, rpcName) => {
    supabase.defaultDb.rpc.mockResolvedValue({ data: null, error: null })
    const ok = await fn('membership-x')
    expect(ok).toBe(true)
    expect(supabase.defaultDb.rpc).toHaveBeenCalledWith(rpcName, {
      p_membership_id: 'membership-x',
    })
    expect(getLastCoordinatorServiceError()).toBeNull()
  })

  it.each(cases)('%s propaga negação do servidor → false + erro', async (_n, fn, rpcName) => {
    supabase.defaultDb.rpc.mockResolvedValue({
      data: null,
      error: { message: 'only an active coordinator of this unit can act' },
    })
    const ok = await fn('membership-x')
    expect(ok).toBe(false)
    expect(supabase.defaultDb.rpc).toHaveBeenCalledWith(rpcName, {
      p_membership_id: 'membership-x',
    })
    expect(getLastCoordinatorServiceError()).toBe(
      'only an active coordinator of this unit can act',
    )
  })

  it('setCoordinatorRole envia p_role_slug do cargo permitido', async () => {
    supabase.defaultDb.rpc.mockResolvedValue({ data: null, error: null })
    const ok = await setCoordinatorRole('membership-x', 'lider')
    expect(ok).toBe(true)
    expect(supabase.defaultDb.rpc).toHaveBeenCalledWith('coordinator_set_role', {
      p_membership_id: 'membership-x',
      p_role_slug: 'lider',
    })
  })
})

describe('getCoordinatorUnitOverview — visão da unidade (RPC 070, READ-ONLY)', () => {
  const overviewData = {
    workspace: { id: 'ws1', name: 'Campus A' },
    tickets: { open: 2, in_progress: 3, unassigned: 4, high_priority: 2, urgent: 1 },
    recent: [
      {
        id: 'tk-1',
        ticketNumber: 7,
        roomName: 'Sala 101',
        problemCategory: 'Imprensa',
        status: 'em_atendimento',
        priority: 'alta',
        assignedToUserId: '',
        createdAt: '2026-01-11T00:00:00Z',
        updatedAt: '2026-01-11T00:00:00Z',
      },
    ],
  }

  it('chama a RPC com p_workspace_id e devolve a visão sem inventar nada', async () => {
    supabase.defaultDb.rpc.mockResolvedValue({ data: overviewData, error: null })

    const result = await getCoordinatorUnitOverview('ws1')

    expect(supabase.defaultDb.rpc).toHaveBeenCalledWith('get_coordinator_unit_overview', {
      p_workspace_id: 'ws1',
    })
    expect(result?.tickets).toEqual({
      open: 2,
      in_progress: 3,
      unassigned: 4,
      high_priority: 2,
      urgent: 1,
    })
    expect(result?.recent?.[0].ticketNumber).toBe(7)
    expect(getLastCoordinatorServiceError()).toBeNull()
  })

  it('RPC negando (fora do escopo) → null + erro sinalizado (nunca zeros falsos)', async () => {
    supabase.defaultDb.rpc.mockResolvedValue({
      data: null,
      error: { message: 'only an active coordinator of this unit can view its overview' },
    })

    const result = await getCoordinatorUnitOverview('ws1')

    expect(result).toBeNull()
    expect(getLastCoordinatorServiceError()).toBe(
      'only an active coordinator of this unit can view its overview',
    )
  })

  it('erro de consulta propaga como erro (não vira zeros)', async () => {
    supabase.defaultDb.rpc.mockResolvedValue({
      data: null,
      error: { message: 'relation "chamados_tickets" does not exist' },
    })

    const result = await getCoordinatorUnitOverview('ws1')

    expect(result).toBeNull()
    expect(getLastCoordinatorServiceError()).toContain('does not exist')
  })
})

describe('banco de dado não configurado (defesa)', () => {
  it('defaultDb null → funções fail-closed', async () => {
    vi.resetModules()
    vi.doMock('../../../lib/supabase', () => ({ defaultDb: null }))
    try {
      const fresh = await import('../coordinatorService')
      expect(await fresh.getCoordinatorScope()).toEqual([])
      expect(await fresh.getCoordinatorRequests('ws1')).toEqual([])
      expect(await fresh.getCoordinatorInactiveMembers('ws1')).toEqual([])
      expect(await fresh.getCoordinatorAssignableRoles()).toEqual([])
      expect(await fresh.getCoordinatorUnitOverview('ws1')).toBeNull()
      expect(await fresh.setCoordinatorManager('x', null)).toBe(false)
      expect(await fresh.approveCoordinatorMembership('x')).toBe(false)
      expect(await fresh.setCoordinatorRole('x', 'tec')).toBe(false)
    } finally {
      vi.doUnmock('../../../lib/supabase')
      vi.resetModules()
    }
  })
})