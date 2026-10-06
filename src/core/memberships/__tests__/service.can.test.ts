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
    expect(activeMembershipIn(rows, WS_B, 'u-1')?.workspace_id).toBe(WS_B)
  })

  it('ignora membership inativa da unidade', async () => {
    const { activeMembershipIn } = await loadService()
    const rows = [membership({ workspace_id: WS_A, status: 'suspended' })]
    expect(activeMembershipIn(rows, WS_A, 'u-1')).toBeUndefined()
  })

  it('undefined/vazio sem unidade ou sem dono => undefined', async () => {
    const { activeMembershipIn } = await loadService()
    expect(activeMembershipIn(undefined, WS_A, 'u-1')).toBeUndefined()
    expect(activeMembershipIn([membership()], null, 'u-1')).toBeUndefined()
    expect(activeMembershipIn([], WS_A, 'u-1')).toBeUndefined()
    // Sem profileId não há como garantir o dono ⇒ nada é resolvido.
    expect(activeMembershipIn([membership()], WS_A, undefined)).toBeUndefined()
    expect(activeMembershipIn([membership()], WS_A, null)).toBeUndefined()
  })

  it('NUNCA escolhe membership de outro usuário da mesma unidade (ordem irrelevante)', async () => {
    const { activeMembershipIn } = await loadService()
    const alheia = membership({ id: 'm-vis', profile_id: 'u-vis', role_id: 'role-vis' })
    const propria = membership({ id: 'm-tec', profile_id: 'u-1', role_id: 'role-tec' })

    const asOrdem = activeMembershipIn([alheia, propria], WS_A, 'u-1')
    const desOrdem = activeMembershipIn([propria, alheia], WS_A, 'u-1')

    expect(asOrdem?.profile_id).toBe('u-1')
    expect(asOrdem?.role_id).toBe('role-tec')
    expect(desOrdem?.profile_id).toBe('u-1')
    expect(desOrdem?.role_id).toBe('role-tec')
  })

  it('só existe membership alheia na unidade => undefined (fail-closed)', async () => {
    const { activeMembershipIn } = await loadService()
    const alheia = membership({ id: 'm-vis', profile_id: 'u-vis', role_id: 'role-vis' })
    expect(activeMembershipIn([alheia], WS_A, 'u-1')).toBeUndefined()
  })
})

/**
 * REGRESSÃO do bug "Começar Atendimento" invisível para o técnico.
 *
 * A RLS `memberships_select` é escopada por WORKSPACE: a coleção carregada
 * traz as memberships de TODOS os membros da unidade. Sem o filtro por
 * `profile_id`, o `.find()` pegava a primeira linha física e o usuário era
 * autorizado (ou bloqueado) pela role de outra pessoa — no caso real o técnico
 * `tec` foi resolvido como `vis` (0 Actions ⇒ `ticket.claim=false`).
 */
