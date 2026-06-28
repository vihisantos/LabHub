import type { PC, PCFormData } from '../types'
import { createSyncService } from '../../../lib/sync'

const service = createSyncService<PC>('pcs')

function serializeTimestamps(data: PCFormData) {
  const now = new Date().toISOString()
  return {
    ...data,
    partsReplaced: data.partsReplaced.map((p) => ({
      ...p,
      replacedAt: now,
    })),
    photos: [],
    lastIntervention: null,
    createdAt: now,
    updatedAt: now,
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
