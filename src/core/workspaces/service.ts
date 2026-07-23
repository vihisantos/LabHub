import type { Workspace, WorkspaceFormData } from './types'
import { createSyncService } from '../../lib/sync'

const service = createSyncService<Workspace>('workspaces')

function serialize(data: WorkspaceFormData): Workspace {
  const now = new Date().toISOString()
  return { ...data, createdAt: now, updatedAt: now } as Workspace
}

export const workspaceService = {
  getAll: () => service.getAll(),

  getById: (id: string) => service.getById(id),

  getBySlug: (slug: string) => service.query((w) => w.slug === slug)[0],

  create: (data: WorkspaceFormData) => {
    return service.create(serialize(data))
  },

  update: (id: string, data: Partial<Workspace>) => service.update(id, data),

  remove: (id: string) => service.remove(id),

  initDefault: () => {
    const existing = service.getAll()
    if (existing.length > 0) return existing[0]
    return service.create(serialize({
      name: 'Anhembi Piracicaba',
      slug: 'piracicaba',
      location: 'Piracicaba, SP',
    }))
  },
}
