import type { InventoryCycle, InventoryCycleFormData, InventoryCount } from '../types'
import { createSyncService } from '../../../lib/sync'

const cycleService = createSyncService<InventoryCycle>('inventory_cycles')
const countService = createSyncService<InventoryCount>('inventory_counts')

function serializeCycle(data: InventoryCycleFormData): InventoryCycle {
  const now = new Date().toISOString()
  return {
    ...data,
    id: crypto.randomUUID(),
    status: 'in_progress',
    verifiedCount: 0,
    missingCount: 0,
    damagedCount: 0,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

export const inventoryService = {
  getCycles: () => cycleService.getAll().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),

  getCycle: (id: string) => cycleService.getById(id),

  createCycle: (data: InventoryCycleFormData) => cycleService.create(serializeCycle(data)),

  completeCycle: (id: string, stats: { verifiedCount: number; missingCount: number; damagedCount: number }) => {
    const now = new Date().toISOString()
    return cycleService.update(id, {
      status: 'completed',
      completedAt: now,
      updatedAt: now,
      ...stats,
    })
  },

  removeCycle: (id: string) => cycleService.remove(id),

  getCounts: (cycleId: string) => countService.query((c) => c.cycleId === cycleId),

  saveCount: (data: InventoryCount) => {
    const existing = countService.query((c) => c.cycleId === data.cycleId && c.itemId === data.itemId)
    if (existing.length > 0) {
      countService.update(existing[0].id, data)
    } else {
      countService.create(data)
    }
  },
}
