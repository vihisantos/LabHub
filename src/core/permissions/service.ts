import type { Role, Permission } from './types'
import { DEFAULT_ROLES } from './types'
import { createSyncService } from '../../lib/sync'

const service = createSyncService<Role>('roles')

function serialize(data: Omit<Role, 'id'>): Role {
  return { ...data, id: crypto.randomUUID() } as Role
}

export const permissionService = {
  getAll: () => service.getAll(),

  getById: (id: string) => service.getById(id),

  create: (data: Omit<Role, 'id'>) => {
    return service.create(serialize(data))
  },

  update: (id: string, data: Partial<Role>) => service.update(id, data),

  remove: (id: string) => service.remove(id),

  initDefaults: () => {
    const existing = service.getAll()
    if (existing.length > 0) return
    for (const role of DEFAULT_ROLES) {
      service.create(serialize(role))
    }
  },

  getDefaultRole: (): Role | undefined => {
    return service.query((r) => r.isDefault)[0]
  },

  hasPermission: (role: Role | undefined, permission: Permission): boolean => {
    if (!role) return false
    return role.permissions.includes(permission)
  },

  getRoleForUser: (userRole: string): Role | undefined => {
    return service.query((r) => r.name.toLowerCase().includes(userRole.toLowerCase()))[0]
  },
}
