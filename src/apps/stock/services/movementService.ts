import type { StockMovement, StockMovementFormData } from '../types'
import { createSyncService } from '../../../lib/sync'
import { permissionService } from '../../../core/permissions/service'

const service = createSyncService<StockMovement>('stock_movements')

function serialize(data: StockMovementFormData): StockMovement {
  const now = new Date().toISOString()
  return { ...data, createdAt: now } as StockMovement
}

export const movementService = {
  getAll: () => service.getAll().filter((m) => !m.deletedAt),

  getById: (id: string) => {
    const m = service.getById(id)
    return m && !m.deletedAt ? m : undefined
  },

  getByItem: (itemId: string) =>
    service.query((m) => m.itemId === itemId && !m.deletedAt),

  create: (data: StockMovementFormData) => {
    permissionService.requireWrite('stock')
    return service.create(serialize(data))
  },

  update: (id: string, data: Partial<StockMovement>) => {
    permissionService.requireWrite('stock')
    const existing = service.getById(id)
    if (!existing || existing.deletedAt) return undefined
    const updated = service.update(id, { ...data, id: existing.id, createdAt: existing.createdAt })
    return updated
  },

  remove: (id: string) => {
    permissionService.requireWrite('stock')
    const existing = service.getById(id)
    if (!existing || existing.deletedAt) return false
    service.update(id, { ...existing, deletedAt: new Date().toISOString() })
    return true
  },
}
