export const EQUIPMENT_TYPES = [
  'Desktop', 'Notebook', 'All in One', 'Mac Mini', 'MacBook', 'Monitor', 'Projetor',
  'Impressora', 'Switch', 'Access Point', 'Televisão', 'Webcam', 'Mesa de Som',
  'Microfone', 'Câmera', 'Outro',
] as const

export type EquipmentType = (typeof EQUIPMENT_TYPES)[number]
export type AssetStatus = 'in_use' | 'available' | 'reserve' | 'maintenance' | 'retired'
export type OperatingSystem = 'windows' | 'macos' | 'linux' | 'chromeos' | 'none' | ''
export type Architecture = 'intel' | 'amd' | 'apple_silicon' | ''
export type StorageType = 'ssd_sata' | 'ssd_nvme' | 'hd' | 'fusion_drive' | 'other' | ''

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  in_use: 'Em uso', available: 'Disponível', reserve: 'Reserva', maintenance: 'Em manutenção', retired: 'Baixado',
}
export const OPERATING_SYSTEM_LABELS: Record<Exclude<OperatingSystem, ''>, string> = {
  windows: 'Windows', macos: 'macOS', linux: 'Linux', chromeos: 'ChromeOS', none: 'Sem SO',
}
export const ARCHITECTURE_LABELS: Record<Exclude<Architecture, ''>, string> = {
  intel: 'Intel', amd: 'AMD', apple_silicon: 'Apple Silicon',
}
export const STORAGE_TYPE_LABELS: Record<Exclude<StorageType, ''>, string> = {
  ssd_sata: 'SSD SATA', ssd_nvme: 'SSD NVMe', hd: 'HD', fusion_drive: 'Fusion Drive', other: 'Outro',
}

export interface AssetTechnicalInfo {
  operatingSystem: OperatingSystem
  architecture: Architecture
  processor: string
  memory: string
  storageType: StorageType
  storageCapacity: string
  storageBrand: string
}

export interface AssetNetworkInfo {
  hostname: string
  macEthernet: string
  macWifi: string
  ip: string
  domain: string
}

export interface Asset {
  id: string
  assetTag: string
  equipmentType: EquipmentType
  manufacturer: string
  model: string
  serialNumber: string
  location: string
  status: AssetStatus
  observations: string
  technical: AssetTechnicalInfo
  network: AssetNetworkInfo
  /** Hierarquia de ativos: o ativo pai pode representar um conjunto/equipamento principal. */
  parentAssetId: string | null
  childAssetIds: string[]
  photos: string[]
  createdAt: string
  updatedAt: string
}

export type AssetFormData = Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>

export const emptyTechnicalInfo = (): AssetTechnicalInfo => ({
  operatingSystem: '', architecture: '', processor: '', memory: '', storageType: '', storageCapacity: '', storageBrand: '',
})
export const emptyNetworkInfo = (): AssetNetworkInfo => ({ hostname: '', macEthernet: '', macWifi: '', ip: '', domain: '' })
