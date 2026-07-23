import type { ProblemTemplate, ProblemTemplateFormData } from '../types'
import { createSyncService } from '../../../lib/sync'
import { DEFAULT_PROBLEM_TEMPLATES } from '../types'

const service = createSyncService<ProblemTemplate>('problem_templates')

function serialize(data: ProblemTemplateFormData): ProblemTemplate {
  const now = new Date().toISOString()
  return { ...data, createdAt: now, updatedAt: now } as ProblemTemplate
}

export const problemTemplateService = {
  getAll: () => service.getAll(),

  getById: (id: string) => service.getById(id),

  create: (data: ProblemTemplateFormData) => {
    return service.create(serialize(data))
  },

  update: (id: string, data: Partial<ProblemTemplate>) => service.update(id, data),

  remove: (id: string) => service.remove(id),

  query: (predicate: (item: ProblemTemplate) => boolean) => service.query(predicate),

  getByAssetType: (assetType: string) => {
    return service.query((t) => t.assetType === assetType)
  },

  initDefaults: () => {
    const existing = service.getAll()
    if (existing.length > 0) return
    for (const template of DEFAULT_PROBLEM_TEMPLATES) {
      const now = new Date().toISOString()
      service.create({ ...template, createdAt: now, updatedAt: now })
    }
  },
}
