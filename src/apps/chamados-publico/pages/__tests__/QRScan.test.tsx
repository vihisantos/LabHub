import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '../../../../test/helpers'
import type { Room } from '../../../chamados/types'

const mockUseRooms = vi.hoisted(() => vi.fn())

vi.mock('../../../chamados/hooks/useRooms', () => ({ useRooms: mockUseRooms }))

let decodeCb: ((result: { getText: () => string }) => void) | null = null
const mockDecode = vi.hoisted(() => vi.fn())
const mockStop = vi.hoisted(() => vi.fn())

vi.mock('@zxing/browser', () => ({
  BrowserQRCodeReader: class {
    decodeFromVideoDevice = mockDecode
  },
}))

import { QRScan } from '../QRScan'

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

function renderScan(path = '/chamados-publico/scan') {
  return renderWithProviders(
    <Routes>
      <Route path="/chamados-publico" element={<div>inicio</div>} />
      <Route path="/chamados-publico/scan" element={<QRScan />} />
      <Route path="/chamados-publico/room/:roomId" element={<div>pagina da sala</div>} />
      <Route path="/chamados-publico/new" element={<div>formulario novo</div>} />
    </Routes>,
    { initialEntries: [path] },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  decodeCb = null
  mockUseRooms.mockReturnValue({ rooms: [makeRoom()] })
  mockDecode.mockImplementation((_device: unknown, _video: unknown, cb: (r: unknown) => void) => {
    decodeCb = cb as (result: { getText: () => string }) => void
    return Promise.resolve({ stop: mockStop })
  })
})

describe('QRScan', () => {
  it('renderiza a tela de escaneamento', async () => {
    renderScan()
    await act(async () => {})

    expect(screen.getByText('Abrir Chamado')).toBeInTheDocument()
    expect(screen.getByText('Escaneie o QR Code da sala')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ex: Sala 101')).toBeInTheDocument()
  })

  it('entrada manual com sala conhecida navega', async () => {
    renderScan()
    await act(async () => {})

    fireEvent.change(screen.getByPlaceholderText('Ex: Sala 101'), { target: { value: 'Lab 2' } })
    fireEvent.click(screen.getByText('Continuar'))

    expect(screen.getByText('Redirecionando...')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByText('pagina da sala')).toBeInTheDocument()
  })

  it('entrada manual com sala desconhecida mostra erro', async () => {
    renderScan()
    await act(async () => {})

    fireEvent.change(screen.getByPlaceholderText('Ex: Sala 101'), { target: { value: 'Sala X' } })
    fireEvent.click(screen.getByText('Continuar'))

    expect(screen.getByText('Sala não encontrada')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma sala encontrada com esse código')).toBeInTheDocument()
  })

  it('QR com parâmetro room navega direto para a sala', async () => {
    renderScan('/chamados-publico/scan?room=Lab%202')
    await act(async () => {})

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByText('pagina da sala')).toBeInTheDocument()
  })

  it('decodifica QR de URL /new e redireciona para o formulário', async () => {
    renderScan()
    await act(async () => {})

    act(() => {
      decodeCb?.({ getText: () => 'https://labhub.app/chamados-publico/new?room=Lab%202' })
    })
    await act(async () => {})

    expect(screen.getByText('Redirecionando...')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByText('formulario novo')).toBeInTheDocument()
  })

  it('decodifica QR legado "room:"', async () => {
    renderScan()
    await act(async () => {})

    act(() => {
      decodeCb?.({ getText: () => 'room:r-1' })
    })
    await act(async () => {})

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByText('pagina da sala')).toBeInTheDocument()
  })
})
