import type { ChecklistTemplate, ChecklistTemplateForm, PCChecklist } from '../types/checklist'
import { createSyncService } from '../../../lib/sync'

const templateStore = createSyncService<ChecklistTemplate>('checklist_templates')
const pcChecklistStore = createSyncService<PCChecklist>('pc_checklists')

function serialize<T>(data: T) {
  const now = new Date().toISOString()
  return { ...data, createdAt: now, updatedAt: now }
}

export const checklistTemplateService = {
  getAll: () => templateStore.getAll(),
  getById: (id: string) => templateStore.getById(id),
  create: (data: ChecklistTemplateForm) => {
    const template = serialize(data) as unknown as ChecklistTemplate
    return templateStore.create(template)
  },
  update: (id: string, data: Partial<ChecklistTemplate>) => {
    return templateStore.update(id, {
      ...data,
      updatedAt: new Date().toISOString(),
    })
  },
  remove: (id: string) => templateStore.remove(id),
  getByLab: (labName: string) => templateStore.query((t) => t.labName === labName),
}

export const pcChecklistService = {
  getAll: () => pcChecklistStore.getAll(),
  getByPC: (pcId: string) => pcChecklistStore.query((c) => c.pcId === pcId),
  create: (data: Omit<PCChecklist, 'id' | 'createdAt' | 'updatedAt'>) => {
    const checklist = serialize(data) as unknown as PCChecklist
    return pcChecklistStore.create(checklist)
  },
  update: (id: string, data: Partial<PCChecklist>) => {
    return pcChecklistStore.update(id, {
      ...data,
      updatedAt: new Date().toISOString(),
    })
  },
  remove: (id: string) => pcChecklistStore.remove(id),
}
