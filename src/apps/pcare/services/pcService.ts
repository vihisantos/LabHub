import type { PC } from '../types'
import { createSyncService } from '../../../lib/sync'

const service = createSyncService<PC>('pcs')

export const pcService = {
  getAll: () => service.getAll(),

  getById: (id: string) => service.getById(id),

  update: (id: string, data: Partial<PC>) => service.update(id, data),

  query: (predicate: (pc: PC) => boolean) => service.query(predicate),
}
