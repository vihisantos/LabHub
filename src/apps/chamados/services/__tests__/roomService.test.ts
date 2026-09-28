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

  it('query filtra por predicado', () => {
    setCol('rooms', [makeRoom({ id: 'r1', location: 'Bloco A' }), makeRoom({ id: 'r2', location: 'Bloco B' })])
    const result = roomService.query((r) => r.location === 'Bloco A')
    expect(result.map((r) => r.id)).toEqual(['r1'])
  })

  // F2-D-N2: `create`/`update`/`remove` foram removidos do service. Eles guardavam
  // escrita com `permissionService.requireWrite('chamados')`, gate legado que
  // decidia por `Role.appAccess`/`profiles.app_access`; o único caminho que os
  // chamava era o hook `useRooms`, que não tinha consumidor de produção. Não
  // foram recriados como Action: a tabela `rooms` é local-only e nenhuma tela
  // do produto edita salas.
  it('não expõe mais nenhum método de escrita', () => {
    expect(Object.keys(roomService).sort()).toEqual([
      'getAll',
      'getAllUnfiltered',
      'getById',
      'query',
    ])
  })
})
