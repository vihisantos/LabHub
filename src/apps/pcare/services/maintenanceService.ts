import type { ScheduledMaintenance, MaintenanceFormData } from '../types/maintenance'
import { createLocalService } from '../../../lib/storage'

const store = createLocalService<ScheduledMaintenance>('maintenance')

function serialize(data: MaintenanceFormData) {
  const now = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any
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
      .sort((a, b) => a.scheduledDate.seconds - b.scheduledDate.seconds),

  create: (data: MaintenanceFormData) => {
    const entry = serialize(data) as unknown as ScheduledMaintenance
    return store.create(entry)
  },

  update: (id: string, data: Partial<ScheduledMaintenance>) => {
    return store.update(id, {
      ...data,
      updatedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    })
  },

  remove: (id: string) => store.remove(id),
}
