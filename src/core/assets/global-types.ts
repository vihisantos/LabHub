export const EQUIPMENT_TYPES = [
  'Desktop', 'Notebook', 'All in One', 'Mac Mini', 'MacBook',
  'Monitor', 'Projetor', 'Impressora', 'Switch', 'Access Point',
  'Televisão', 'Webcam', 'Mesa de Som', 'Microfone', 'Câmera',
  'Outro',
] as const

export type EquipmentType = (typeof EQUIPMENT_TYPES)[number]

export type GlobalAssetStatus = 'draft' | 'active' | 'maintenance' | 'retired'

export const GLOBAL_ASSET_STATUS_LABELS: Record<GlobalAssetStatus, string> = {
  draft: 'Rascunho',
  active: 'Ativo',
  maintenance: 'Em manutenção',
  retired: 'Baixado',
}

export interface GlobalAsset {
  id: string
  workspace_id: string
  asset_tag: string | null
  serial_number: string | null
  equipment_type: EquipmentType
  manufacturer: string
  model: string
  name: string
  location_id: string | null
  status: GlobalAssetStatus
  notes: string
  metadata: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
}

export type GlobalAssetCreateData = Omit<GlobalAsset, 'id' | 'workspace_id' | 'created_by' | 'created_at' | 'updated_at'>

export interface GlobalAssetStats {
  total: number
  byStatus: Record<GlobalAssetStatus, number>
  byType: Record<string, number>
}
