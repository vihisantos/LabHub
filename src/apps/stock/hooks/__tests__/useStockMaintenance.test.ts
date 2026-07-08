import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { resetCache } from '../../../../lib/db'
import { useStockMaintenance } from '../useStockMaintenance'

beforeEach(() => {
  resetCache()
  localStorage.clear()
})

describe('useStockMaintenance', () => {
  it('all é array vazio inicialmente', () => {
    const { result } = renderHook(() => useStockMaintenance())
    expect(result.current.all).toEqual([])
  })

  it('create adiciona manutenção', () => {
    const { result } = renderHook(() => useStockMaintenance())
    act(() => {
      result.current.create({
        itemId: 'item-1',
        itemName: 'Notebook Dell',
        itemSection: 'maquinas',
        type: 'preventiva',
        scheduledDate: new Date(Date.now() + 86400000).toISOString(),
        notes: 'Limpeza',
        performedBy: 'João',
      })
    })
    expect(result.current.all).toHaveLength(1)
    expect(result.current.all[0].itemName).toBe('Notebook Dell')
  })

  it('update modifica manutenção', () => {
    const { result } = renderHook(() => useStockMaintenance())
    let createdId: string = ''
    act(() => {
      const m = result.current.create({
        itemId: 'item-1', itemName: 'Mouse', itemSection: 'perifericos',
        type: 'corretiva', scheduledDate: new Date().toISOString(),
        notes: 'Conserto', performedBy: 'Maria',
      })
      createdId = m.id
    })
    act(() => {
      result.current.update(createdId, { notes: 'Atualizado' })
    })
    expect(result.current.all[0].notes).toBe('Atualizado')
  })

  it('complete finaliza manutenção', () => {
    const { result } = renderHook(() => useStockMaintenance())
    let createdId: string = ''
    act(() => {
      const m = result.current.create({
        itemId: 'item-1', itemName: 'Monitor', itemSection: 'maquinas',
        type: 'inspecao', scheduledDate: new Date().toISOString(),
        notes: 'Inspeção', performedBy: 'João',
      })
      createdId = m.id
    })
    act(() => {
      result.current.complete(createdId)
    })
    expect(result.current.all[0].completed).toBe(true)
    expect(result.current.all[0].completedAt).toBeDefined()
  })

  it('remove deleta manutenção', () => {
    const { result } = renderHook(() => useStockMaintenance())
    let createdId: string = ''
    act(() => {
      const m = result.current.create({
        itemId: 'item-1', itemName: 'Teclado', itemSection: 'perifericos',
        type: 'preventiva', scheduledDate: new Date().toISOString(),
        notes: 'Limpeza', performedBy: 'Ana',
      })
      createdId = m.id
    })
    act(() => {
      result.current.remove(createdId)
    })
    expect(result.current.all).toHaveLength(0)
  })

  it('upcoming retorna apenas não concluídas', () => {
    const { result } = renderHook(() => useStockMaintenance())
    act(() => {
      const m = result.current.create({
        itemId: 'item-1', itemName: 'PC', itemSection: 'maquinas',
        type: 'preventiva', scheduledDate: new Date(Date.now() + 86400000).toISOString(),
        notes: 'Futura', performedBy: '',
      })
      result.current.complete(m.id)
      result.current.create({
        itemId: 'item-2', itemName: 'Mouse', itemSection: 'perifericos',
        type: 'corretiva', scheduledDate: new Date(Date.now() + 172800000).toISOString(),
        notes: 'Pendente', performedBy: '',
      })
    })
    expect(result.current.upcoming).toHaveLength(1)
    expect(result.current.upcoming[0].notes).toBe('Pendente')
  })

  it('overdue retorna manutenções atrasadas', () => {
    const { result } = renderHook(() => useStockMaintenance())
    act(() => {
      result.current.create({
        itemId: 'item-1', itemName: 'PC', itemSection: 'maquinas',
        type: 'preventiva', scheduledDate: new Date(Date.now() - 86400000).toISOString(),
        notes: 'Atrasada', performedBy: '',
      })
      result.current.create({
        itemId: 'item-2', itemName: 'Mouse', itemSection: 'perifericos',
        type: 'preventiva', scheduledDate: new Date(Date.now() + 86400000).toISOString(),
        notes: 'Futura', performedBy: '',
      })
    })
    expect(result.current.overdue).toHaveLength(1)
    expect(result.current.overdue[0].notes).toBe('Atrasada')
  })
})
