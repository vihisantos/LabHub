import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QRGenerator } from '../QRGenerator'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderQR() {
  return render(
    <MemoryRouter>
      <QRGenerator />
    </MemoryRouter>,
  )
}

describe('QRGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renderiza contagem regressiva', () => {
    renderQR()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('exibe o texto "Redirecionando para"', () => {
    renderQR()
    expect(screen.getByText('Redirecionando para')).toBeInTheDocument()
  })

  it('exibe "Estoque" como destino', () => {
    renderQR()
    expect(screen.getByText('Estoque')).toBeInTheDocument()
  })

  it('exibe botão "Ir agora"', () => {
    renderQR()
    expect(screen.getByText('Ir agora')).toBeInTheDocument()
  })

  it('navega para /stock/qr ao clicar em "Ir agora"', () => {
    renderQR()
    screen.getByText('Ir agora').click()
    expect(mockNavigate).toHaveBeenCalledWith('/stock/qr', { replace: true })
  })

  it('navega para /stock/qr após 3 segundos', () => {
    renderQR()
    act(() => { vi.advanceTimersByTime(3000) })
    expect(mockNavigate).toHaveBeenCalledWith('/stock/qr', { replace: true })
  })
})
