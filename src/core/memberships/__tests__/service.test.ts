import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isActive } from '../types'
import type { Membership, MembershipStatus, UserMembership } from '../types'
import type { User } from '../../auth/types'
import type { Workspace } from '../../workspaces/types'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('../../../lib/supabase', () => ({
  defaultDb: { from: mockFrom },
}))

// O supabase real é importado pelo setup global (mocks.ts). Para garantir que o
// mock acima seja aplicado, resetamos os módulos e importamos dinamicamente.
async function loadMembershipService() {
  vi.resetModules()
  const mod = await import('../service')
  return mod.membershipService
}

async function loadAreMembershipsEqual() {
  vi.resetModules()
  const mod = await import('../service')
  return mod.areMembershipsEqual
}

async function loadMembershipHelpers() {
  vi.resetModules()
  const mod = await import('../service')
  return {
    getActiveMembershipWorkspaceIds: mod.getActiveMembershipWorkspaceIds,
    isActiveMember: mod.isActiveMember,
  }
}

async function loadAttachMemberships() {
  vi.resetModules()
  const mod = await import('../service')
  return mod.attachMemberships
}

/** Objeto entãoável (resolve `{ data, error }`) como o spinner do supabase-js. */
function thenable<T>(json: T) {
  return { then: (resolve: (v: T) => void, reject: (e: unknown) => void) => Promise.resolve(json).then(resolve, reject) }
}

let dbResult: { data: unknown; error: unknown }
let lastQuery: { table?: string; selection?: string; column?: string; value?: unknown }

function mockDb() {
  mockFrom.mockImplementation((table: string) => ({
    select: (selection: string) => {
      lastQuery = { ...lastQuery, table, selection }
      return {
        ...thenable(dbResult),
        eq: (column: string, value: unknown) => {
          lastQuery = { ...lastQuery, table, selection, column, value }
          return { ...thenable(dbResult), maybeSingle: () => Promise.resolve(dbResult) }
        },
      }
    },
  }))
}

function makeMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: 'm-1',
    profile_id: 'u-1',
    workspace_id: 'ws-1',
    role_id: 'role-admin',
    status: 'active',
    managed_by: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  dbResult = { data: [], error: null }
  lastQuery = {}
  mockDb()
})

describe('isActive — única concessão de visibilidade/escopo', () => {
  it('aceita apenas status active', () => {
    expect(isActive(makeMembership({ status: 'active' }))).toBe(true)
    expect(isActive(makeMembership({ status: 'pending' }))).toBe(false)
    expect(isActive(makeMembership({ status: 'suspended' }))).toBe(false)
    expect(isActive(makeMembership({ status: 'removed' }))).toBe(false)
  })

  it('exporta o alinhamento de tipos esperado', () => {
    const m: UserMembership = makeMembership()
    const s: MembershipStatus = m.status
    const t: Membership = m
    expect(s).toBe('active')
    expect(t.workspace_id).toBe('ws-1')
  })
})

describe('membershipService.getMine', () => {
  it('retorna as memberships do usuário logado (RLS decide o que é exposto)', async () => {
    const service = await loadMembershipService()
    const rows = [makeMembership(), makeMembership({ id: 'm-2', workspace_id: 'ws-2' })]
    dbResult = { data: rows, error: null }

    const result = await service.getMine()

    expect(result).toEqual(rows)
    expect(lastQuery.table).toBe('memberships')
    expect(lastQuery.selection).toBe('*')
    // getMine NÃO filtra por userId — a RLS memberships_select restringe a linha; forjar
    // filtro aqui seria confiar no client, e o design manda ler com a política do token.
    expect(lastQuery.column).toBeUndefined()
  })

  it('falha de query ⇒ erro propagado (nunca [] silencioso)', async () => {
    const service = await loadMembershipService()
    dbResult = { data: null, error: { message: 'RLS: permission denied' } }
    await expect(service.getMine()).rejects.toMatchObject({ message: 'RLS: permission denied' })
  })
})

describe('membershipService.getActiveWorkspaceIds', () => {
  it('deriva os workspaces apenas de memberships ativas (fail-closed nos demais status)', async () => {
    const service = await loadMembershipService()
    const rows = [
      makeMembership({ workspace_id: 'ws-1', status: 'active' }),
      makeMembership({ id: 'm-2', workspace_id: 'ws-2', status: 'active' }),
      makeMembership({ id: 'm-3', workspace_id: 'ws-3', status: 'pending' }),
      makeMembership({ id: 'm-4', workspace_id: 'ws-4', status: 'suspended' }),
      makeMembership({ id: 'm-5', workspace_id: 'ws-5', status: 'removed' }),
    ]
    dbResult = { data: rows, error: null }

    const result = await service.getActiveWorkspaceIds()

    expect(result.sort()).toEqual(['ws-1', 'ws-2'])
  })
})

