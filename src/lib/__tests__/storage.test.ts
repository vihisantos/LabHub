import { createLocalService } from '../storage'
import { resetCache } from '../db'

interface TestItem {
  id: string
  name: string
  value: number
}

function createTestService() {
  return createLocalService<TestItem>('test_collection')
}

beforeEach(() => {
  resetCache()
})

describe('createLocalService', () => {
  it('getAll retorna array vazio inicialmente', () => {
    const service = createTestService()
    expect(service.getAll()).toEqual([])
  })

  it('create adiciona item com id gerado', () => {
    const service = createTestService()
    const item = service.create({ name: 'foo', value: 42 })
    expect(item.id).toBeDefined()
    expect(item.name).toBe('foo')
    expect(item.value).toBe(42)
  })

  it('getAll retorna todos os itens', () => {
    const service = createTestService()
    service.create({ name: 'a', value: 1 })
    service.create({ name: 'b', value: 2 })
    expect(service.getAll()).toHaveLength(2)
  })

  it('getById retorna item por id', () => {
    const service = createTestService()
    const created = service.create({ name: 'find-me', value: 99 })
    const found = service.getById(created.id)
    expect(found).toEqual(created)
  })

  it('getById retorna undefined para id inexistente', () => {
    const service = createTestService()
    expect(service.getById('non-existent')).toBeUndefined()
  })

  it('update modifica campos do item', () => {
    const service = createTestService()
    const created = service.create({ name: 'original', value: 1 })
    const updated = service.update(created.id, { name: 'updated', value: 2 })
    expect(updated?.name).toBe('updated')
    expect(updated?.value).toBe(2)
  })

  it('update retorna undefined para id inexistente', () => {
    const service = createTestService()
    expect(service.update('no-such-id', { name: 'x' })).toBeUndefined()
  })

  it('remove deleta item existente', () => {
    const service = createTestService()
    const created = service.create({ name: 'delete-me', value: 0 })
    expect(service.remove(created.id)).toBe(true)
    expect(service.getById(created.id)).toBeUndefined()
  })

  it('remove retorna false para id inexistente', () => {
    const service = createTestService()
    expect(service.remove('no-such-id')).toBe(false)
  })

  it('query filtra itens por predicado', () => {
    const service = createTestService()
    service.create({ name: 'a', value: 10 })
    service.create({ name: 'b', value: 20 })
    service.create({ name: 'c', value: 10 })
    const result = service.query((item) => item.value === 10)
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.value === 10)).toBe(true)
  })

  it('persiste dados entre chamadas (cache em memória)', () => {
    const service1 = createTestService()
    service1.create({ name: 'persist', value: 1 })
    const service2 = createTestService()
    expect(service2.getAll()).toHaveLength(1)
    expect(service2.getAll()[0].name).toBe('persist')
  })

  it('lida com coleções separadas de forma independente', () => {
    const serviceA = createLocalService<TestItem>('collection_a')
    const serviceB = createLocalService<TestItem>('collection_b')
    serviceA.create({ name: 'from-a', value: 1 })
    serviceB.create({ name: 'from-b', value: 2 })
    expect(serviceA.getAll()).toHaveLength(1)
    expect(serviceB.getAll()).toHaveLength(1)
    expect(serviceA.getAll()[0].name).toBe('from-a')
    expect(serviceB.getAll()[0].name).toBe('from-b')
  })
})
