import type { Timestamp } from 'firebase/firestore'

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
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type ChecklistTemplateForm = Omit<ChecklistTemplate, 'id' | 'createdAt' | 'updatedAt'>

export interface PCChecklistItem {
  itemId: string
  label: string
  category: string
  done: boolean
  doneAt: Timestamp | null
}

export interface PCChecklist {
  id: string
  pcId: string
  templateId: string
  templateName: string
  labName: string
  items: PCChecklistItem[]
  completedAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}
