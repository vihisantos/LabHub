import type { StockItem, StockMovementFormData } from '../types'

interface MovementEffects {
  createMovement: (data: StockMovementFormData) => void
  updateItem: (id: string, patch: Partial<StockItem>) => void
}

function notifyLoan(payload: { itemName: string; borrowedBy: string; expectedReturnAt?: string }) {
  fetch('/api/push/notify-loan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {})
}

function notifyReturn(payload: { itemName: string; returnedBy: string }) {
  fetch('/api/push/notify-return', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {})
}

/**
 * Núcleo único para registrar um movimento: cria o registro, aplica o efeito
 * no item (status/sala) e dispara notificações quando aplicável.
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
      notifyLoan({
        itemName: item.name,
        borrowedBy: data.borrowedBy || 'Alguém',
        expectedReturnAt: data.expectedReturnAt || '',
      })
      break
    case 'devolucao':
      effects.updateItem(item.id, { status: 'ativo' })
      notifyReturn({ itemName: item.name, returnedBy: data.performedBy || 'Alguém' })
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
