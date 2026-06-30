import type { Kit, KitFormData } from '../types'
import { createSyncService } from '../../../lib/sync'

const service = createSyncService<Kit>('stock_kits')

function serialize(data: KitFormData): Kit {
  const now = new Date().toISOString()
  return { ...data, lastChecked: null, status: 'nao_conferido', createdAt: now, updatedAt: now } as Kit
}

export const kitService = {
  getAll: () => service.getAll(),

  getById: (id: string) => service.getById(id),

  create: (data: KitFormData) => {
    return service.create(serialize(data))
  },

  update: (id: string, data: Partial<Kit>) => service.update(id, data),

  remove: (id: string) => service.remove(id),

  query: (predicate: (item: Kit) => boolean) => service.query(predicate),
}
