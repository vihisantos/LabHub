import type { StockMovement, StockMovementFormData } from '../types'
import { createSyncService } from '../../../lib/sync'

const service = createSyncService<StockMovement>('stock_movements')

function serialize(data: StockMovementFormData): StockMovement {
  const now = new Date().toISOString()
  return { ...data, createdAt: now } as StockMovement
}

export const movementService = {
  getAll: () => service.getAll(),

  getById: (id: string) => service.getById(id),

  getByItem: (itemId: string) => service.query((m) => m.itemId === itemId),

  create: (data: StockMovementFormData) => {
    return service.create(serialize(data))
  },

  remove: (id: string) => service.remove(id),
}
