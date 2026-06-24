import type { Timestamp } from 'firebase/firestore'

export type ActionType =
  | 'pc_created'
  | 'status_changed'
  | 'part_added'
  | 'checklist_applied'
  | 'checklist_toggled'
  | 'software_added'

export interface ActionLog {
  id: string
  pcId: string
  type: ActionType
  description: string
  timestamp: Timestamp
}
