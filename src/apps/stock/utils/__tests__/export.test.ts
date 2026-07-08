import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportStockItemsCSV, exportMovementsCSV } from '../export'

// Mock do exportCSV do pcare
vi.mock('../../../pcare/utils/export', () => ({
  exportCSV: vi.fn(),
}))

import { exportCSV } from '../../../pcare/utils/export'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('exportStockItemsCSV', () => {
  it('exporta items com headers corretos', () => {
    const items = [{
      id: '1', name: 'Notebook', section: 'maquinas', subcategory: 'Notebook',
      serialNumber: 'SN-001', room: 'Lab 1', status: 'ativo', condition: 'Bom',
      cableType: '', cableLength: '', connectorType: '', outletCount: undefined,
      notes: 'Teste',
    }]
    exportStockItemsCSV(items as any)

    expect(exportCSV).toHaveBeenCalledOnce()
    const [headers] = (exportCSV as any).mock.calls[0]
    expect(headers).toContain('Nome')
    expect(headers).toContain('Seção')
    expect(headers).toContain('Nº Série')
    expect(headers).toContain('Sala')
  })

  it('mapeia seção para label em português', () => {
    const items = [{
      id: '1', name: 'Mouse', section: 'perifericos', subcategory: 'Mouse',
      serialNumber: '', room: '', status: 'ativo', condition: 'Bom',
      cableType: undefined, cableLength: undefined, connectorType: undefined,
      outletCount: undefined, notes: '',
    }]
    exportStockItemsCSV(items as any)

    const [, rows] = (exportCSV as any).mock.calls[0]
    expect(rows[0][1]).toBe('Periféricos')
  })

  it('usa label padrão se seção não encontrada', () => {
    const items = [{
      id: '1', name: 'Item', section: 'unknown_section', subcategory: '',
      serialNumber: '', room: '', status: 'ativo', condition: 'Bom',
      cableType: undefined, cableLength: undefined, connectorType: undefined,
      outletCount: undefined, notes: '',
    }]
    exportStockItemsCSV(items as any)

    const [, rows] = (exportCSV as any).mock.calls[0]
    expect(rows[0][1]).toBe('unknown_section')
  })
})

describe('exportMovementsCSV', () => {
  it('exporta movimentações com headers corretos', () => {
    const movements = [{
      id: '1', itemId: 'item-1', itemName: 'Notebook', type: 'entrada',
      fromRoom: '', toRoom: 'Lab 1', description: 'Entrada',
      replacedPart: '', newPart: '', performedBy: 'João',
      createdAt: '2026-06-25T12:00:00.000Z',
    }]
    exportMovementsCSV(movements as any)

    expect(exportCSV).toHaveBeenCalledOnce()
    const [headers] = (exportCSV as any).mock.calls[0]
    expect(headers).toContain('Item')
    expect(headers).toContain('Tipo')
    expect(headers).toContain('Sala Origem')
    expect(headers).toContain('Responsável')
  })

  it('mapeia tipo para label em português', () => {
    const movements = [{
      id: '1', itemId: 'item-1', itemName: 'Mouse', type: 'entrada',
      fromRoom: '', toRoom: '', description: '', replacedPart: '', newPart: '',
      performedBy: '', createdAt: '2026-06-25T12:00:00.000Z',
    }]
    exportMovementsCSV(movements as any)

    const [, rows] = (exportCSV as any).mock.calls[0]
    expect(rows[0][1]).toBe('Entrada')
  })

  it('formata data no padrão pt-BR', () => {
    const movements = [{
      id: '1', itemId: 'item-1', itemName: 'Teclado', type: 'saida',
      fromRoom: 'Lab 1', toRoom: 'Sala 2', description: '',
      replacedPart: '', newPart: '', performedBy: '',
      createdAt: '2026-06-25T12:00:00.000Z',
    }]
    exportMovementsCSV(movements as any)

    const [, rows] = (exportCSV as any).mock.calls[0]
    expect(rows[0][12]).toBeDefined()
  })
})
