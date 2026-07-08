import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { resetCache } from '../../../../lib/db'
import { useInventory, useInventoryCounts } from '../useInventory'

beforeEach(() => {
  resetCache()
  localStorage.clear()
})

describe('useInventory', () => {
  it('cycles é array vazio inicialmente', () => {
    const { result } = renderHook(() => useInventory())
    expect(result.current.cycles).toEqual([])
  })

  it('createCycle adiciona ciclo', () => {
    const { result } = renderHook(() => useInventory())
    act(() => {
      result.current.createCycle({ name: 'Inventário Jan', section: 'maquinas', totalItems: 10 })
    })
    expect(result.current.cycles).toHaveLength(1)
    expect(result.current.cycles[0].name).toBe('Inventário Jan')
    expect(result.current.cycles[0].status).toBe('in_progress')
  })

  it('completeCycle finaliza ciclo', () => {
    const { result } = renderHook(() => useInventory())
    let cycleId: string = ''
    act(() => {
      const c = result.current.createCycle({ name: 'Test', section: 'perifericos', totalItems: 5 })
      cycleId = c.id
    })
    act(() => {
      result.current.completeCycle(cycleId, { verifiedCount: 4, missingCount: 1, damagedCount: 0 })
    })
    const cycle = result.current.cycles[0]
    expect(cycle.status).toBe('completed')
    expect(cycle.verifiedCount).toBe(4)
  })

  it('removeCycle remove ciclo', () => {
    const { result } = renderHook(() => useInventory())
    let cycleId: string = ''
    act(() => {
      const c = result.current.createCycle({ name: 'To Remove', section: 'cabos', totalItems: 3 })
      cycleId = c.id
    })
    act(() => {
      result.current.removeCycle(cycleId)
    })
    expect(result.current.cycles).toHaveLength(0)
  })
})

describe('useInventoryCounts', () => {
  it('counts é array vazio inicialmente', () => {
    const { result } = renderHook(() => useInventoryCounts('cycle-1'))
    expect(result.current.counts).toEqual([])
  })

  it('saveCount adiciona contagem', () => {
    const { result } = renderHook(() => useInventoryCounts('cycle-1'))
    act(() => {
      result.current.saveCount({
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
    })
    expect(result.current.counts).toHaveLength(1)
    expect(result.current.counts[0].itemName).toBe('Teclado')
  })

  it('saveCount atualiza contagem existente', () => {
    const { result } = renderHook(() => useInventoryCounts('cycle-1'))
    act(() => {
      result.current.saveCount({
        id: 'c1', cycleId: 'cycle-1', itemId: 'item-1', itemName: 'Teclado',
        itemSubcategory: '', itemSerial: '', itemRoom: '', result: 'verified',
        actualRoom: '', notes: '', countedAt: null,
      })
    })
    act(() => {
      result.current.saveCount({
        id: 'c2', cycleId: 'cycle-1', itemId: 'item-1', itemName: 'Teclado',
        itemSubcategory: '', itemSerial: '', itemRoom: '', result: 'missing',
        actualRoom: 'Sala 2', notes: '', countedAt: null,
      })
    })
    expect(result.current.counts).toHaveLength(1)
    expect(result.current.counts[0].result).toBe('missing')
  })
})
