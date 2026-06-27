import { stockService } from '../stockService'

beforeEach(() => {
  localStorage.clear()
})

describe('stockService', () => {
  const validItem = {
    name: 'Papel A4',
    category: 'papel',
    quantity: 100,
    minQuantity: 10,
    unit: 'un',
    location: 'Armário 1',
    notes: '',
  }

  it('create adiciona item com timestamps', () => {
    const item = stockService.create(validItem)
    expect(item.id).toBeDefined()
    expect(item.name).toBe('Papel A4')
    expect(item.createdAt).toBeDefined()
    expect(item.updatedAt).toBeDefined()
  })

  it('getAll retorna todos os itens', () => {
    stockService.create(validItem)
    stockService.create({ ...validItem, name: 'Caneta' })
    expect(stockService.getAll()).toHaveLength(2)
  })

  it('getById retorna item por id', () => {
    const item = stockService.create(validItem)
    expect(stockService.getById(item.id)?.name).toBe('Papel A4')
  })

  it('update modifica quantidade', () => {
    const item = stockService.create(validItem)
    stockService.update(item.id, { quantity: 50 })
    expect(stockService.getById(item.id)?.quantity).toBe(50)
  })

  it('update atualiza updatedAt', () => {
    const item = stockService.create(validItem)
    const originalUpdatedAt = item.updatedAt
    vi.advanceTimersByTime(1000)
    stockService.update(item.id, { quantity: 75 })
    const updatedItem = stockService.getById(item.id)
    expect(updatedItem?.updatedAt.seconds).not.toBe(originalUpdatedAt.seconds)
  })

  it('remove deleta item', () => {
    const item = stockService.create(validItem)
    stockService.remove(item.id)
    expect(stockService.getById(item.id)).toBeUndefined()
  })

  it('remove retorna false para id inexistente', () => {
    expect(stockService.remove('no-such-id')).toBe(false)
  })
})
