import { describe, it, expect } from 'vitest'
import { roomService } from '../roomService'
import { setCol } from '../../../../lib/db'
import type { Room } from '../../types'

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'room-1',
    name: 'Lab 2',
    location: 'Bloco B',
    assetIds: ['asset-1'],
    workspace_id: 'ws-a',
    createdAt: '2026-06-25T12:00:00Z',
    updatedAt: '2026-06-25T12:00:00Z',
    ...overrides,
  }
}

describe('roomService', () => {
  it('começa vazio e reflete a base local', () => {
    expect(roomService.getAll()).toHaveLength(0)
    setCol('rooms', [makeRoom()])
    expect(roomService.getAll()).toHaveLength(1)
  })

  it('getAllUnfiltered retorna mesmo salas ocultas', () => {
    setCol('rooms', [makeRoom({ id: 'r1' }), makeRoom({ id: 'r2' })])
    expect(roomService.getAllUnfiltered()).toHaveLength(2)
  })

  it('create: serializa com createdAt/updatedAt', () => {
    const room = roomService.create({
      name: 'Sala 202',
      location: 'Bloco A',
      assetIds: [],
      workspace_id: 'ws-a',
    })
    expect(room.id).toBeTruthy()
    expect(room.createdAt).toBeTruthy()
    expect(room.updatedAt).toBeTruthy()
    expect(roomService.getById(room.id)?.name).toBe('Sala 202')
  })

  it('update: modifica campos mantendo id', () => {
    setCol('rooms', [makeRoom()])
    const updated = roomService.update('room-1', { name: 'Lab 3' })
    expect(updated?.name).toBe('Lab 3')
    expect(roomService.getById('room-1')?.name).toBe('Lab 3')
  })

  it('remove: apaga da base', () => {
    setCol('rooms', [makeRoom()])
    expect(roomService.remove('room-1')).toBe(true)
    expect(roomService.getAll()).toHaveLength(0)
  })

  it('query filtra por predicado', () => {
    setCol('rooms', [makeRoom({ id: 'r1', location: 'Bloco A' }), makeRoom({ id: 'r2', location: 'Bloco B' })])
    const result = roomService.query((r) => r.location === 'Bloco A')
    expect(result.map((r) => r.id)).toEqual(['r1'])
  })

  it('create/update exigem escrita (super admin passa)', () => {
    // authService.getCurrentUser global retorna super admin → não lança
    expect(() =>
      roomService.create({ name: 'X', location: '', assetIds: [] }),
    ).not.toThrow()
  })
})
