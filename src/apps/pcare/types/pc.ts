export interface PCPart {
  partId: string
  partName: string
  category: string
  quantity: number
  replacedAt: string
  notes?: string
}

export interface PC {
  id: string
  labName: string
  pcNumber: string
  assetTag: string
  roomLocation: string

  specs: {
    cpu: string
    ram: string
    storage: string
    os: string
  }

  cleaningStatus: 'pending' | 'in_progress' | 'done'
  restorationStatus: 'pending' | 'in_progress' | 'done'

  softwareInstalled: string[]
  partsReplaced: PCPart[]

  observations: string
  photos: string[]
  lastIntervention: string | null
  createdAt: string
  updatedAt: string
}

export type PCFormData = Omit<PC, 'id' | 'createdAt' | 'updatedAt' | 'lastIntervention' | 'photos' | 'partsReplaced' | 'softwareInstalled'> & {
  softwareInstalled: string[]
  partsReplaced: PCPart[]
}
