import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPushUser } from '../buildPushUser'
import type { User } from '../../core/auth/types'
import type { Membership } from '../../core/permissions/membership'

vi.mock('../../core/permissions/service', () => ({
  permissionService: {
    getRoleForUser: () => ({ appAccess: { chamados: 'full' } }),
    resolveAppAccess: (_role: unknown, _user: unknown, appId: string) =>
      appId === 'chamados' ? 'full' : null,
  },
}))

vi.mock('../../appRegistry', () => ({
  appRegistry: [{ id: 'chamados' }, { id: 'stock' }],
}))

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'a@labhub.com',
    name: 'A',
    roleId: 'role-technician',
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

function membership(ws: string, status: Membership['status'] = 'active'): Membership {
  return {
    id: `m-${ws}`,
    profile_id: 'u-1',
    workspace_id: ws,
    role_id: 'r-a',
    status,
    managed_by: null,
    created_at: '',
    updated_at: '',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildPushUser — workspace_ids derivado de memberships (compat de payload)', () => {
  it('usa memberships ativas, nunca a coluna legada', () => {
    const payload = buildPushUser(
      makeUser({
        workspace_ids: ['ws-legado'],
        memberships: [membership('ws-1'), membership('ws-2')],
        membershipsLoaded: true,
      }),
    )
    expect(payload.workspace_ids?.sort()).toEqual(['ws-1', 'ws-2'])
  })

  it('suspensas/removidas ficam de fora (fail-closed)', () => {
    const payload = buildPushUser(
      makeUser({
        memberships: [membership('ws-1'), { ...membership('ws-2'), status: 'suspended' }],
        membershipsLoaded: true,
      }),
    )
    expect(payload.workspace_ids).toEqual(['ws-1'])
  })

  it('não carregado ⇒ [] (nunca legado)', () => {
    const payload = buildPushUser(
      makeUser({ memberships: undefined, membershipsLoaded: false, workspace_ids: ['ws-legado'] }),
    )
    expect(payload.workspace_ids).toEqual([])
  })
})