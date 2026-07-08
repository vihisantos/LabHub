import { describe, it, expect, beforeEach } from 'vitest'
import { resetCache } from '../../../../lib/db'
import { inventoryService } from '../inventoryService'

beforeEach(() => {
  resetCache()
  localStorage.clear()
})

describe('inventoryService', () => {
  it('getCycles retorna array vazio inicialmente', () => {
    expect(inventoryService.getCycles()).toEqual([])
  })

  it('createCycle adiciona um ciclo', () => {
    const cycle = inventoryService.createCycle({ name: 'Inventário Jan', section: 'maquinas', totalItems: 10 })
    expect(cycle.id).toBeDefined()
    expect(cycle.name).toBe('Inventário Jan')
    expect(cycle.section).toBe('maquinas')
    expect(cycle.status).toBe('in_progress')
    expect(cycle.totalItems).toBe(10)
    expect(cycle.startedAt).toBeDefined()
    expect(cycle.completedAt).toBeNull()
  })

  it('getCycles retorna todos os ciclos criados', () => {
    inventoryService.createCycle({ name: 'Primeiro', section: 'maquinas', totalItems: 5 })
    inventoryService.createCycle({ name: 'Segundo', section: 'perifericos', totalItems: 3 })
    const cycles = inventoryService.getCycles()
    expect(cycles).toHaveLength(2)
    expect(cycles.map((c) => c.name)).toContain('Primeiro')
    expect(cycles.map((c) => c.name)).toContain('Segundo')
  })

  it('getCycle retorna ciclo por id', () => {
    const created = inventoryService.createCycle({ name: 'Test', section: 'cabos', totalItems: 8 })
    const found = inventoryService.getCycle(created.id)
    expect(found).toBeDefined()
    expect(found!.name).toBe('Test')
  })

  it('getCycle retorna undefined para id inexistente', () => {
    expect(inventoryService.getCycle('nonexistent')).toBeUndefined()
  })

  it('completeCycle finaliza um ciclo', () => {
    const created = inventoryService.createCycle({ name: 'Test', section: 'maquinas', totalItems: 10 })
    const updated = inventoryService.completeCycle(created.id, { verifiedCount: 8, missingCount: 1, damagedCount: 1 })
    expect(updated).toBeDefined()
    expect(updated!.status).toBe('completed')
    expect(updated!.completedAt).toBeDefined()
    expect(updated!.verifiedCount).toBe(8)
    expect(updated!.missingCount).toBe(1)
    expect(updated!.damagedCount).toBe(1)
  })

  it('removeCycle remove um ciclo', () => {
    const created = inventoryService.createCycle({ name: 'To Remove', section: 'maquinas', totalItems: 5 })
    inventoryService.removeCycle(created.id)
    expect(inventoryService.getCycle(created.id)).toBeUndefined()
  })

  it('getCounts retorna contagens vazias para ciclo sem counts', () => {
    expect(inventoryService.getCounts('cycle-1')).toEqual([])
  })

  it('saveCount adiciona contagem para um item', () => {
    inventoryService.saveCount({
      id: 'count-1',
      cycleId: 'cycle-1',
      itemId: 'item-1',
      itemName: 'Teclado',
      itemSubcategory: 'Periférico',
      itemSerial: 'SN-001',
      itemRoom: 'Sala 1',
      result: 'verified',
      actualRoom: 'Sala 1',
      notes: '',
      countedAt: null,
    })
    const counts = inventoryService.getCounts('cycle-1')
    expect(counts).toHaveLength(1)
    expect(counts[0].itemId).toBe('item-1')
    expect(counts[0].result).toBe('verified')
  })

  it('saveCount atualiza contagem existente para mesmo item', () => {
    inventoryService.saveCount({
      id: 'count-1',
      cycleId: 'cycle-1',
      itemId: 'item-1',
      itemName: 'Teclado',
      itemSubcategory: 'Periférico',
      itemSerial: 'SN-001',
      itemRoom: 'Sala 1',
      result: 'verified',
      actualRoom: 'Sala 1',
      notes: '',
      countedAt: null,
    })
    inventoryService.saveCount({
      id: 'count-2',
      cycleId: 'cycle-1',
      itemId: 'item-1',
      itemName: 'Teclado',
      itemSubcategory: 'Periférico',
      itemSerial: 'SN-001',
      itemRoom: 'Sala 2',
      result: 'missing',
      actualRoom: 'Sala 2',
      notes: 'Mudou de sala',
      countedAt: null,
    })
    const counts = inventoryService.getCounts('cycle-1')
    expect(counts).toHaveLength(1)
    expect(counts[0].result).toBe('missing')
  })

  it('saveCount mantém contagens separadas por ciclo', () => {
    inventoryService.saveCount({
      id: 'c1', cycleId: 'cycle-1', itemId: 'item-1', itemName: 'Item A',
      itemSubcategory: '', itemSerial: '', itemRoom: '', result: 'verified',
      actualRoom: '', notes: '', countedAt: null,
    })
    inventoryService.saveCount({
      id: 'c2', cycleId: 'cycle-2', itemId: 'item-2', itemName: 'Item B',
      itemSubcategory: '', itemSerial: '', itemRoom: '', result: 'pending',
      actualRoom: '', notes: '', countedAt: null,
    })
    expect(inventoryService.getCounts('cycle-1')).toHaveLength(1)
    expect(inventoryService.getCounts('cycle-2')).toHaveLength(1)
  })
})
