import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { resetCache } from '../../../../lib/db'
import { useKits } from '../useKits'

beforeEach(() => {
  resetCache()
  localStorage.clear()
})

describe('useKits', () => {
  it('kits é array vazio inicialmente', () => {
    const { result } = renderHook(() => useKits())
    expect(result.current.kits).toEqual([])
  })

  it('create adiciona kit à lista', () => {
    const { result } = renderHook(() => useKits())
    act(() => {
      result.current.create({
        name: 'Kit Emergência',
        room: 'Sala 5',
        items: [{ name: 'Luvas', expected: 10, present: false }],
      })
    })
    expect(result.current.kits).toHaveLength(1)
    expect(result.current.kits[0].name).toBe('Kit Emergência')
  })

  it('create retorna o kit criado', () => {
    const { result } = renderHook(() => useKits())
    let kit: any
    act(() => {
      kit = result.current.create({
        name: 'Kit Rede',
        room: 'Sala 3',
        items: [{ name: 'Cabo RJ45', expected: 5, present: false }],
      })
    })
    expect(kit.name).toBe('Kit Rede')
    expect(kit.id).toBeDefined()
    expect(kit.status).toBe('nao_conferido')
  })

  it('update modifica kit existente', () => {
    const { result } = renderHook(() => useKits())
    let createdId: string = ''
    act(() => {
      const k = result.current.create({
        name: 'Kit Teste', room: 'Lab A',
        items: [{ name: 'Item 1', expected: 2, present: false }],
      })
      createdId = k.id
    })
    act(() => {
      result.current.update(createdId, { room: 'Lab B' })
    })
    expect(result.current.kits[0].room).toBe('Lab B')
  })

  it('remove deleta kit', () => {
    const { result } = renderHook(() => useKits())
    let createdId: string = ''
    act(() => {
      const k = result.current.create({
        name: 'To Remove', room: 'X',
        items: [{ name: 'Item', expected: 1, present: false }],
      })
      createdId = k.id
    })
    act(() => {
      result.current.remove(createdId)
    })
    expect(result.current.kits).toHaveLength(0)
  })
})
