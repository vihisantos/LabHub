import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { resetCache } from '../../../../lib/db'
import { useMovements } from '../useMovements'

beforeEach(() => {
  resetCache()
  localStorage.clear()
})

describe('useMovements', () => {
  it('movements é array vazio inicialmente', () => {
    const { result } = renderHook(() => useMovements())
    expect(result.current.movements).toEqual([])
  })

  it('create adiciona movimentação', () => {
    const { result } = renderHook(() => useMovements())
    act(() => {
      result.current.create({
        itemId: 'item-1',
        itemName: 'Notebook',
        type: 'entrada',
        fromRoom: '',
        toRoom: 'Lab 1',
        description: 'Entrada de notebook',
        replacedPart: '',
        newPart: '',
        performedBy: 'João',
      })
    })
    expect(result.current.movements).toHaveLength(1)
    expect(result.current.movements[0].itemName).toBe('Notebook')
  })

  it('getByItem retorna movimentações de um item', () => {
    const { result } = renderHook(() => useMovements())
    act(() => {
      result.current.create({
        itemId: 'item-1', itemName: 'Notebook', type: 'entrada',
        fromRoom: '', toRoom: 'Lab 1', description: '', replacedPart: '',
        newPart: '', performedBy: '',
      })
      result.current.create({
        itemId: 'item-2', itemName: 'Mouse', type: 'entrada',
        fromRoom: '', toRoom: 'Lab 2', description: '', replacedPart: '',
        newPart: '', performedBy: '',
      })
    })
    const itemMovements = result.current.getByItem('item-1')
    expect(itemMovements).toHaveLength(1)
    expect(itemMovements[0].itemName).toBe('Notebook')
  })

  it('update modifica movimentação', () => {
    const { result } = renderHook(() => useMovements())
    let createdId: string = ''
    act(() => {
      const m = result.current.create({
        itemId: 'item-1', itemName: 'Teclado', type: 'entrada',
        fromRoom: '', toRoom: 'Lab 1', description: '', replacedPart: '',
        newPart: '', performedBy: '',
      })
      createdId = m.id
    })
    act(() => {
      result.current.update(createdId, { description: 'Atualizado' })
    })
    expect(result.current.movements[0].description).toBe('Atualizado')
  })

  it('remove faz soft delete (deletedAt)', () => {
    const { result } = renderHook(() => useMovements())
    let createdId: string = ''
    act(() => {
      const m = result.current.create({
        itemId: 'item-1', itemName: 'Mouse', type: 'entrada',
        fromRoom: '', toRoom: 'Lab 1', description: '', replacedPart: '',
        newPart: '', performedBy: '',
      })
      createdId = m.id
    })
    act(() => {
      result.current.remove(createdId)
    })
    expect(result.current.movements).toHaveLength(0)
  })

  it('reload recarrega dados', () => {
    const { result } = renderHook(() => useMovements())
    act(() => {
      result.current.reload()
    })
    expect(result.current.movements).toEqual([])
  })
})
