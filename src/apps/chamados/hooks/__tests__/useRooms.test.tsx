import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Room, RoomFormData } from '../../types'

const mockGetAll = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockRemove = vi.hoisted(() => vi.fn())

vi.mock('../../services/roomService', () => ({
  roomService: { getAll: mockGetAll, create: mockCreate, update: mockUpdate, remove: mockRemove },
}))

import { useRooms } from '../useRooms'

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'r-1',
    name: 'Lab 2',
    location: 'Bloco B',
    assetIds: [],
    workspace_id: 'ws-a',
    createdAt: '2026-06-25T12:00:00Z',
    updatedAt: '2026-06-25T12:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRooms', () => {
  it('carrega e ordena por nome', async () => {
    mockGetAll.mockReturnValue([
      makeRoom({ id: 'a', name: 'Zebra' }),
      makeRoom({ id: 'b', name: 'Alfa' }),
    ])

    const { result } = renderHook(() => useRooms())
    await act(async () => {})

    expect(result.current.rooms.map((r) => r.name)).toEqual(['Alfa', 'Zebra'])
    expect(result.current.loading).toBe(false)
  })

  it('create: adiciona mantendo a ordenação', async () => {
    mockGetAll.mockReturnValue([makeRoom({ id: 'a', name: 'Alfa' })])
    mockCreate.mockReturnValue(makeRoom({ id: 'novo', name: 'Zebra' }))

    const { result } = renderHook(() => useRooms())
    await act(async () => {})

    act(() => {
      result.current.create({ name: 'Zebra', location: '', assetIds: [] } as RoomFormData)
    })

    expect(result.current.rooms.map((r) => r.name)).toEqual(['Alfa', 'Zebra'])
  })

  it('update: substitui a sala atualizada', async () => {
    mockGetAll.mockReturnValue([makeRoom({ id: 'a', name: 'Alfa' })])
    mockUpdate.mockReturnValue(makeRoom({ id: 'a', name: 'Bravo' }))

    const { result } = renderHook(() => useRooms())
    await act(async () => {})

    act(() => {
      result.current.update('a', { name: 'Bravo' })
    })

    expect(result.current.rooms[0].name).toBe('Bravo')
  })

  it('remove: filtra a sala removida', async () => {
    mockGetAll.mockReturnValue([makeRoom({ id: 'a' }), makeRoom({ id: 'b' })])
    mockRemove.mockReturnValue(true)

    const { result } = renderHook(() => useRooms())
    await act(async () => {})

    act(() => {
      result.current.remove('a')
    })

    expect(result.current.rooms.map((r) => r.id)).toEqual(['b'])
  })
})
