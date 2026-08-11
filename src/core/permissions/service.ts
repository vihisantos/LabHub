import type { Role, RoleKey, AppAccessLevel, AppAccessOverride } from './types'
import { DEFAULT_ROLES, DEFAULT_ROLE_APPS } from './types'
import { createSyncService } from '../../lib/sync'
import { authService } from '../auth/service'

const service = createSyncService<Role>('roles')

function serialize(data: Omit<Role, 'id'>): Role {
  return { ...data, id: crypto.randomUUID() } as Role
}

function keyFor(role: { key?: string; name: string }): RoleKey {
  if (role.key && DEFAULT_ROLE_APPS[role.key as RoleKey]) return role.key as RoleKey
  const name = role.name.toLowerCase()
  if (name.includes('admin')) return 'admin'
  if (name.includes('téc') || name.includes('tec')) return 'technician'
  return 'viewer'
}

function defaultAccessFor(role: { key?: string; name: string }): Partial<Record<string, AppAccessLevel>> {
  const key = keyFor(role)
  if (DEFAULT_ROLE_APPS[key]) return { ...DEFAULT_ROLE_APPS[key] }
  const match = DEFAULT_ROLES.find((r) => r.key === key)
  return match ? { ...match.appAccess } : {}
}

export const permissionService = {
  getAll: () => service.getAll(),

  getById: (id: string) => service.getById(id),

  create: (data: Omit<Role, 'id'>) => {
    return service.create(serialize(data))
  },

  update: (id: string, data: Partial<Role>) => service.update(id, data),

  remove: (id: string) => service.remove(id),

  /** Garante que roles antigas (com permissões granulares) ganhem `key` e `appAccess` */
  migrate: () => {
    const existing = service.getAll()
    for (const role of existing) {
      const patch: Partial<Role> = {}
      if (!role.key) patch.key = keyFor(role)
      if (!role.appAccess || Object.keys(role.appAccess).length === 0) {
        patch.appAccess = defaultAccessFor(role)
      }
      if (Object.keys(patch).length > 0) service.update(role.id, patch)
    }
  },

  initDefaults: () => {
    const existing = service.getAll()
    if (existing.length === 0) {
      for (const role of DEFAULT_ROLES) {
        service.create(serialize(role))
      }
      return
    }
    permissionService.migrate()
  },

  getDefaultRole: (): Role | undefined => {
    return service.query((r) => r.isDefault)[0]
  },

  /**
   * Nível de acesso efetivo de um usuário a um app.
   * Override individual (user.app_access) vence o cargo.
   */
  resolveAppAccess: (
    role: Role | undefined,
    user: { app_access?: Partial<Record<string, AppAccessOverride>> } | null | undefined,
    appId: string,
  ): AppAccessLevel | null => {
    if (!user) return null
    const override = user.app_access?.[appId]
    if (override === 'none') return null
    if (override) return override
    if (!role) return null
    return role.appAccess?.[appId] ?? null
  },

  canAccessApp: (
    role: Role | undefined,
    user: { app_access?: Partial<Record<string, AppAccessOverride>> } | null | undefined,
    appId: string,
  ): boolean => {
    return permissionService.resolveAppAccess(role, user, appId) !== null
  },

  /**
   * Guarda imperativa de escrita (defesa em profundidade).
   * Só nível 'full' permite modificar dados do app.
   */
  canWriteApp: (appId: string): boolean => {
    const user = authService.getCurrentUser()
    if (!user) return false
    if (user.role === 'admin' || user.is_super_admin) return true
    const role = permissionService.getRoleForUser(user.role)
    return permissionService.resolveAppAccess(role, user, appId) === 'full'
  },

  /** Lança erro se o usuário atual não puder escrever no app. */
  requireWrite: (appId: string): void => {
    if (!permissionService.canWriteApp(appId)) {
      throw new Error('Permissão insuficiente: seu acesso a este módulo é somente leitura.')
    }
  },

  getRoleForUser: (userRole: string): Role | undefined => {
    const byKey = service.query((r) => r.key === userRole)[0]
    if (byKey) return byKey
    return service.query((r) => r.name.toLowerCase().includes(userRole.toLowerCase()))[0]
  },
}
