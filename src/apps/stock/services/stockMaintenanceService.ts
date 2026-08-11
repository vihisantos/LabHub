import type { StockMaintenance, StockMaintenanceFormData } from '../types/maintenance'
import { createSyncService } from '../../../lib/sync'
import { permissionService } from '../../../core/permissions/service'

const store = createSyncService<StockMaintenance>('stock_maintenance')

function serialize(data: StockMaintenanceFormData): Omit<StockMaintenance, 'id'> {
  const now = new Date().toISOString()
  return {
    ...data,
    completed: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

export const stockMaintenanceService = {
  getAll: () => store.getAll(),

  getById: (id: string) => store.getById(id),

  getByItem: (itemId: string) => store.query((m) => m.itemId === itemId),

  getUpcoming: () =>
    store
      .query((m) => !m.completed)
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()),

  getOverdue: () =>
    store
      .query((m) => !m.completed && new Date(m.scheduledDate).getTime() < Date.now())
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()),

  create: (data: StockMaintenanceFormData) => {
    permissionService.requireWrite('stock')
    return store.create(serialize(data))
  },

  update: (id: string, data: Partial<StockMaintenance>) => {
    permissionService.requireWrite('stock')
    return store.update(id, { ...data, updatedAt: new Date().toISOString() })
  },

  remove: (id: string) => {
    permissionService.requireWrite('stock')
    return store.remove(id)
  },
}
