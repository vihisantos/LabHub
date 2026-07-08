import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStockSelection } from '../useStockSelection'

describe('useStockSelection', () => {
  it('selectMode é false inicialmente', () => {
    const { result } = renderHook(() => useStockSelection())
    expect(result.current.selectMode).toBe(false)
  })

  it('selected é Set vazio inicialmente', () => {
    const { result } = renderHook(() => useStockSelection())
    expect(result.current.selected.size).toBe(0)
  })

  it('enter ativa o modo de seleção', () => {
    const { result } = renderHook(() => useStockSelection())
    act(() => { result.current.enter() })
    expect(result.current.selectMode).toBe(true)
  })

  it('exit desativa o modo e limpa seleção', () => {
    const { result } = renderHook(() => useStockSelection())
    act(() => { result.current.enter() })
    act(() => { result.current.toggle('item-1') })
    act(() => { result.current.exit() })
    expect(result.current.selectMode).toBe(false)
    expect(result.current.selected.size).toBe(0)
  })

  it('toggle adiciona item ao conjunto', () => {
    const { result } = renderHook(() => useStockSelection())
    act(() => { result.current.toggle('item-1') })
    expect(result.current.selected.has('item-1')).toBe(true)
  })

  it('toggle remove item se já existe', () => {
    const { result } = renderHook(() => useStockSelection())
    act(() => { result.current.toggle('item-1') })
    act(() => { result.current.toggle('item-1') })
    expect(result.current.selected.has('item-1')).toBe(false)
  })

  it('toggleAll seleciona todos os ids', () => {
    const { result } = renderHook(() => useStockSelection())
    act(() => { result.current.toggleAll(['a', 'b', 'c']) })
    expect(result.current.selected.size).toBe(3)
    expect(result.current.selected.has('a')).toBe(true)
    expect(result.current.selected.has('b')).toBe(true)
    expect(result.current.selected.has('c')).toBe(true)
  })

  it('toggleAll desseleciona se todos já estão selecionados', () => {
    const { result } = renderHook(() => useStockSelection())
    act(() => { result.current.toggleAll(['a', 'b']) })
    act(() => { result.current.toggleAll(['a', 'b']) })
    expect(result.current.selected.size).toBe(0)
  })

  it('clear limpa a seleção', () => {
    const { result } = renderHook(() => useStockSelection())
    act(() => { result.current.toggleAll(['a', 'b']) })
    act(() => { result.current.clear() })
    expect(result.current.selected.size).toBe(0)
  })

  it('setSelectMode define modo manualmente', () => {
    const { result } = renderHook(() => useStockSelection())
    act(() => { result.current.setSelectMode(true) })
    expect(result.current.selectMode).toBe(true)
  })
})
