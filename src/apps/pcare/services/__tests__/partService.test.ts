import { partService } from '../partService'
import type { PartFormData } from '../../types'

function validFormData(): PartFormData {
  return {
    name: 'Teclado',
    category: 'periferico',
    quantity: 10,
    minQuantity: 2,
    serialNumber: 'SN-001',
    notes: 'Nota de teste',
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('partService', () => {
  it('create adiciona uma peça com timestamps', () => {
    const part = partService.create(validFormData())
    expect(part.id).toBeDefined()
    expect(part.name).toBe('Teclado')
    expect(part.quantity).toBe(10)
    expect(part.createdAt).toBeDefined()
    expect(part.updatedAt).toBeDefined()
  })

  it('getAll retorna todas as peças', () => {
    partService.create(validFormData())
    partService.create({ ...validFormData(), name: 'Mouse' })
    expect(partService.getAll()).toHaveLength(2)
  })

  it('getById retorna peça por id', () => {
    const created = partService.create(validFormData())
    expect(partService.getById(created.id)?.name).toBe('Teclado')
  })

  it('update modifica quantidade', () => {
    const p = partService.create(validFormData())
    partService.update(p.id, { quantity: 5 })
    expect(partService.getById(p.id)?.quantity).toBe(5)
  })

  it('remove deleta peça', () => {
    const p = partService.create(validFormData())
    partService.remove(p.id)
    expect(partService.getById(p.id)).toBeUndefined()
  })

  it('query filtra por categoria', () => {
    partService.create(validFormData())
    partService.create({ ...validFormData(), name: 'Monitor', category: 'video' })
    const result = partService.query((part) => part.category === 'periferico')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Teclado')
  })
})
