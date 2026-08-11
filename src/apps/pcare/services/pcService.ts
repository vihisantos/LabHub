import type { PC } from '../types'
import { createSyncService } from '../../../lib/sync'
import { permissionService } from '../../../core/permissions/service'

const service = createSyncService<PC>('pcs')

export const pcService = {
  getAll: () => service.getAll(),

  getById: (id: string) => service.getById(id),

  create: (data: Omit<PC, 'id'>) => {
    permissionService.requireWrite('pc-care')
    return service.create(data)
  },

  update: (id: string, data: Partial<PC>) => {
    permissionService.requireWrite('pc-care')
    return service.update(id, data)
  },

  query: (predicate: (pc: PC) => boolean) => service.query(predicate),
}
