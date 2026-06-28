import type { StockItem, StockItemFormData } from '../types'
import { createSyncService } from '../../../lib/sync'

const service = createSyncService<StockItem>('stock_items')

function serialize(data: StockItemFormData): StockItem {
  const now = new Date().toISOString()
  return { ...data, createdAt: now, updatedAt: now } as StockItem
}

export const stockService = {
  getAll: () => service.getAll(),

  getById: (id: string) => service.getById(id),

  create: (data: StockItemFormData) => {
    return service.create(serialize(data))
  },

  update: (id: string, data: Partial<StockItem>) => service.update(id, data),

  remove: (id: string) => service.remove(id),

  query: (predicate: (item: StockItem) => boolean) => service.query(predicate),
}
