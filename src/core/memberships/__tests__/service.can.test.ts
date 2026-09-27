import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Membership } from '../types'
import type { User } from '../../auth/types'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('../../../lib/supabase', () => ({
  defaultDb: { from: mockFrom },
}))

async function loadService() {
  vi.resetModules()
  const mod = await import('../service')
  return { membershipService: mod.membershipService, activeMembershipIn: mod.activeMembershipIn }
}

/** Thenable no estilo supabase-js, encadeável com eq/limit. */
function thenable<T>(json: T) {
  return {
    then: (resolve: (v: T) => void, reject: (e: unknown) => void) =>
      Promise.resolve(json).then(resolve, reject),
  }
}

let dbResult: { data: unknown; error: unknown }
let chain: {
  table?: string
  selection?: string
  filters: Record<string, unknown>
  limit?: number
}
let throwOnBuild = false

function mockDb() {
  mockFrom.mockImplementation((table: string) => ({
    select: (selection: string) => {
      chain = { table, selection, filters: {} }
      const node: Record<string, unknown> = {
        ...thenable(dbResult),
        eq: (column: string, value: unknown) => {
          chain.filters[column] = value
          return node
        },
        limit: (n: number) => {
          chain.limit = n
          if (throwOnBuild) throw new Error('boom')
          return node
        },
      }
      return node
    },
  }))
}

const WS_A = 'ws-a'
const WS_B = 'ws-b'
const ROLE_ID = 'role-uuid-opv'

function membership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: 'm-1',
    profile_id: 'u-1',
    workspace_id: WS_A,
    role_id: ROLE_ID,
    status: 'active',
    managed_by: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'u@x.com',
    name: 'U',
    roleId: 'role-viewer',
    status: 'active',
    is_super_admin: false,
    workspace_ids: [WS_A, WS_B],
    memberships: [membership()],
    membershipsLoaded: true,
    ...overrides,
  } as unknown as User
}

beforeEach(() => {
  vi.clearAllMocks()
  dbResult = { data: [{ id: 'rp-1' }], error: null }
  chain = { filters: {} }
  throwOnBuild = false
  mockDb()
})

