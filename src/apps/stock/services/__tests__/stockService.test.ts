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

  describe('vinculo Stock-PC', () => {
    it('create aceita linkedPcId e linkedPcLabel', () => {
      const item = stockService.create(
        makeFormData({ linkedPcId: 'pc-123', linkedPcLabel: 'Lab A - PC-001' }),
      )
      expect(item.linkedPcId).toBe('pc-123')
      expect(item.linkedPcLabel).toBe('Lab A - PC-001')
    })

    it('query filtra itens por linkedPcId', () => {
      stockService.create(makeFormData({ name: 'Mouse', linkedPcId: 'pc-001', linkedPcLabel: 'Lab A - PC-001' }))
      stockService.create(makeFormData({ name: 'Teclado', linkedPcId: 'pc-001', linkedPcLabel: 'Lab A - PC-001' }))
      stockService.create(makeFormData({ name: 'Monitor', linkedPcId: 'pc-002', linkedPcLabel: 'Lab B - PC-002' }))

      const result = stockService.query((item) => item.linkedPcId === 'pc-001')
      expect(result).toHaveLength(2)
      expect(result.every((i) => i.linkedPcId === 'pc-001')).toBe(true)
    })

    it('query retorna vazio para linkedPcId sem itens', () => {
      stockService.create(makeFormData({ name: 'Mouse', linkedPcId: 'pc-001', linkedPcLabel: 'Lab A - PC-001' }))
      const result = stockService.query((item) => item.linkedPcId === 'pc-inexistente')
      expect(result).toHaveLength(0)
    })

    it('update pode alterar o vinculo do PC', () => {
      const item = stockService.create(
        makeFormData({ name: 'Mouse', linkedPcId: 'pc-001', linkedPcLabel: 'Lab A - PC-001' }),
      )
      const updated = stockService.update(item.id, {
        linkedPcId: 'pc-002',
        linkedPcLabel: 'Lab B - PC-002',
      })
      expect(updated?.linkedPcId).toBe('pc-002')
      expect(updated?.linkedPcLabel).toBe('Lab B - PC-002')
    })

    it('update pode remover o vinculo do PC (undefined)', () => {
      const item = stockService.create(
        makeFormData({ name: 'Mouse', linkedPcId: 'pc-001', linkedPcLabel: 'Lab A - PC-001' }),
      )
      const updated = stockService.update(item.id, {
        linkedPcId: undefined,
        linkedPcLabel: undefined,
      })
      expect(updated?.linkedPcId).toBeUndefined()
      expect(updated?.linkedPcLabel).toBeUndefined()
    })

    it('itens sem vinculo têm linkedPcId undefined', () => {
      const item = stockService.create(makeFormData({ name: 'Monitor' }))
      expect(item.linkedPcId).toBeUndefined()
      expect(item.linkedPcLabel).toBeUndefined()
    })
  })
})
