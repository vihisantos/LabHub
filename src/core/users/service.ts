import type { UserProfile, UserProfileFormData } from './types'
import { createSyncService } from '../../lib/sync'

const service = createSyncService<UserProfile>('user_profiles')

function serialize(data: UserProfileFormData): UserProfile {
  const now = new Date().toISOString()
  return { ...data, createdAt: now, updatedAt: now } as UserProfile
}

export const userService = {
  getAll: () => service.getAll().filter((u) => u.active),

  getById: (id: string) => service.getById(id),

  getByUserId: (userId: string) => service.query((u) => u.userId === userId)[0],

  create: (data: UserProfileFormData) => {
    return service.create(serialize(data))
  },

  update: (id: string, data: Partial<UserProfile>) => {
    return service.update(id, { ...data, updatedAt: new Date().toISOString() })
  },

  deactivate: (id: string) => {
    return service.update(id, { active: false, updatedAt: new Date().toISOString() })
  },

  remove: (id: string) => service.remove(id),

  query: (predicate: (item: UserProfile) => boolean) => service.query(predicate),

  getByRole: (role: string) => service.query((u) => u.role === role && u.active),

  getByDepartment: (department: string) => service.query((u) => u.department === department && u.active),
}
