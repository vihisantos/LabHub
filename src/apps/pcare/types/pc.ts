export type OsType = 'windows10' | 'windows11' | 'linux' | 'macos'
export type OsEdition = 'enterprise' | 'education'
export type PcTypeLabel = 'academico' | 'administrativo'

export interface PCConfig {
  osType: OsType | ''
  osVersion: string
  osEdition: OsEdition | ''
  pcType: PcTypeLabel | ''
  domain: string
}

export const OS_TYPE_LABELS: Record<OsType, string> = {
  windows10: 'Windows 10',
  windows11: 'Windows 11',
  linux: 'Linux',
  macos: 'macOS',
}

export const OS_VERSIONS: Record<OsType, string[]> = {
  windows10: ['22H2'],
  windows11: ['23H2', '24H2'],
  linux: ['Ubuntu 22.04', 'Ubuntu 24.04', 'Mint 21'],
  macos: ['Sonoma', 'Sequoia'],
}

export const OS_EDITION_LABELS: Record<OsEdition, string> = {
  enterprise: 'Enterprise',
  education: 'Education',
}

export const PC_TYPE_LABELS: Record<PcTypeLabel, string> = {
  academico: 'Acadêmico',
  administrativo: 'Administrativo',
}

export const PC_TYPE_DOMAIN: Record<PcTypeLabel, string> = {
  academico: 'animaedu.intranet',
  administrativo: 'anima.intranet',
}

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
  }

  config: PCConfig

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
