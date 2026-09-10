import { describe, it, expect } from 'vitest'
import type { User } from '../../auth/types'
import type { Role } from '../types'
import {
  canManageTeam,
  canViewTeam,
  canViewTeamMember,
  dbRoleToRoleId,
  type TeamContext,
  type Membership,
  type TeamMember,
} from '../membership'

const liderRole = {
  id: 'role-lider',
  key: 'lider',
  name: 'Líder',
  description: '',
  appAccess: {},
  isDefault: false,
  isLeadership: true,
  leadershipLevel: 1,
} as Role

const coordinatorRole = {
  id: 'role-coordinator',
  key: 'coordinator',
  name: 'Coordenador',
  description: '',
  appAccess: {},
  isDefault: false,
  isLeadership: true,
  leadershipLevel: 2,
} as Role

const technicianRole = {
  id: 'role-technician',
  key: 'technician',
  name: 'Técnico',
  description: '',
  appAccess: {},
  isDefault: true,
} as Role

const liderUser = {
  id: 'u-lider',
  email: 'a@b.com',
  name: 'Líder',
  roleId: 'role-lider',
  status: 'active',
  workspace_ids: ['ws1'],
} as User

const strangerUser = {
  id: 'u-outro',
  email: 'c@d.com',
  name: 'Outro',
  roleId: 'role-lider',
  status: 'active',
  workspace_ids: ['ws2'],
} as User

const teamMember = {
  id: 'm-tech',
  profile: {
    id: 'u-tech',
    name: 'Técnico A',
    email: 't@b.com',
    status: 'active' as const,
    roleId: 'role-technician',
  },
  membership: {
    id: 'membership-tech',
    profile_id: 'u-tech',
    workspace_id: 'ws1',
    role_id: 'role-x',
    status: 'active',
    managed_by: 'membership-lider',
    created_at: '',
    updated_at: '',
  } as Membership,
} as TeamMember

function ctx(user: User | null, role: Role | undefined, team: TeamContext['team']): TeamContext {
  return { user, role, team }
}

describe('canViewTeam / canManageTeam (scope team é do CARGO)', () => {
  it('líder com cargo de equipe vê a área', () => {
    expect(canViewTeam(ctx(liderUser, liderRole, []))).toBe(true)
    expect(canManageTeam(ctx(liderUser, liderRole, []))).toBe(true)
  })

  it('coordenador (scope coordination) NÃO vê a área de equipe', () => {
    const coordUser = { ...liderUser, roleId: 'role-coordinator' }
    expect(canViewTeam(ctx(coordUser, coordinatorRole, []))).toBe(false)
    expect(canManageTeam(ctx(coordUser, coordinatorRole, []))).toBe(false)
  })

  it('executante NUNCA vê, mesmo com acesso full nos apps', () => {
    const techUser = { ...liderUser, roleId: 'role-technician', app_access: { chamados: 'full' as const } }
    expect(canViewTeam(ctx(techUser, technicianRole, []))).toBe(false)
  })

  it('super admin não vira líder por cargo (área é do cargo)', () => {
    const superUser = { ...liderUser, is_super_admin: true }
    expect(canViewTeam(ctx(superUser, undefined, []))).toBe(false)
  })

  it('sem usuário → nunca vê', () => {
    expect(canViewTeam(ctx(null, liderRole, []))).toBe(false)
  })

  it('cargo de liderança SEM o key canônico (custom) não cai no escopo team', () => {
    const customLeader = { ...liderRole, key: undefined }
    expect(canViewTeam(ctx(liderUser, customLeader, []))).toBe(false)
  })
})

describe('canViewTeamMember (membro do escopo OU self)', () => {
  it('líder vê membro da própria equipe', () => {
    expect(canViewTeamMember(ctx(liderUser, liderRole, [teamMember]), 'u-tech')).toBe(true)
  })

  it('líder vê a si mesmo mesmo fora da lista', () => {
    expect(canViewTeamMember(ctx(liderUser, liderRole, []), 'u-lider')).toBe(true)
  })

  it('líder NÃO vê membro de outra equipe (dado externo ao escopo)', () => {
    expect(canViewTeamMember(ctx(liderUser, liderRole, [teamMember]), strangerUser.id)).toBe(false)
  })

  it('executante NÃO vê ninguém', () => {
    const techUser = { ...liderUser, roleId: 'role-technician' }
    expect(canViewTeamMember(ctx(techUser, technicianRole, [teamMember]), 'u-tech')).toBe(false)
  })
})

describe('dbRoleToRoleId (mapeamento determinístico banco → frontend)', () => {
  it('mapeia valores canônicos', () => {
    expect(dbRoleToRoleId('lider')).toBe('role-lider')
    expect(dbRoleToRoleId('technician')).toBe('role-technician')
    expect(dbRoleToRoleId('coordinator')).toBe('role-coordinator')
    expect(dbRoleToRoleId('viewer')).toBe('role-viewer')
  })

  it('valor desconhecido → fail-closed role-<db> (frontend não reconhece)', () => {
    expect(dbRoleToRoleId('hacker')).toBe('role-hacker')
  })
})