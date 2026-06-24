import type { Timestamp } from 'firebase/firestore'

export interface ScheduledMaintenance {
  id: string
  pcId: string
  labName: string
  pcNumber: string
  type: 'cleaning' | 'restoration' | 'both'
  scheduledDate: Timestamp
  notes: string
  completed: boolean
  completedAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type MaintenanceFormData = Omit<ScheduledMaintenance, 'id' | 'completed' | 'completedAt' | 'createdAt' | 'updatedAt'>
