import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '../../../../test/helpers'
import type { Room } from '../../types'

const mockIsFullAccess = vi.hoisted(() => vi.fn())
const mockUseRooms = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockStockGetAll = vi.hoisted(() => vi.fn())
const mockPcGetAll = vi.hoisted(() => vi.fn())

vi.mock('../../../../core/permissions/usePermissions', () => ({
  useAppAccess: () => ({
    role: { id: 'r', name: 'Administrador', key: 'admin', appAccess: {} },
    getLevel: () => 'full',
    canAccessApp: () => true,
    isFullAccess: mockIsFullAccess,
    canManageQr: () => true,
  }),
}))
vi.mock('../../hooks/useRooms', () => ({ useRooms: mockUseRooms }))
vi.mock('../../../stock/services/stockService', () => ({ stockService: { getAll: mockStockGetAll } }))
vi.mock('../../../pcare/services/pcService', () => ({ pcService: { getAll: mockPcGetAll } }))

import { RoomForm } from '../RoomForm'

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

function renderForm(path: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/chamados/rooms" element={<div>lista de salas</div>} />
      <Route path="/chamados/rooms/new" element={<RoomForm />} />
      <Route path="/chamados/rooms/:id/edit" element={<RoomForm />} />
    </Routes>,
    { initialEntries: [path] },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsFullAccess.mockReturnValue(true)
  mockUseRooms.mockReturnValue({ rooms: [], create: mockCreate, update: mockUpdate })
  mockStockGetAll.mockReturnValue([])
  mockPcGetAll.mockReturnValue([])
})

describe('RoomForm', () => {
  it('bloqueia edição sem permissão', () => {
    mockIsFullAccess.mockReturnValue(false)
    renderForm('/chamados/rooms/new')

    expect(screen.getByText('Acesso somente leitura')).toBeInTheDocument()
  })

  it('cria uma sala nova', () => {
    renderForm('/chamados/rooms/new')

    fireEvent.change(screen.getByPlaceholderText('Ex: Sala 101'), { target: { value: 'Lab 2' } })
    fireEvent.click(screen.getByText('Criar Sala'))

    expect(mockCreate).toHaveBeenCalledWith({ name: 'Lab 2', location: '', assetIds: [] })
    expect(screen.getByText('lista de salas')).toBeInTheDocument()
  })

  it('edita uma sala existente com os dados preenchidos', () => {
    mockUseRooms.mockReturnValue({
      rooms: [makeRoom()],
      create: mockCreate,
      update: mockUpdate,
    })
    renderForm('/chamados/rooms/r-1/edit')

    const nameInput = screen.getByPlaceholderText('Ex: Sala 101') as HTMLInputElement
    expect(nameInput.value).toBe('Lab 2')
    expect(screen.getByText('Salvar')).toBeInTheDocument()

    fireEvent.change(nameInput, { target: { value: 'Lab 3' } })
    fireEvent.click(screen.getByText('Salvar'))

    expect(mockUpdate).toHaveBeenCalledWith('r-1', { name: 'Lab 3', location: 'Bloco B', assetIds: [] })
  })

  it('seleciona e remove equipamentos vinculados', () => {
    mockStockGetAll.mockReturnValue([
      { id: 'st-1', name: 'Projetor Epson', subcategory: 'Projetor', room: 'Lab 2' },
    ])
    mockPcGetAll.mockReturnValue([
      { id: 'pc-1', labName: 'Lab A', pcNumber: 'PC-01', roomLocation: 'Sala 101' },
    ])
    renderForm('/chamados/rooms/new')

    expect(screen.getByText('Equipamentos Vinculados (0)')).toBeInTheDocument()
    expect(screen.getByText('Projetor Epson')).toBeInTheDocument()
    expect(screen.getByText('Lab A — PC-01')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Projetor Epson/ }))
    expect(screen.getByText('Equipamentos Vinculados (1)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Projetor Epson/ }))
    expect(screen.getByText('Equipamentos Vinculados (0)')).toBeInTheDocument()
  })

  it('filtra a busca de equipamentos', () => {
    mockStockGetAll.mockReturnValue([
      { id: 'st-1', name: 'Projetor Epson', subcategory: 'Projetor', room: 'Lab 2' },
      { id: 'st-2', name: 'Roteador', subcategory: 'Rede', room: 'Lab 2' },
    ])
    renderForm('/chamados/rooms/new')

    fireEvent.change(screen.getByPlaceholderText('Buscar equipamento...'), { target: { value: 'rote' } })
    expect(screen.getByText('Roteador')).toBeInTheDocument()
    expect(screen.queryByText('Projetor Epson')).not.toBeInTheDocument()
  })
})
