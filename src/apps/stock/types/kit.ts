export interface KitItem {
  name: string
  expected: number
  present: boolean
}

export type KitStatus = 'ok' | 'incompleto' | 'nao_conferido'

export interface Kit {
  id: string
  name: string
  room: string
  items: KitItem[]
  lastChecked: string | null
  status: KitStatus
  createdAt: string
  updatedAt: string
}

export type KitFormData = Omit<Kit, 'id' | 'createdAt' | 'updatedAt' | 'lastChecked' | 'status'>
