import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/helpers'
import type { Room } from '../../types'

const mockUseRooms = vi.hoisted(() => vi.fn())
const mockUseRoomAssets = vi.hoisted(() => vi.fn())
const mockGetOpenByRoom = vi.hoisted(() => vi.fn())

vi.mock('../../hooks/useRooms', () => ({ useRooms: mockUseRooms }))
vi.mock('../../hooks/useRoomAssets', () => ({ useRoomAssets: mockUseRoomAssets }))
vi.mock('../../services/ticketService', () => ({ ticketService: { getOpenByRoom: mockGetOpenByRoom } }))

import { RoomList } from '../RoomList'

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'r-1',
    name: 'Lab 2',
    location: '',
    assetIds: [],
    workspace_id: 'ws-a',
    createdAt: '2026-06-25T12:00:00Z',
    updatedAt: '2026-06-25T12:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseRoomAssets.mockReturnValue({ assets: [], grouped: {} })
  mockGetOpenByRoom.mockReturnValue([])
})

describe('RoomList', () => {
  it('estado vazio', () => {
    mockUseRooms.mockReturnValue({ rooms: [] })
    renderWithProviders(<RoomList />)

    expect(screen.getByText('Nenhuma sala cadastrada')).toBeInTheDocument()
    expect(screen.getByText('0 salas')).toBeInTheDocument()
  })

  it('ordena salas por nome e mostra o contador', () => {
    mockUseRooms.mockReturnValue({
      rooms: [makeRoom({ id: 'b', name: 'Zebra' }), makeRoom({ id: 'a', name: 'Alfa' })],
    })
    renderWithProviders(<RoomList />)

    const names = screen.getAllByText(/^(Alfa|Zebra)$/)
    expect(names.map((n) => n.textContent)).toEqual(['Alfa', 'Zebra'])
    expect(screen.getByText('2 salas')).toBeInTheDocument()
  })

  it('mostra localização e quantidade de ativos da sala', () => {
    mockUseRooms.mockReturnValue({ rooms: [makeRoom({ name: 'Lab 2', location: 'Bloco B' })] })
    mockUseRoomAssets.mockReturnValue({
      assets: [],
      grouped: { Equipamentos: [{ id: 'a' }, { id: 'b' }], Multimídia: [{ id: 'c' }] },
    })
    renderWithProviders(<RoomList />)

    expect(screen.getByText('Bloco B · 3 ativos')).toBeInTheDocument()
  })

  it('mostra badge de chamados abertos da sala', () => {
    mockUseRooms.mockReturnValue({ rooms: [makeRoom({ name: 'Lab 2' })] })
    mockGetOpenByRoom.mockReturnValue([{ id: 't-1' }, { id: 't-2' }])
    renderWithProviders(<RoomList />)

    expect(screen.getByText('2 chamados')).toBeInTheDocument()
  })

  it('permite criar nova sala com acesso completo', () => {
    mockUseRooms.mockReturnValue({ rooms: [] })
    renderWithProviders(<RoomList />)

    expect(screen.getByText('Nova Sala')).toBeInTheDocument()
  })

  it('mostra o botão de edição na sala', () => {
    mockUseRooms.mockReturnValue({ rooms: [makeRoom({ name: 'Lab 2' })] })
    renderWithProviders(<RoomList />)

    const roomButton = screen.getByText('Lab 2').closest('button')
    expect(roomButton).not.toBeNull()
    expect(within(roomButton as HTMLElement).getByText('Lab 2')).toBeInTheDocument()
  })
})
