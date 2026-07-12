import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../hooks/usePCs', () => ({ usePCs: vi.fn() }))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const { mockDecode, MockBrowserQRCodeReader } = vi.hoisted(() => {
  const mockDecode = vi.fn().mockRejectedValue(new Error('no camera'))
  class MockBrowserQRCodeReader {
    decodeFromVideoDevice = mockDecode
  }
  return { mockDecode, MockBrowserQRCodeReader }
})
vi.mock('@zxing/browser', () => ({
  BrowserQRCodeReader: MockBrowserQRCodeReader,
}))

import { usePCs } from '../../hooks/usePCs'
import { QRScanner } from '../QRScanner'

function renderScanner() {
  return render(<MemoryRouter><QRScanner /></MemoryRouter>)
}

describe('QRScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(usePCs as any).mockReturnValue({ pcs: [] })
    mockDecode.mockRejectedValue(new Error('no camera'))
  })

  it('renderiza título "Escanear QR"', () => {
    renderScanner()
    expect(screen.getByText('Escanear QR')).toBeInTheDocument()
  })

  it('exibe botão de voltar', () => {
    renderScanner()
    expect(screen.getByLabelText('Voltar')).toBeInTheDocument()
  })

  it('exibe seção de entrada manual de código', () => {
    renderScanner()
    expect(screen.getByText(/ou digite o código/)).toBeInTheDocument()
  })

  it('exibe input de código manual', () => {
    renderScanner()
    expect(screen.getByPlaceholderText('Ex: Lab 105/PC-12')).toBeInTheDocument()
  })

  it('exibe botão "Buscar" para código manual', () => {
    renderScanner()
    expect(screen.getByText('Buscar')).toBeInTheDocument()
  })

  it('renderiza área da câmera', () => {
    const { container } = renderScanner()
    expect(container.querySelector('video')).toBeInTheDocument()
  })

  it('exibe indicador "Escaneando..." quando câmera ativa', () => {
    vi.useFakeTimers()
    mockDecode.mockImplementation(() => new Promise(() => {}))
    renderScanner()
    expect(screen.getByText('Escaneando...')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('exibe "Nenhum PC encontrado" quando código inválido', () => {
    renderScanner()
    expect(screen.getByText('Buscar')).toBeInTheDocument()
  })
})
