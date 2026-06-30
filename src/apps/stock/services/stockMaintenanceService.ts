import type { StockMaintenance, StockMaintenanceFormData } from '../types/maintenance'
import { createSyncService } from '../../../lib/sync'

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

  create: (data: StockMaintenanceFormData) => store.create(serialize(data)),

  update: (id: string, data: Partial<StockMaintenance>) =>
    store.update(id, { ...data, updatedAt: new Date().toISOString() }),

  remove: (id: string) => store.remove(id),
}
