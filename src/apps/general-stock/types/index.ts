import type { Timestamp } from 'firebase/firestore'

export const stockCategories = [
  { value: 'papel', label: 'Papel' },
  { value: 'caneta', label: 'Caneta' },
  { value: 'cabo', label: 'Cabo' },
  { value: 'adaptador', label: 'Adaptador' },
  { value: 'material_limpeza', label: 'Material de Limpeza' },
  { value: 'suprimento_escritorio', label: 'Suprimento de Escritório' },
  { value: 'ferramenta', label: 'Ferramenta' },
  { value: 'outro', label: 'Outro' },
]

export const stockUnits = [
  'un', 'metro', 'pacote', 'caixa', 'litro', 'par', 'rolo',
]

export interface GeneralItem {
  id: string
  name: string
  category: string
  quantity: number
  minQuantity: number
  unit: string
  location: string
  notes: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type GeneralItemFormData = Omit<GeneralItem, 'id' | 'createdAt' | 'updatedAt'>
