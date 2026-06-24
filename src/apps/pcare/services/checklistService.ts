import type { ChecklistTemplate, ChecklistTemplateForm, PCChecklist } from '../types/checklist'
import { createLocalService } from '../../../lib/storage'

const templateStore = createLocalService<ChecklistTemplate>('checklist_templates')
const pcChecklistStore = createLocalService<PCChecklist>('pc_checklists')

function serialize<T>(data: T) {
  const now = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any
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
      updatedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
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
      updatedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    })
  },
  remove: (id: string) => pcChecklistStore.remove(id),
}
