export interface StockMaintenance {
  id: string
  itemId: string
  itemName: string
  itemSection: string
  type: 'preventiva' | 'corretiva' | 'inspecao'
  scheduledDate: string
  notes: string
  performedBy: string
  completed: boolean
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export type StockMaintenanceFormData = Omit<StockMaintenance, 'id' | 'completed' | 'completedAt' | 'createdAt' | 'updatedAt'>
