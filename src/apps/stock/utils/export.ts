import { exportCSV } from '../../pcare/utils/export'
import type { StockItem } from '../types/stock'
import type { StockMovement } from '../types/movement'
import { stockSections } from '../types/stock'
import { movementTypes } from '../types/movement'

export function exportStockItemsCSV(items: StockItem[]) {
  const sectionLabel = (section: string) =>
    stockSections.find((s) => s.value === section)?.label || section

  const headers = ['Nome', 'Seção', 'Subcategoria', 'Nº Série', 'Sala', 'Status', 'Condição', 'Observações']

  const rows = items.map((item) => [
    item.name,
    sectionLabel(item.section),
    item.subcategory,
    item.serialNumber,
    item.room,
    item.status,
    item.condition,
    item.notes,
  ])

  exportCSV(headers, rows, `estoque_${new Date().toISOString().slice(0, 10)}`)
}

export function exportMovementsCSV(movements: StockMovement[]) {
  const typeLabel = (type: string) =>
    movementTypes.find((t) => t.value === type)?.label || type

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('pt-BR')
  }

  const headers = ['Item', 'Tipo', 'Sala Origem', 'Sala Destino', 'Descrição', 'Peça Substituída', 'Peça Nova', 'Responsável', 'Data']

  const rows = movements.map((m) => [
    m.itemName,
    typeLabel(m.type),
    m.fromRoom,
    m.toRoom,
    m.description,
    m.replacedPart,
    m.newPart,
    m.performedBy,
    formatDate(m.createdAt),
  ])

  exportCSV(headers, rows, `movimentacoes_${new Date().toISOString().slice(0, 10)}`)
}