describe('membershipService.can — RBAC 2.0 por Action', () => {
  it('Caso 5 — membership ativa + role com a Action => true', async () => {
    const { membershipService } = await loadService()
    await expect(membershipService.can(user(), 'tv.manage', WS_A)).resolves.toBe(true)
  })

  it('consulta role_permissions com role/action/scope corretos (sessão do usuário)', async () => {
    const { membershipService } = await loadService()
    await membershipService.can(user(), 'tv.manage', WS_A)
    expect(chain.table).toBe('role_permissions')
    expect(chain.filters.role_id).toBe(ROLE_ID)
    expect(chain.filters.action).toBe('tv.manage')
    expect(chain.filters.scope).toBe('workspace')
  })

  it('Caso 1 — usuário sem membership => false (sem tocar o banco)', async () => {
    const { membershipService } = await loadService()
    const u = user({ memberships: [], membershipsLoaded: true } as Partial<User>)
    await expect(membershipService.can(u, 'tv.manage', WS_A)).resolves.toBe(false)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('Caso 1b — membershipsLoaded !== true => false (fail-closed, sem fallback)', async () => {
    const { membershipService } = await loadService()
    const u = user({ membershipsLoaded: false } as Partial<User>)
    await expect(membershipService.can(u, 'tv.manage', WS_A)).resolves.toBe(false)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('Caso 1c — memberships undefined => false', async () => {
    const { membershipService } = await loadService()
    const u = user({ memberships: undefined, membershipsLoaded: true } as Partial<User>)
    await expect(membershipService.can(u, 'tv.manage', WS_A)).resolves.toBe(false)
  })

  it('Caso 2 — membership suspensa/pending/removed => false', async () => {
    const { membershipService } = await loadService()
    for (const status of ['suspended', 'pending', 'removed'] as const) {
      const u = user({ memberships: [membership({ status })] } as Partial<User>)
      await expect(membershipService.can(u, 'tv.manage', WS_A)).resolves.toBe(false)
      mockFrom.mockClear()
    }
  })

  it('Caso 3 e 8 — membership em OUTRA unidade não autoriza a unidade consultada', async () => {
    const { membershipService } = await loadService()
    const u = user({ memberships: [membership({ workspace_id: WS_B })] } as Partial<User>)
    // A Action existe no banco, mas é da membership de WS_B.
    await expect(membershipService.can(u, 'tv.manage', WS_A)).resolves.toBe(false)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('Caso 8 — a MESMA Action é resolvida quando se consulta a unidade correta', async () => {
    const { membershipService } = await loadService()
    const u = user({ memberships: [membership({ workspace_id: WS_B })] } as Partial<User>)
    await expect(membershipService.can(u, 'tv.manage', WS_B)).resolves.toBe(true)
  })

  it('Caso 4 — membership ativa, role SEM a Action => false', async () => {
    dbResult = { data: [], error: null }
    const { membershipService } = await loadService()
    await expect(membershipService.can(user(), 'admin.app.purge', WS_A)).resolves.toBe(false)
  })

  it('Caso 4b — data null sem erro => false (fail-closed)', async () => {
    dbResult = { data: null, error: null }
    const { membershipService } = await loadService()
    await expect(membershipService.can(user(), 'tv.manage', WS_A)).resolves.toBe(false)
  })

  it('Caso 6 — Super Admin => true SEM membership e SEM consultar role_permissions', async () => {
    const { membershipService } = await loadService()
    const u = user({
      is_super_admin: true,
      memberships: [],
      membershipsLoaded: false,
    } as Partial<User>)
    await expect(membershipService.can(u, 'tv.manage', null)).resolves.toBe(true)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('Caso 7 — erro na consulta => false (nunca vira allow)', async () => {
    dbResult = { data: null, error: { message: 'permission denied' } }
    const { membershipService } = await loadService()
    await expect(membershipService.can(user(), 'tv.manage', WS_A)).resolves.toBe(false)
  })

  it('Caso 7b — exceção na construção da query => false', async () => {
    throwOnBuild = true
    const { membershipService } = await loadService()
    await expect(membershipService.can(user(), 'tv.manage', WS_A)).resolves.toBe(false)
  })

  it('usuário null/undefined => false', async () => {
    const { membershipService } = await loadService()
    await expect(membershipService.can(null, 'tv.manage', WS_A)).resolves.toBe(false)
    await expect(membershipService.can(undefined, 'tv.manage', WS_A)).resolves.toBe(false)
  })

  it('workspaceId ausente/vazio => false (Action com escopo workspace exige contexto)', async () => {
    const { membershipService } = await loadService()
    await expect(membershipService.can(user(), 'tv.manage', null)).resolves.toBe(false)
    await expect(membershipService.can(user(), 'tv.manage', '')).resolves.toBe(false)
  })

  it('action vazia/branco => false', async () => {
    const { membershipService } = await loadService()
    await expect(membershipService.can(user(), '', WS_A)).resolves.toBe(false)
    await expect(membershipService.can(user(), '   ', WS_A)).resolves.toBe(false)
  })

  it('membership sem role_id => false', async () => {
    const { membershipService } = await loadService()
    const u = user({ memberships: [membership({ role_id: '' })] } as Partial<User>)
    await expect(membershipService.can(u, 'tv.manage', WS_A)).resolves.toBe(false)
  })
})

describe('activeMembershipIn', () => {
  it('devolve a membership ativa da unidade', async () => {
    const { activeMembershipIn } = await loadService()
    const rows = [membership({ workspace_id: WS_A }), membership({ workspace_id: WS_B })]
    expect(activeMembershipIn(rows, WS_B)?.workspace_id).toBe(WS_B)
  })

  it('ignora membership inativa da unidade', async () => {
    const { activeMembershipIn } = await loadService()
    const rows = [membership({ workspace_id: WS_A, status: 'suspended' })]
    expect(activeMembershipIn(rows, WS_A)).toBeUndefined()
  })

  it('undefined/vazio sem unidade => undefined', async () => {
    const { activeMembershipIn } = await loadService()
    expect(activeMembershipIn(undefined, WS_A)).toBeUndefined()
    expect(activeMembershipIn([membership()], null)).toBeUndefined()
    expect(activeMembershipIn([], WS_A)).toBeUndefined()
  })
})
