import { describe, it, expect, beforeEach } from 'vitest'
import {
  markDirty,
  clearDirty,
  getDirtyCollections,
  getPendingChanges,
  getSyncLog,
  getLastSyncedAt,
  createSyncService,
} from '../sync'
import { resetCache } from '../db'

beforeEach(() => {
  resetCache()
  localStorage.clear()
})

describe('markDirty / clearDirty / getDirtyCollections', () => {
  it('getDirtyCollections retorna array vazio inicialmente', () => {
    expect(getDirtyCollections()).toEqual([])
  })

  it('markDirty adiciona coleção ao conjunto sujo', () => {
    markDirty('pcs')
    expect(getDirtyCollections()).toEqual(['pcs'])
  })

  it('markDirty não adiciona duplicatas', () => {
    markDirty('pcs')
    markDirty('pcs')
    expect(getDirtyCollections()).toEqual(['pcs'])
  })

  it('clearDirty remove coleção do conjunto sujo', () => {
    markDirty('pcs')
    markDirty('parts')
    clearDirty('pcs')
    expect(getDirtyCollections()).toEqual(['parts'])
  })

  it('clearDirty em coleção não suja não causa erro', () => {
    clearDirty('nonexistent')
    expect(getDirtyCollections()).toEqual([])
  })

  it('persiste no localStorage entre chamadas', () => {
    markDirty('pcs')
    expect(getDirtyCollections()).toEqual(['pcs'])
  })

  it('lida com múltiplas coleções', () => {
    markDirty('pcs')
    markDirty('parts')
    markDirty('stock_items')
    expect(getDirtyCollections()).toHaveLength(3)
    expect(getDirtyCollections()).toContain('pcs')
    expect(getDirtyCollections()).toContain('parts')
    expect(getDirtyCollections()).toContain('stock_items')
  })
})

describe('getPendingChanges', () => {
  it('retorna 0 quando não há coleções sujas', () => {
    expect(getPendingChanges()).toBe(0)
  })

  it('retorna a quantidade de coleções sujas', () => {
    markDirty('pcs')
    markDirty('parts')
    expect(getPendingChanges()).toBe(2)
  })

  it('retorna 0 após limpar todas as coleções', () => {
    markDirty('pcs')
    clearDirty('pcs')
    expect(getPendingChanges()).toBe(0)
  })
})

describe('getSyncLog / getLastSyncedAt', () => {
  it('getSyncLog retorna array vazio inicialmente', () => {
    expect(getSyncLog()).toEqual([])
  })

  it('getLastSyncedAt retorna null quando não há logs', () => {
    expect(getLastSyncedAt()).toBeNull()
  })

  it('getLastSyncedAt retorna a data do último log não-erro', () => {
    const logs = [
      { collection: 'pcs', itemCount: 5, status: 'ok' as const, at: '2026-06-25T10:00:00.000Z' },
    ]
    localStorage.setItem('labhub_sync_log', JSON.stringify(logs))
    const last = getLastSyncedAt()
    expect(last).toBeInstanceOf(Date)
    expect(last!.toISOString()).toBe('2026-06-25T10:00:00.000Z')
  })

  it('getLastSyncedAt ignora logs de erro', () => {
    const logs = [
      { collection: 'pcs', itemCount: 0, status: 'error' as const, at: '2026-06-25T10:00:00.000Z' },
      { collection: 'parts', itemCount: 3, status: 'ok' as const, at: '2026-06-25T11:00:00.000Z' },
    ]
    localStorage.setItem('labhub_sync_log', JSON.stringify(logs))
    const last = getLastSyncedAt()
    expect(last!.toISOString()).toBe('2026-06-25T11:00:00.000Z')
  })

  it('lida com JSON corrompido no sync log', () => {
    localStorage.setItem('labhub_sync_log', 'invalid json')
    expect(getSyncLog()).toEqual([])
    expect(getLastSyncedAt()).toBeNull()
  })
})

describe('createSyncService', () => {
  it('getAll retorna lista vazia inicialmente', () => {
    const service = createSyncService<{ id: string; name: string }>('sync_test')
    expect(service.getAll()).toEqual([])
  })

  it('create adiciona item e marca coleção como suja', () => {
    const service = createSyncService<{ id: string; name: string }>('sync_test')
    const item = service.create({ name: 'test-item' })
    expect(item.id).toBeDefined()
    expect(item.name).toBe('test-item')
    expect(getDirtyCollections()).toContain('sync_test')
  })

  it('getById retorna item por id', () => {
    const service = createSyncService<{ id: string; name: string }>('sync_test')
    const created = service.create({ name: 'find-me' })
    const found = service.getById(created.id)
    expect(found).toEqual(created)
  })

  it('getById retorna undefined para id inexistente', () => {
    const service = createSyncService<{ id: string; name: string }>('sync_test')
    expect(service.getById('nonexistent')).toBeUndefined()
  })

  it('update modifica item e marca coleção como suja', () => {
    const service = createSyncService<{ id: string; name: string }>('sync_test')
    const created = service.create({ name: 'original' })
    // limpa dirty para testar que update marca novamente
    clearDirty('sync_test')
    const updated = service.update(created.id, { name: 'updated' })
    expect(updated?.name).toBe('updated')
    expect(getDirtyCollections()).toContain('sync_test')
  })

  it('update retorna undefined para id inexistente', () => {
    const service = createSyncService<{ id: string; name: string }>('sync_test')
    expect(service.update('nonexistent', { name: 'x' })).toBeUndefined()
  })

  it('remove deleta item e marca coleção como suja', () => {
    const service = createSyncService<{ id: string; name: string }>('sync_test')
    const created = service.create({ name: 'delete-me' })
    clearDirty('sync_test')
    expect(service.remove(created.id)).toBe(true)
    expect(getDirtyCollections()).toContain('sync_test')
    expect(service.getById(created.id)).toBeUndefined()
  })

  it('remove retorna false para id inexistente e não marca dirty', () => {
    const service = createSyncService<{ id: string; name: string }>('sync_test')
    clearDirty('sync_test')
    expect(service.remove('nonexistent')).toBe(false)
    expect(getDirtyCollections()).not.toContain('sync_test')
  })

  it('query filtra itens por predicado', () => {
    const service = createSyncService<{ id: string; name: string; type: string }>('sync_test')
    service.create({ name: 'a', type: 'x' })
    service.create({ name: 'b', type: 'y' })
    service.create({ name: 'c', type: 'x' })
    const result = service.query((item) => item.type === 'x')
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.type === 'x')).toBe(true)
  })

  it('lida com coleções separadas de forma independente', () => {
    const serviceA = createSyncService<{ id: string; name: string }>('collection_a')
    const serviceB = createSyncService<{ id: string; name: string }>('collection_b')
    serviceA.create({ name: 'from-a' })
    serviceB.create({ name: 'from-b' })
    expect(serviceA.getAll()).toHaveLength(1)
    expect(serviceB.getAll()).toHaveLength(1)
    expect(serviceA.getAll()[0].name).toBe('from-a')
    expect(serviceB.getAll()[0].name).toBe('from-b')
  })
})
