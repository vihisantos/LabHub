import type { ActionLog, ActionType } from '../types/actionLog'
import { createSyncService } from '../../../lib/sync'

const store = createSyncService<ActionLog>('action_logs')

export const actionLogService = {
  getAll: () => store.getAll(),

  getByPC: (pcId: string) =>
    store.query((log) => log.pcId === pcId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),

  log: (pcId: string, type: ActionType, description: string) => {
    return store.create({
      pcId,
      type,
      description,
      timestamp: new Date().toISOString(),
    } as unknown as ActionLog)
  },

  remove: (id: string) => store.remove(id),
}