describe('membershipService.getByUser — só contexto administrativo (anti-IDOR por RLS)', () => {
  it('filtra por profile_id e retorna o que a RLS permitir', async () => {
    const service = await loadMembershipService()
    const rows = [makeMembership({ profile_id: 'u-2', workspace_id: 'ws-1' })]
    dbResult = { data: rows, error: null }

    const result = await service.getByUser('u-2')

    expect(result).toEqual(rows)
    expect(lastQuery.table).toBe('memberships')
    expect(lastQuery.column).toBe('profile_id')
    expect(lastQuery.value).toBe('u-2')
  })

  it('token sem privilégio recebe [] (RLS filtra) — nunca confia no userId informado', async () => {
    const service = await loadMembershipService()
    dbResult = { data: [], error: null }
    // Consulta "por outrem" de um usuário comum: a RLS do token retorna vazio.
    const result = await service.getByUser('u-outro')

    expect(result).toEqual([])
    expect(lastQuery.value).toBe('u-outro')
  })

  it('falha de query ⇒ erro propagado (chamador trata como não-carregado)', async () => {
    const service = await loadMembershipService()
    dbResult = { data: null, error: { message: 'denied' } }
    await expect(service.getByUser('u-1')).rejects.toMatchObject({ message: 'denied' })
  })
})

describe('membershipService.resolveRoleSlug — só ações/badges, nunca visibilidade', () => {
  it('resolve o slug do cargo pelo role_id', async () => {
    const service = await loadMembershipService()
    dbResult = { data: { slug: 'tec' }, error: null }

    const slug = await service.resolveRoleSlug('role-uuid-1')

    expect(slug).toBe('tec')
    expect(lastQuery.table).toBe('roles')
    expect(lastQuery.column).toBe('id')
  })

  it('cargo ausente ⇒ null (degrada ação/badge, não bloqueia workspace)', async () => {
    const service = await loadMembershipService()
    dbResult = { data: null, error: null }
    expect(await service.resolveRoleSlug('role-uuid-9')).toBeNull()
  })

  it('erro de RLS ⇒ null (fail-safe, nunca lança no caminho de decisão de visibilidade)', async () => {
    const service = await loadMembershipService()
    dbResult = { data: null, error: { message: 'denied' } }
    expect(await service.resolveRoleSlug('role-uuid-9')).toBeNull()
  })
})

describe('areMembershipsEqual — multiset das ativas (detecção de mudança do auth)', () => {
  const ws1 = { workspace_id: 'ws-1', role_id: 'r-a', status: 'active' as const }
  const ws2 = { workspace_id: 'ws-2', role_id: 'r-b', status: 'active' as const }

  it('só memberships ativas contam; ordem não importa', async () => {
    const equal = await loadAreMembershipsEqual()
    expect(equal([ws1, ws2], [ws2, ws1])).toBe(true)
  })

  it('ids da linha não importam — contam (workspace_id, role_id, status)', async () => {
    const equal = await loadAreMembershipsEqual()
    expect(equal([ws1], [{ workspace_id: 'ws-1', role_id: 'r-a', status: 'active' }, ...[]])).toBe(true)
  })

  it('concede/detecta remoção de workspace', async () => {
    const equal = await loadAreMembershipsEqual()
    expect(equal([ws1, ws2], [ws1])).toBe(false)
    expect(equal([ws1], [])).toBe(false)
    expect(equal([], [])).toBe(true)
  })

  it('suspensão/remoção tira o workspace do set ativo', async () => {
    const equal = await loadAreMembershipsEqual()
    expect(equal([ws1, ws2], [{ ...ws2, status: 'suspended' }])).toBe(false)
    expect(equal([ws1], [ws1, { workspace_id: 'ws-x', role_id: 'r-x', status: 'pending' as const }])).toBe(true)
  })

  it('troca de cargo muda o multiset ⇒ detectado', async () => {
    const equal = await loadAreMembershipsEqual()
    expect(equal([ws1], [{ workspace_id: 'ws-1', role_id: 'r-c', status: 'active' }])).toBe(false)
  })
})

