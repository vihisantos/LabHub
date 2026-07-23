import type { AuditLog, AuditLogFormData, LogAction } from './types'
import { createSyncService } from '../../lib/sync'

const service = createSyncService<AuditLog>('audit_logs')

function serialize(data: AuditLogFormData): AuditLog {
  return {
    ...data,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  }
}

export const logService = {
  getAll: () => service.getAll().sort((a, b) => b.timestamp.localeCompare(a.timestamp)),

  getById: (id: string) => service.getById(id),

  getByEntity: (entity: string, entityId: string) =>
    service.query((l) => l.entity === entity && l.entityId === entityId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),

  getByUser: (userId: string) =>
    service.query((l) => l.userId === userId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),

  getByAction: (action: LogAction) =>
    service.query((l) => l.action === action)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),

  log: (data: AuditLogFormData) => {
    return service.create(serialize(data))
  },

  remove: (id: string) => service.remove(id),

  clearAll: () => {
    const all = service.getAll()
    for (const log of all) {
      service.remove(log.id)
    }
  },
}
