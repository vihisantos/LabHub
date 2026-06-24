import type { Part, PartFormData } from '../types'
import { createLocalService } from '../../../lib/storage'

const service = createLocalService<Part>('parts')

function serialize(data: PartFormData) {
  const now = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any
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
      updatedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    })
    return updated
  },

  remove: (id: string) => service.remove(id),

  query: (predicate: (part: Part) => boolean) => service.query(predicate),
}
