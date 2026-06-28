export interface ScheduledMaintenance {
  id: string
  pcId: string
  labName: string
  pcNumber: string
  type: 'cleaning' | 'restoration' | 'both'
  scheduledDate: string
  notes: string
  completed: boolean
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export type MaintenanceFormData = Omit<ScheduledMaintenance, 'id' | 'completed' | 'completedAt' | 'createdAt' | 'updatedAt'>
