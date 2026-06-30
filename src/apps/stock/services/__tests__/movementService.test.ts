import { movementService } from '../movementService'
import type { StockMovementFormData, MovementType } from '../../types'

function makeFormData(overrides: Partial<StockMovementFormData> = {}): StockMovementFormData {
  return {
    itemId: 'item-1',
    itemName: 'Notebook Dell',
    type: 'entrada' as MovementType,
    fromRoom: '',
    toRoom: 'Sala 101',
    description: 'Entrada de equipamento',
    replacedPart: '',
    newPart: '',
    performedBy: 'João',
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('movementService', () => {
  it('getAll retorna array vazio inicialmente', () => {
    expect(movementService.getAll()).toEqual([])
  })

  it('create adiciona movimento com createdAt', () => {
    const m = movementService.create(makeFormData())
    expect(m.id).toBeDefined()
    expect(m.itemName).toBe('Notebook Dell')
    expect(m.createdAt).toBeDefined()
  })

  it('getAll retorna movimentos não deletados', () => {
    const m1 = movementService.create(makeFormData({ type: 'entrada' }))
    movementService.create(makeFormData({ type: 'saida' }))
    movementService.remove(m1.id)
    expect(movementService.getAll()).toHaveLength(1)
  })

  it('getById retorna movemento por id', () => {
    const created = movementService.create(makeFormData())
    const found = movementService.getById(created.id)
    expect(found).toBeDefined()
    expect(found!.id).toBe(created.id)
  })

  it('getById retorna undefined para movemento deletado', () => {
    const created = movementService.create(makeFormData())
    movementService.remove(created.id)
    expect(movementService.getById(created.id)).toBeUndefined()
  })

  it('getById retorna undefined para id inexistente', () => {
    expect(movementService.getById('no-such-id')).toBeUndefined()
  })

  it('getByItem retorna movimentos não deletados de um item', () => {
    movementService.create(makeFormData({ itemId: 'item-1', type: 'entrada' }))
    const m2 = movementService.create(makeFormData({ itemId: 'item-1', type: 'saida' }))
    movementService.create(makeFormData({ itemId: 'item-2', type: 'entrada' }))
    movementService.remove(m2.id)
    const result = movementService.getByItem('item-1')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('entrada')
  })

  it('remove faz soft delete (marca deletedAt)', () => {
    const created = movementService.create(makeFormData())
    expect(created.deletedAt).toBeUndefined()
    movementService.remove(created.id)
    const raw = JSON.parse(localStorage.getItem('labhub_stock_movements')!)
    const deleted = raw.find((m: any) => m.id === created.id)
    expect(deleted.deletedAt).toBeDefined()
  })

  it('update modifica campos do movimento', () => {
    const created = movementService.create(makeFormData())
    const updated = movementService.update(created.id, { description: 'Descrição atualizada' })
    expect(updated?.description).toBe('Descrição atualizada')
  })

  it('update retorna undefined para movimento deletado', () => {
    const created = movementService.create(makeFormData())
    movementService.remove(created.id)
    const updated = movementService.update(created.id, { description: 'nova' })
    expect(updated).toBeUndefined()
  })
})
