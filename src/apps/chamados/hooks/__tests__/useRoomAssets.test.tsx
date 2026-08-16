import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockGetByRoom = vi.hoisted(() => vi.fn())

vi.mock('../../../../core/assets/service', () => ({
  assetService: { getByRoom: mockGetByRoom },
}))

import { useRoomAssets } from '../useRoomAssets'

function makeAsset(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'asset-1',
    source: 'stock',
    name: 'PC-02',
    type: 'Computador',
    subcategory: 'Desktop',
    patrimony: 'PC-02',
    room: 'Lab 2',
    status: 'ativo',
    openTickets: 0,
    lastTicketAt: null,
    createdAt: '2026-06-25T12:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRoomAssets', () => {
  it('sem sala → nenhum ativo', () => {
    const { result } = renderHook(() => useRoomAssets(''))
    expect(result.current.assets).toEqual([])
    expect(result.current.grouped).toEqual({})
    expect(mockGetByRoom).not.toHaveBeenCalled()
  })

  it('agrupa por categoria segundo o subcategory', () => {
    mockGetByRoom.mockReturnValue([
      makeAsset({ id: 'a', subcategory: 'Desktop' }),
      makeAsset({ id: 'b', subcategory: 'Projetor' }),
      makeAsset({ id: 'c', subcategory: 'Cabo HDMI' }),
      makeAsset({ id: 'd', subcategory: 'Tipo desconhecido' }),
    ])

    const { result } = renderHook(() => useRoomAssets('Lab 2'))

    expect(mockGetByRoom).toHaveBeenCalledWith('Lab 2')
    expect(result.current.assets).toHaveLength(4)
    expect(Object.keys(result.current.grouped).sort()).toEqual([
      'Cabos',
      'Equipamentos',
      'Multimídia',
      'Outros',
    ])
    expect(result.current.grouped['Equipamentos'].map((a) => a.id)).toEqual(['a'])
    expect(result.current.grouped['Outros'].map((a) => a.id)).toEqual(['d'])
  })

  it('recalcula quando a sala muda', () => {
    mockGetByRoom.mockReturnValue([makeAsset()])
    const { rerender, result } = renderHook(({ room }: { room: string }) => useRoomAssets(room), {
      initialProps: { room: 'Sala 101' },
    })
    expect(mockGetByRoom).toHaveBeenCalledWith('Sala 101')

    rerender({ room: 'Lab 2' })
    expect(mockGetByRoom).toHaveBeenLastCalledWith('Lab 2')
    expect(result.current.assets).toHaveLength(1)
  })
})
