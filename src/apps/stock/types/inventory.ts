export type InventoryCycleStatus = 'in_progress' | 'completed'
export type InventoryCountResult = 'pending' | 'verified' | 'missing' | 'damaged'

export interface InventoryCycle {
  id: string
  name: string
  section: string
  status: InventoryCycleStatus
  totalItems: number
  verifiedCount: number
  missingCount: number
  damagedCount: number
  startedAt: string
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface InventoryCycleFormData {
  name: string
  section: string
  totalItems: number
}

export interface InventoryCount {
  id: string
  cycleId: string
  itemId: string
  itemName: string
  itemSubcategory: string
  itemSerial: string
  itemRoom: string
  result: InventoryCountResult
  actualRoom: string
  notes: string
  countedAt: string | null
}
