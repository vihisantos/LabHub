import type { PC, PCFormData } from '../types'
import { createLocalService } from '../../../lib/storage'

const service = createLocalService<PC>('pcs')

function serializeTimestamps(data: PCFormData) {
  return {
    ...data,
    partsReplaced: data.partsReplaced.map((p) => ({
      ...p,
      replacedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    })),
    photos: [],
    lastIntervention: null,
    createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    updatedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
  }
}

export const pcService = {
  getAll: () => service.getAll(),

  getById: (id: string) => service.getById(id),

  create: (data: PCFormData) => {
    const pc = serializeTimestamps(data) as unknown as PC
    return service.create(pc)
  },

  update: (id: string, data: Partial<PC>) => service.update(id, data),

  remove: (id: string) => service.remove(id),

  query: (predicate: (pc: PC) => boolean) => service.query(predicate),
}
