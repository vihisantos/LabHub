import type { GeneralItem } from '../types'
import { createLocalService } from '../../../lib/storage'

const store = createLocalService<GeneralItem>('general_stock')

export const stockService = {
  getAll: () => store.getAll(),
  getById: (id: string) => store.getById(id),
  create: (data: Omit<GeneralItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    return store.create({
      ...data,
      createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
      updatedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    } as unknown as GeneralItem)
  },
  update: (id: string, data: Partial<GeneralItem>) => {
    return store.update(id, {
      ...data,
      updatedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    })
  },
  remove: (id: string) => store.remove(id),
}
