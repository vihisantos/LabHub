import type { Part, PartFormData } from '../types'
import { createSyncService } from '../../../lib/sync'

const service = createSyncService<Part>('parts')

function serialize(data: PartFormData) {
  const now = new Date().toISOString()
  return {
    ...data,
    createdAt: now,
    updatedAt: now,
  }
}

export const partService = {
  getAll: () => service.getAll(),

  getById: (id: string) => service.getById(id),

  create: (data: PartFormData) => {
    const part = serialize(data) as unknown as Part
    return service.create(part)
  },

  update: (id: string, data: Partial<Part>) => {
    const updated = service.update(id, {
      ...data,
      updatedAt: new Date().toISOString(),
    })
    return updated
  },

  remove: (id: string) => service.remove(id),

  query: (predicate: (part: Part) => boolean) => service.query(predicate),
}
