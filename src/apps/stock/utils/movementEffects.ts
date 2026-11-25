import type { StockItem, StockMovementFormData } from '../types'

interface MovementEffects {
  createMovement: (data: StockMovementFormData) => void
  updateItem: (id: string, patch: Partial<StockItem>) => void
}

/**
 * Núcleo único para registrar um movimento: cria o registro, aplica o efeito
 * no item (status/sala). Push legado foi removido: disparos sem token,
 * workspace ou confirmação de persistência eram descartados/arriscados.
 * Avisos novos devem ser originados por evento persistido no backend.
 */
export function applyMovementEffects(item: StockItem, data: StockMovementFormData, effects: MovementEffects) {
  effects.createMovement(data)
  switch (data.type) {
    case 'mudanca_sala':
      if (data.toRoom) effects.updateItem(item.id, { room: data.toRoom })
      break
    case 'conserto':
      effects.updateItem(item.id, { status: 'em_conserto' })
      break
    case 'descarte':
      effects.updateItem(item.id, { status: 'descartado' })
      break
    case 'emprestimo':
      effects.updateItem(item.id, { status: 'emprestado', room: data.destinationRoom || item.room })
      break
    case 'devolucao':
      effects.updateItem(item.id, { status: 'ativo' })
      break
    case 'entrada':
      if (data.toRoom && data.toRoom !== item.room) effects.updateItem(item.id, { room: data.toRoom })
      if (item.status !== 'ativo') effects.updateItem(item.id, { status: 'ativo' })
      break
    case 'saida':
      effects.updateItem(item.id, { status: 'descartado' })
      break
    case 'substituicao':
      break
  }
}
