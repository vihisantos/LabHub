export type StockSection = 'maquinas' | 'perifericos' | 'material_escritorio' | 'adaptadores' | 'equipamentos' | 'outros'

export type StockItemStatus = 'ativo' | 'em_conserto' | 'descartado'

export const stockSections: { value: StockSection; label: string }[] = [
  { value: 'maquinas', label: 'Máquinas' },
  { value: 'perifericos', label: 'Periféricos' },
  { value: 'material_escritorio', label: 'Material de Escritório' },
  { value: 'adaptadores', label: 'Adaptadores' },
  { value: 'equipamentos', label: 'Equipamentos' },
  { value: 'outros', label: 'Outros' },
]

export const sectionSubcategories: Record<StockSection, string[]> = {
  maquinas: ['Notebook', 'Desktop', 'Monitor', 'Impressora'],
  perifericos: ['Mouse', 'Teclado', 'Webcam', 'Caixa de Som', 'Headset'],
  material_escritorio: ['Papel', 'Caneta', 'Fita', 'Envelope'],
  adaptadores: ['USB-C', 'HDMI', 'VGA', 'Rede', 'Energia'],
  equipamentos: ['SSD', 'HD', 'RAM', 'Fonte', 'Cabo'],
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
  createdAt: string
  updatedAt: string
}

export type StockItemFormData = Omit<StockItem, 'id' | 'createdAt' | 'updatedAt'>
