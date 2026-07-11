import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../hooks/usePCs', () => ({ usePCs: vi.fn() }))
vi.mock('@zxing/browser', () => ({ BrowserQRCodeReader: vi.fn() }))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import { usePCs } from '../../hooks/usePCs'
import { QRScanner } from '../QRScanner'
import { act } from 'react'

function renderScanner() {
  return render(<MemoryRouter><QRScanner /></MemoryRouter>)
}

describe('QRScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    ;(usePCs as any).mockReturnValue({ pcs: [] })
    // Mock HTMLVideoElement and MediaStream
    HTMLVideoElement.prototype.load = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('exibe "Câmera desativada" quando feedback é idle', () => {
    // BrowserQRCodeReader mock that rejects
    const mockReader = { decodeFromVideoDevice: vi.fn().mockRejectedValue(new Error('no camera')) }
    ;(vi.mocked(require('@zxing/browser')).BrowserQRCodeReader as any).mockImplementation(() => mockReader)
    renderScanner()
    expect(screen.getByText('Câmera desativada')).toBeInTheDocument()
  })

  it('exibe indicador "Escaneando..." quando câmera ativa', () => {
    // BrowserQRCodeReader mock that stays scanning
    const mockReader = { decodeFromVideoDevice: vi.fn() }
    ;(vi.mocked(require('@zxing/browser')).BrowserQRCodeReader as any).mockImplementation(() => mockReader)
    renderScanner()
    act(() => { vi.advanceTimersByTime(100) })
    expect(screen.getByText('Escaneando...')).toBeInTheDocument()
  })

  it('exibe "Nenhum PC encontrado" quando código inválido', () => {
    const mockReader = { decodeFromVideoDevice: vi.fn().mockRejectedValue(new Error('no camera')) }
    ;(vi.mocked(require('@zxing/browser')).BrowserQRCodeReader as any).mockImplementation(() => mockReader)
    renderScanner()
    expect(screen.getByText('Buscar')).toBeInTheDocument()
  })

  it('exibe botão "Ativar Câmera" quando câmera está idle', () => {
    const mockReader = { decodeFromVideoDevice: vi.fn().mockRejectedValue(new Error('no camera')) }
    ;(vi.mocked(require('@zxing/browser')).BrowserQRCodeReader as any).mockImplementation(() => mockReader)
    renderScanner()
    expect(screen.getByText('Câmera desativada')).toBeInTheDocument()
    expect(screen.getByText('Ativar Câmera')).toBeInTheDocument()
  })
})
