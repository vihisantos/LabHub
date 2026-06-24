import type { ActionLog, ActionType } from '../types/actionLog'
import { createLocalService } from '../../../lib/storage'

const store = createLocalService<ActionLog>('action_logs')

export const actionLogService = {
  getAll: () => store.getAll(),

  getByPC: (pcId: string) =>
    store.query((log) => log.pcId === pcId).sort((a, b) => b.timestamp.seconds - a.timestamp.seconds),

  log: (pcId: string, type: ActionType, description: string) => {
    return store.create({
      pcId,
      type,
      description,
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    } as unknown as ActionLog)
  },

  remove: (id: string) => store.remove(id),
}