describe('regressão: cargo/Action vêm SEMPRE da membership do próprio usuário', () => {
  const ROLE_TEC = 'role-uuid-tec'
  const ROLE_VIS = 'role-uuid-vis'
  const USER_A = 'u-1'
  const USER_B = 'u-b-vis'
  const USER_C = 'u-c-opv'

  /** user-A é `tec`; as duas primeiras linhas são de outras pessoas (`vis`, `opv`). */
  function membershipsComAlheiasPrimeiro(): Membership[] {
    return [
      membership({ id: 'm-b', profile_id: USER_B, role_id: ROLE_VIS }),
      membership({ id: 'm-c', profile_id: USER_C, role_id: ROLE_ID }),
      membership({ id: 'm-a', profile_id: USER_A, role_id: ROLE_TEC }),
    ]
  }

  it("tec: can('ticket.claim') => true, consultando a PRÓPRIA role mesmo com membership vis de outro usuário antes", async () => {
    dbResult = { data: [{ id: 'rp-ticket-claim' }], error: null }
    const { membershipService } = await loadService()
    const u = user({ memberships: membershipsComAlheiasPrimeiro() } as Partial<User>)

    await expect(membershipService.can(u, 'ticket.claim', WS_A)).resolves.toBe(true)
    // A consulta usou a role do user-A (tec), nunca a role vis/alheia.
    expect(chain.filters.role_id).toBe(ROLE_TEC)
  })

  it('tec: o resultado é o mesmo qualquer que seja a ordem das linhas devolvidas', async () => {
    dbResult = { data: [{ id: 'rp-ticket-claim' }], error: null }
    const { membershipService } = await loadService()
    const proprias = membership({ id: 'm-a', profile_id: USER_A, role_id: ROLE_TEC })
    const alheia = membership({ id: 'm-b', profile_id: USER_B, role_id: ROLE_VIS })

    await expect(
      membershipService.can(user({ memberships: [alheia, proprias] } as Partial<User>), 'ticket.claim', WS_A),
    ).resolves.toBe(true)
    expect(chain.filters.role_id).toBe(ROLE_TEC)

    await expect(
      membershipService.can(user({ memberships: [proprias, alheia] } as Partial<User>), 'ticket.claim', WS_A),
    ).resolves.toBe(true)
    expect(chain.filters.role_id).toBe(ROLE_TEC)
  })

  it('vis: continua SEM ticket.claim mesmo existindo membership tec de outro usuário', async () => {
    // role_permissions não devolve nada para a role vis.
    dbResult = { data: [], error: null }
    const { membershipService } = await loadService()
    const u = user({
      id: USER_B,
      memberships: [
        membership({ id: 'm-b', profile_id: USER_B, role_id: ROLE_VIS }),
        membership({ id: 'm-a', profile_id: USER_A, role_id: ROLE_TEC }),
      ],
    } as Partial<User>)

    await expect(membershipService.can(u, 'ticket.claim', WS_A)).resolves.toBe(false)
    // Consultou a role vis (a do próprio usuário), não a tec alheia.
    expect(chain.filters.role_id).toBe(ROLE_VIS)
  })

  it('vis: mesmo que role_permissions tenha a linha, o dela não tem — e a role consultada é a própria', async () => {
    dbResult = { data: [{ id: 'rp-de-outra-role' }], error: null }
    const { membershipService } = await loadService()
    const u = user({
      id: USER_B,
      memberships: [
        membership({ id: 'm-a', profile_id: USER_A, role_id: ROLE_TEC }),
        membership({ id: 'm-b', profile_id: USER_B, role_id: ROLE_VIS }),
      ],
    } as Partial<User>)

    // A checagem é por role_id da membership própria: vis ⇒ role vis.
    await membershipService.can(u, 'ticket.claim', WS_A)
    expect(chain.filters.role_id).toBe(ROLE_VIS)
    expect(chain.filters.role_id).not.toBe(ROLE_TEC)
  })

  it('sem membership PRÓPRIA na unidade => false, sem sequer consultar role_permissions', async () => {
    dbResult = { data: [{ id: 'rp-ticket-claim' }], error: null }
    const { membershipService } = await loadService()
    const u = user({
      memberships: [membership({ id: 'm-a', profile_id: USER_A, role_id: ROLE_TEC })],
    } as Partial<User>)
    // Workspace consultado não é o da membership própria.
    const uEmOutraUnidade = user({
      memberships: [
        membership({ id: 'm-b', profile_id: USER_B, role_id: ROLE_VIS, workspace_id: WS_B }),
        membership({ id: 'm-a', profile_id: USER_A, role_id: ROLE_TEC, workspace_id: WS_B }),
      ],
    } as Partial<User>)

    await expect(membershipService.can(u, 'ticket.claim', 'ws-inexistente')).resolves.toBe(false)
    await expect(membershipService.can(uEmOutraUnidade, 'ticket.claim', WS_A)).resolves.toBe(false)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('super admin continua com bypass absoluto (nenhuma membership necessária)', async () => {
    const { membershipService } = await loadService()
    const admin = user({
      id: USER_A,
      is_super_admin: true,
      memberships: [membership({ id: 'm-b', profile_id: USER_B, role_id: ROLE_VIS })],
    } as Partial<User>)
    await expect(membershipService.can(admin, 'ticket.claim', WS_A)).resolves.toBe(true)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
