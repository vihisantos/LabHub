import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../services/partService', () => ({
  partService: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

import { useParts } from '../useParts'
import type { Part } from '../../types/part'
import { partService } from '../../services/partService'

const mockPart: Part = {
  id: 'part-1',
  name: 'Teclado',
  category: 'periferico',
  quantity: 10,
  minQuantity: 2,
  notes: 'Teclados USB padrão',
  createdAt: '2026-01-10T10:00:00Z',
  updatedAt: '2026-01-10T10:00:00Z',
}

describe('useParts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(partService.getAll as any).mockReturnValue([mockPart])
    ;(partService.create as any).mockReturnValue(mockPart)
    ;(partService.update as any).mockReturnValue(mockPart)
    ;(partService.remove as any).mockReturnValue(true)
  })

  it('carrega peças no mount', () => {
    const { result } = renderHook(() => useParts())
    expect(result.current.loading).toBe(false)
    expect(result.current.parts).toHaveLength(1)
    expect(result.current.parts[0].name).toBe('Teclado')
  })

  it('cria uma nova peça', () => {
    const { result } = renderHook(() => useParts())
    act(() => {
      result.current.create({
        name: 'Mouse',
        category: 'periferico',
        quantity: 5,
        minQuantity: 1,
      })
    })
    expect(partService.create).toHaveBeenCalled()
    expect(result.current.parts).toHaveLength(2)
  })

  it('atualiza uma peça existente', () => {
    const { result } = renderHook(() => useParts())
    act(() => {
      result.current.update('part-1', { quantity: 8 })
    })
    expect(partService.update).toHaveBeenCalledWith('part-1', { quantity: 8 })
  })

  it('remove uma peça', () => {
    const { result } = renderHook(() => useParts())
    act(() => {
      result.current.remove('part-1')
    })
    expect(partService.remove).toHaveBeenCalledWith('part-1')
    expect(result.current.parts).toHaveLength(0)
  })

  it('reload recarrega as peças', () => {
    const { result } = renderHook(() => useParts())
    ;(partService.getAll as any).mockReturnValue([])
    act(() => {
      result.current.reload()
    })
    expect(result.current.parts).toHaveLength(0)
  })

  it('update não altera lista se retornar null', () => {
    ;(partService.update as any).mockReturnValue(null)
    const { result } = renderHook(() => useParts())
    act(() => {
      result.current.update('part-1', { quantity: 8 })
    })
    expect(result.current.parts).toHaveLength(1)
  })

  it('remove não altera lista se retornar false', () => {
    ;(partService.remove as any).mockReturnValue(false)
    const { result } = renderHook(() => useParts())
    act(() => {
      result.current.remove('part-1')
    })
    expect(result.current.parts).toHaveLength(1)
  })
})
