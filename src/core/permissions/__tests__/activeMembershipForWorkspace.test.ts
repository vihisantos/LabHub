import { describe, expect, it } from 'vitest'
import { activeMembershipForWorkspace } from '../useActiveWorkspaceRole'
import type { User } from '../../auth/types'

const baseUser = {
  id: 'u-1',
  status: 'active',
  membershipsLoaded: true,
  memberships: [
    { id: 'm-other', profile_id: 'u-2', workspace_id: 'ws-a', role_id: 'role-other', status: 'active' },
    { id: 'm-suspended', profile_id: 'u-1', workspace_id: 'ws-a', role_id: 'role-old', status: 'suspended' },
    { id: 'm-active', profile_id: 'u-1', workspace_id: 'ws-a', role_id: 'role-tech', status: 'active' },
  ],
} as unknown as User

describe('activeMembershipForWorkspace', () => {
  it('seleciona somente a membership ativa do próprio usuário no workspace atual', () => {
    expect(activeMembershipForWorkspace(baseUser, 'ws-a')?.id).toBe('m-active')
  })

  it('falha fechado para workspace diferente', () => {
    expect(activeMembershipForWorkspace(baseUser, 'ws-b')).toBeNull()
  })

  it('falha fechado antes de carregar memberships', () => {
    expect(activeMembershipForWorkspace({ ...baseUser, membershipsLoaded: false }, 'ws-a')).toBeNull()
  })

  it('não usa roleId legado do perfil para conceder cargo', () => {
    expect(activeMembershipForWorkspace({
      ...baseUser,
      memberships: [],
      roleId: 'role-technician',
    }, 'ws-a')).toBeNull()
  })

  it('super admin não é tratado como técnico por cargo de membership', () => {
    expect(activeMembershipForWorkspace({ ...baseUser, is_super_admin: true }, 'ws-a')).toBeNull()
  })
})
