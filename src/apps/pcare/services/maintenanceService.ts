import type { ScheduledMaintenance, MaintenanceFormData } from '../types/maintenance'
import { createSyncService } from '../../../lib/sync'
import { permissionService } from '../../../core/permissions/service'

const store = createSyncService<ScheduledMaintenance>('maintenance')

function serialize(data: MaintenanceFormData) {
  const now = new Date().toISOString()
  return {
    ...data,
    completed: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

export const maintenanceService = {
  getAll: () => store.getAll(),

  getById: (id: string) => store.getById(id),

  getByPC: (pcId: string) => store.query((m) => m.pcId === pcId),

  getUpcoming: () =>
    store
      .query((m) => !m.completed)
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()),

  create: (data: MaintenanceFormData) => {
    permissionService.requireWrite('pc-care')
    const entry = serialize(data) as unknown as ScheduledMaintenance
    return store.create(entry)
  },

  update: (id: string, data: Partial<ScheduledMaintenance>) => {
    permissionService.requireWrite('pc-care')
    return store.update(id, {
      ...data,
      updatedAt: new Date().toISOString(),
    })
  },

  remove: (id: string) => {
    permissionService.requireWrite('pc-care')
    return store.remove(id)
  },
}
