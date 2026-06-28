export interface ChecklistItemDef {
  id: string
  label: string
  category: 'cleaning' | 'restoration' | 'both'
  optional?: boolean
}

export interface ChecklistTemplate {
  id: string
  name: string
  labName: string
  items: ChecklistItemDef[]
  createdAt: string
  updatedAt: string
}

export type ChecklistTemplateForm = Omit<ChecklistTemplate, 'id' | 'createdAt' | 'updatedAt'>

export interface PCChecklistItem {
  itemId: string
  label: string
  category: string
  done: boolean
  doneAt: string | null
}

export interface PCChecklist {
  id: string
  pcId: string
  templateId: string
  templateName: string
  labName: string
  items: PCChecklistItem[]
  completedAt: string | null
  createdAt: string
  updatedAt: string
}
