import { stockService } from '../stockService'
import type { StockItemFormData, StockItemStatus, StockSection } from '../../types'

function makeFormData(overrides: Partial<StockItemFormData> = {}): StockItemFormData {
  return {
    name: 'Notebook Dell',
    section: 'maquinas' as StockSection,
    subcategory: 'Notebook',
    serialNumber: 'SN-001',
    room: 'Sala 101',
    status: 'ativo' as StockItemStatus,
    condition: 'Bom',
    notes: '',
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('stockService', () => {
  it('getAll retorna array vazio inicialmente', () => {
    expect(stockService.getAll()).toEqual([])
  })

  it('create adiciona item com timestamps', () => {
    const item = stockService.create(makeFormData())
    expect(item.id).toBeDefined()
    expect(item.name).toBe('Notebook Dell')
    expect(item.createdAt).toBeDefined()
    expect(item.updatedAt).toBeDefined()
  })

  it('getAll retorna todos os itens', () => {
    stockService.create(makeFormData({ name: 'Item A' }))
    stockService.create(makeFormData({ name: 'Item B' }))
    expect(stockService.getAll()).toHaveLength(2)
  })

  it('getById retorna item por id', () => {
    const created = stockService.create(makeFormData())
    const found = stockService.getById(created.id)
    expect(found).toBeDefined()
    expect(found!.id).toBe(created.id)
  })

  it('getById retorna undefined para id inexistente', () => {
    expect(stockService.getById('no-such-id')).toBeUndefined()
  })

  it('update modifica campos do item', () => {
    const created = stockService.create(makeFormData())
    const updated = stockService.update(created.id, { name: 'Notebook HP', room: 'Sala 202' })
    expect(updated?.name).toBe('Notebook HP')
    expect(updated?.room).toBe('Sala 202')
  })

  it('remove deleta item', () => {
    const created = stockService.create(makeFormData())
    expect(stockService.remove(created.id)).toBe(true)
    expect(stockService.getById(created.id)).toBeUndefined()
  })

  it('query filtra itens por predicado', () => {
    stockService.create(makeFormData({ name: 'Mouse', section: 'perifericos' }))
    stockService.create(makeFormData({ name: 'Teclado', section: 'perifericos' }))
    stockService.create(makeFormData({ name: 'Monitor', section: 'maquinas' }))
    const result = stockService.query((item) => item.section === 'perifericos')
    expect(result).toHaveLength(2)
  })
})
