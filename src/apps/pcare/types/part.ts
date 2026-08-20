export interface Part {
  id: string
  name: string
  category: string
  quantity: number
  minQuantity: number
  serialNumber?: string
  notes?: string
  workspace_id?: string
  createdAt: string
  updatedAt: string
}

export type PartFormData = Omit<Part, 'id' | 'createdAt' | 'updatedAt'>
