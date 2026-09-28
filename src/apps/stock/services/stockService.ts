import type { StockItem, StockItemFormData } from '../types'
import { createSyncService } from '../../../lib/sync'

const service = createSyncService<StockItem>('stock_items')

function serialize(data: StockItemFormData): StockItem {
  const now = new Date().toISOString()
  return { ...data, createdAt: now, updatedAt: now } as StockItem
}

export const stockService = {
  getAll: () => service.getAll(),

  // Sem filtro de workspace — usado pelo fluxo público de chamados, onde o
  // professor precisa ver equipamentos de todos os campi.
  getAllUnfiltered: () => service.getAll(true),

  getById: (id: string) => service.getById(id),

  create: (data: StockItemFormData) => {
    return service.create(serialize(data))
  },

  update: (id: string, data: Partial<StockItem>) => {
    return service.update(id, data)
  },

  remove: (id: string) => {
    return service.remove(id)
  },

  query: (predicate: (item: StockItem) => boolean) => service.query(predicate),
}
