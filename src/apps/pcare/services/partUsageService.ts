import type { PartUsage } from '../types/partUsage'
import { createSyncService } from '../../../lib/sync'

const store = createSyncService<PartUsage>('part_usage')

export const partUsageService = {
  getAll: () => store.getAll(),

  getByPC: (pcId: string) =>
    store.query((u) => u.pcId === pcId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),

  getByPartId: (partId: string) =>
    store.query((u) => u.partId === partId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),

  log: (partId: string, pcId: string, partName: string, quantity: number) =>
    store.create({
      partId,
      pcId,
      partName,
      quantity,
      timestamp: new Date().toISOString(),
    } as unknown as PartUsage),

  remove: (id: string) => store.remove(id),
}
