import type { Room, RoomFormData } from '../types'
import { createSyncService } from '../../../lib/sync'
import { permissionService } from '../../../core/permissions/service'

const service = createSyncService<Room>('rooms')

function serialize(data: RoomFormData): Room {
  const now = new Date().toISOString()
  return { ...data, createdAt: now, updatedAt: now } as Room
}

export const roomService = {
  getAll: () => service.getAll(),

  getById: (id: string) => service.getById(id),

  create: (data: RoomFormData) => {
    permissionService.requireWrite('chamados')
    return service.create(serialize(data))
  },

  update: (id: string, data: Partial<Room>) => {
    permissionService.requireWrite('chamados')
    return service.update(id, data)
  },

  remove: (id: string) => {
    permissionService.requireWrite('chamados')
    return service.remove(id)
  },

  query: (predicate: (item: Room) => boolean) => service.query(predicate),
}
