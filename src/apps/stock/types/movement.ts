export type MovementType = 'entrada' | 'saida' | 'mudanca_sala' | 'conserto' | 'descarte' | 'substituicao'

export const movementTypes: { value: MovementType; label: string }[] = [
  { value: 'entrada', label: 'Entrada' },
  { value: 'saida', label: 'Saída' },
  { value: 'mudanca_sala', label: 'Mudança de Sala' },
  { value: 'conserto', label: 'Conserto' },
  { value: 'descarte', label: 'Descarte' },
  { value: 'substituicao', label: 'Substituição' },
]

export interface StockMovement {
  id: string
  itemId: string
  itemName: string
  type: MovementType
  fromRoom: string
  toRoom: string
  description: string
  replacedPart: string
  newPart: string
  performedBy: string
  createdAt: string
}

export type StockMovementFormData = Omit<StockMovement, 'id' | 'createdAt'>
