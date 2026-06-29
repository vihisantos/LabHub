export type MovementType = 'entrada' | 'saida' | 'mudanca_sala' | 'conserto' | 'descarte' | 'substituicao' | 'emprestimo' | 'devolucao'

export const movementTypes: { value: MovementType; label: string }[] = [
  { value: 'entrada', label: 'Entrada' },
  { value: 'saida', label: 'Saída' },
  { value: 'mudanca_sala', label: 'Mudança de Sala' },
  { value: 'conserto', label: 'Conserto' },
  { value: 'descarte', label: 'Descarte' },
  { value: 'substituicao', label: 'Substituição' },
  { value: 'emprestimo', label: 'Empréstimo' },
  { value: 'devolucao', label: 'Devolução' },
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
  borrowedBy?: string
  borrowerContact?: string
  expectedReturnAt?: string
  returnedAt?: string
  destinationRoom?: string
  createdAt: string
}

export type StockMovementFormData = Omit<StockMovement, 'id' | 'createdAt'>
