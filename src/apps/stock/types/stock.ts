export type StockSection = 'maquinas' | 'perifericos' | 'material_escritorio' | 'adaptadores' | 'equipamentos' | 'cabos' | 'outros'

export type StockItemStatus = 'ativo' | 'em_conserto' | 'descartado' | 'emprestado'

export const stockSections: { value: StockSection; label: string }[] = [
  { value: 'maquinas', label: 'Máquinas' },
  { value: 'perifericos', label: 'Periféricos' },
  { value: 'material_escritorio', label: 'Material de Escritório' },
  { value: 'adaptadores', label: 'Adaptadores' },
  { value: 'equipamentos', label: 'Equipamentos' },
  { value: 'cabos', label: 'Cabos' },
  { value: 'outros', label: 'Outros' },
]

export const sectionSubcategories: Record<StockSection, string[]> = {
  maquinas: ['Notebook', 'Desktop', 'Monitor', 'Impressora'],
  perifericos: ['Mouse', 'Teclado', 'Webcam', 'Caixa de Som', 'Headset'],
  material_escritorio: ['Papel', 'Caneta', 'Fita', 'Envelope'],
  adaptadores: ['USB-C', 'HDMI', 'VGA', 'Rede', 'Energia'],
  equipamentos: ['SSD', 'HD', 'RAM', 'Fonte'],
  cabos: ['Cabo HDMI', 'Cabo VGA', 'Cabo USB', 'Cabo Rede', 'Cabo Extensão', 'Cabo Energia'],
  outros: [],
}

export const stockConditions = ['Bom', 'Regular', 'Danificado']

export interface StockItem {
  id: string
  name: string
  section: StockSection
  subcategory: string
  serialNumber: string
  room: string
  status: StockItemStatus
  condition: string
  notes: string
  cableType?: string
  cableLength?: string
  connectorType?: string
  outletCount?: number
  linkedPcId?: string
  linkedPcLabel?: string
  createdAt: string
  updatedAt: string
}

export type StockItemFormData = Omit<StockItem, 'id' | 'createdAt' | 'updatedAt'>