describe('getActiveMembershipWorkspaceIds / isActiveMember — fonte do WorkspaceContext', () => {
  it('deriva workspaces só de memberships ativas; undefined ⇒ []', async () => {
    const { getActiveMembershipWorkspaceIds } = await loadMembershipHelpers()
    expect(
      getActiveMembershipWorkspaceIds([
        makeMembership({ workspace_id: 'ws-1', status: 'active' }),
        makeMembership({ id: 'm-2', workspace_id: 'ws-2', status: 'active' }),
        makeMembership({ id: 'm-3', workspace_id: 'ws-3', status: 'suspended' }),
        makeMembership({ id: 'm-4', workspace_id: 'ws-4', status: 'pending' }),
        makeMembership({ id: 'm-5', workspace_id: 'ws-5', status: 'removed' }),
      ]).sort(),
    ).toEqual(['ws-1', 'ws-2'])
    expect(getActiveMembershipWorkspaceIds(undefined)).toEqual([])
    expect(getActiveMembershipWorkspaceIds([])).toEqual([])
  })

  it('isActiveMember: só active concede; undefined ⇒ false', async () => {
    const { isActiveMember } = await loadMembershipHelpers()
    const rows = [
      makeMembership({ workspace_id: 'ws-1', status: 'active' }),
      makeMembership({ id: 'm-2', workspace_id: 'ws-2', status: 'suspended' }),
    ]
    expect(isActiveMember(rows, 'ws-1')).toBe(true)
    expect(isActiveMember(rows, 'ws-2')).toBe(false)
    expect(isActiveMember(rows, 'ws-9')).toBe(false)
    expect(isActiveMember(undefined, 'ws-1')).toBe(false)
  })
})

describe('attachMemberships — enriquecimento administrativo (getByUser por usuário)', () => {
  function userRow(id: string) {
    return { id, email: `${id}@x.com` }
  }

  it('anexa memberships com loaded=true; filtra por profile_id', async () => {
    const attach = await loadAttachMemberships()
    dbResult = {
      data: [makeMembership({ profile_id: 'u-1', workspace_id: 'ws-1' })],
      error: null,
    }

    const [enriched] = await attach([userRow('u-1')] as never[])

    expect(enriched.membershipsLoaded).toBe(true)
    expect(enriched.memberships).toHaveLength(1)
    expect(lastQuery.table).toBe('memberships')
    expect(lastQuery.column).toBe('profile_id')
    expect(lastQuery.value).toBe('u-1')
  })

  it('falha por usuário ⇒ loaded=false sem memberships (nunca [] silencioso)', async () => {
    const attach = await loadAttachMemberships()
    dbResult = { data: null, error: { message: 'denied' } }

    const [enriched] = await attach([userRow('u-1')] as never[])

    expect(enriched.membershipsLoaded).toBe(false)
    expect(enriched.memberships).toBeUndefined()
  })
})

describe('selectAssignedWorkspaces / assignedWorkspaceIds — fonte única §3.2', () => {
  const WS = [{ id: 'ws-1' }, { id: 'ws-2' }] as Workspace[]

  async function loadSelectors() {
    vi.resetModules()
    const mod = await import('../service')
    return {
      selectAssignedWorkspaces: mod.selectAssignedWorkspaces,
      assignedWorkspaceIds: mod.assignedWorkspaceIds,
    }
  }

  function userWith(overrides: Partial<User> = {}): User {
    return {
      id: 'u-1',
      email: 'a@labhub.com',
      name: 'A',
      roleId: 'role-viewer',
      status: 'active',
      is_super_admin: false,
      workspace_ids: [],
      memberships: [],
      membershipsLoaded: true,
      accent: 'blue',
      theme_variant: 'dark',
      created_at: '',
      updated_at: '',
      ...overrides,
    } as User
  }

  it('sem usuário ⇒ todos; pendente ⇒ nenhum; super admin ⇒ todos', async () => {
    const { selectAssignedWorkspaces } = await loadSelectors()
    expect(selectAssignedWorkspaces(WS, null).map((w) => w.id)).toEqual(['ws-1', 'ws-2'])
    expect(selectAssignedWorkspaces(WS, userWith({ status: 'pending' }))).toEqual([])
    expect(selectAssignedWorkspaces(WS, userWith({ is_super_admin: true }))).toHaveLength(2)
  })

  it('membro: só memberships ativas; não carregado ⇒ vazio (nunca workspace_ids)', async () => {
    const { selectAssignedWorkspaces, assignedWorkspaceIds } = await loadSelectors()
    const member = userWith({
      memberships: [
        makeMembership({ workspace_id: 'ws-1', status: 'active' }),
        makeMembership({ id: 'm-2', workspace_id: 'ws-2', status: 'suspended' }),
      ],
      workspace_ids: ['ws-2'],
    })
    expect(selectAssignedWorkspaces(WS, member).map((w) => w.id)).toEqual(['ws-1'])
    expect(assignedWorkspaceIds(member)).toEqual(['ws-1'])

    const notLoaded = userWith({ memberships: undefined, membershipsLoaded: false, workspace_ids: ['ws-1'] })
    expect(selectAssignedWorkspaces(WS, notLoaded)).toEqual([])
    expect(assignedWorkspaceIds(notLoaded)).toEqual([])
    expect(assignedWorkspaceIds(null)).toEqual([])
  })
})