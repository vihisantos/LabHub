import type { PartUsage } from '../types/partUsage'
import { createLocalService } from '../../../lib/storage'

const store = createLocalService<PartUsage>('part_usage')

export const partUsageService = {
  getAll: () => store.getAll(),

  getByPC: (pcId: string) =>
    store.query((u) => u.pcId === pcId).sort((a, b) => b.timestamp.seconds - a.timestamp.seconds),

  log: (partId: string, pcId: string, partName: string, quantity: number) =>
    store.create({
      partId,
      pcId,
      partName,
      quantity,
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    } as unknown as PartUsage),

  remove: (id: string) => store.remove(id),
}
