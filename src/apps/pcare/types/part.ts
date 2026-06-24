import type { Timestamp } from 'firebase/firestore'

export interface Part {
  id: string
  name: string
  category: string
  quantity: number
  minQuantity: number
  serialNumber?: string
  notes?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type PartFormData = Omit<Part, 'id' | 'createdAt' | 'updatedAt'>
