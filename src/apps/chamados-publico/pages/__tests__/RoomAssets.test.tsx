import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '../../../../test/helpers'
import type { Room } from '../../../chamados/types'
import type { RoomAsset } from '../../../chamados/hooks/useRoomAssets'

const mockUseRooms = vi.hoisted(() => vi.fn())
const mockUseRoomAssets = vi.hoisted(() => vi.fn())
const mockGetOpenByAsset = vi.hoisted(() => vi.fn())

vi.mock('../../../chamados/hooks/useRooms', () => ({ useRooms: mockUseRooms }))
vi.mock('../../../chamados/hooks/useRoomAssets', () => ({ useRoomAssets: mockUseRoomAssets }))
vi.mock('../../../chamados/services/ticketService', () => ({ ticketService: { getOpenByAsset: mockGetOpenByAsset } }))

import { RoomAssets } from '../RoomAssets'

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

function makeAsset(overrides: Partial<RoomAsset> = {}): RoomAsset {
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

function renderRoomAssets() {
  return renderWithProviders(
    <Routes>
      <Route path="/chamados-publico" element={<div>inicio</div>} />
      <Route path="/chamados-publico/room/:roomId" element={<RoomAssets />} />
      <Route path="/chamados-publico/new-asset" element={<div>novo chamado asset</div>} />
    </Routes>,
    { initialEntries: ['/chamados-publico/room/r-1'] },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseRooms.mockReturnValue({ rooms: [makeRoom()] })
  mockUseRoomAssets.mockReturnValue({ assets: [], grouped: {} })
  mockGetOpenByAsset.mockReturnValue([])
})

describe('RoomAssets', () => {
  it('sala não encontrada', () => {
    mockUseRooms.mockReturnValue({ rooms: [] })
    renderRoomAssets()

    expect(screen.getByText('Sala não encontrada')).toBeInTheDocument()
    expect(screen.getByText('Escanear novamente')).toBeInTheDocument()
  })

  it('agrupa equipamentos por categoria ordenada', () => {
    mockUseRoomAssets.mockReturnValue({
      assets: [makeAsset({ id: 'a' }), makeAsset({ id: 'b', subcategory: 'Projetor', name: 'Projetor 1' })],
      grouped: {
        Equipamentos: [makeAsset({ id: 'a' })],
        Multimídia: [makeAsset({ id: 'b', subcategory: 'Projetor', name: 'Projetor 1' })],
      },
    })
    renderRoomAssets()

    expect(screen.getByText('Lab 2')).toBeInTheDocument()
    expect(screen.getByText('Bloco B')).toBeInTheDocument()
    expect(screen.getByText('2 equipamentos encontrados')).toBeInTheDocument()
    expect(screen.getByText('PC-02')).toBeInTheDocument()
    expect(screen.getByText('Projetor 1')).toBeInTheDocument()
  })

  it('sem equipamentos vinculados', () => {
    renderRoomAssets()

    expect(screen.getByText('Nenhum equipamento vinculado a esta sala')).toBeInTheDocument()
  })

  it('mostra badge de chamados abertos do ativo', () => {
    mockUseRoomAssets.mockReturnValue({
      assets: [makeAsset()],
      grouped: { Equipamentos: [makeAsset()] },
    })
    mockGetOpenByAsset.mockReturnValue([{ id: 't-1' }])
    renderRoomAssets()

    expect(screen.getByText('1 aberto')).toBeInTheDocument()
  })

  it('navega para novo chamado do ativo', () => {
    mockUseRoomAssets.mockReturnValue({
      assets: [makeAsset()],
      grouped: { Equipamentos: [makeAsset()] },
    })
    renderRoomAssets()

    fireEvent.click(screen.getByRole('button', { name: /PC-02/ }))
    expect(screen.getByText('novo chamado asset')).toBeInTheDocument()
  })
})
