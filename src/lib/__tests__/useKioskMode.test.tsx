import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { KioskProvider, useKioskMode, KioskExitPill } from '../useKioskMode'

function renderTestHarness() {
  function TestHarness() {
    const { kioskMode, enterKiosk, exitKiosk } = useKioskMode()
    return (
      <div>
        <span data-testid="kiosk-mode">{kioskMode ? 'on' : 'off'}</span>
        <button onClick={enterKiosk}>Enter</button>
        <button onClick={exitKiosk}>Exit</button>
      </div>
    )
  }
  return render(
    <KioskProvider>
      <TestHarness />
    </KioskProvider>,
  )
}

function renderWithProvider(children: React.ReactNode) {
  return render(<KioskProvider>{children}</KioskProvider>)
}

describe('KioskProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.requestFullscreen = vi.fn(() => Promise.resolve())
    document.exitFullscreen = vi.fn(() => Promise.resolve())
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renderiza children', () => {
    render(
      <KioskProvider>
        <div data-testid="child">Content</div>
      </KioskProvider>,
    )
    expect(screen.getByTestId('child')).toHaveTextContent('Content')
  })

  it('kioskMode é false inicialmente', () => {
    renderTestHarness()
    expect(screen.getByTestId('kiosk-mode')).toHaveTextContent('off')
  })

  it('enterKiosk ativa o modo quiosque', () => {
    renderTestHarness()
    fireEvent.click(screen.getByText('Enter'))
    expect(screen.getByTestId('kiosk-mode')).toHaveTextContent('on')
  })

  it('enterKiosk persiste no localStorage', () => {
    renderTestHarness()
    fireEvent.click(screen.getByText('Enter'))
    expect(localStorage.getItem('labhub_kiosk_mode')).toBe('true')
  })

  it('enterKiosk tenta entrar em fullscreen', () => {
    const fs = vi.spyOn(document.documentElement, 'requestFullscreen')
    renderTestHarness()
    fireEvent.click(screen.getByText('Enter'))
    expect(fs).toHaveBeenCalledOnce()
  })

  it('exitKiosk desativa o modo quiosque', () => {
    renderTestHarness()
    fireEvent.click(screen.getByText('Enter'))
    fireEvent.click(screen.getByText('Exit'))
    expect(screen.getByTestId('kiosk-mode')).toHaveTextContent('off')
  })

  it('exitKiosk remove do localStorage', () => {
    renderTestHarness()
    fireEvent.click(screen.getByText('Enter'))
    fireEvent.click(screen.getByText('Exit'))
    expect(localStorage.getItem('labhub_kiosk_mode')).toBeNull()
  })

  it('exitKiosk tenta sair do fullscreen', () => {
    const fs = vi.spyOn(document, 'exitFullscreen')
    renderTestHarness()
    fireEvent.click(screen.getByText('Enter'))
    // Simula que o fullscreen foi ativado
    Object.defineProperty(document, 'fullscreenElement', {
      value: document.documentElement,
      writable: true,
    })
    fireEvent.click(screen.getByText('Exit'))
    expect(fs).toHaveBeenCalledOnce()
  })

  it('restaura modo do localStorage ao montar', () => {
    localStorage.setItem('labhub_kiosk_mode', 'true')
    renderTestHarness()
    expect(screen.getByTestId('kiosk-mode')).toHaveTextContent('on')
  })

  it('evento Escape sai do modo quiosque', () => {
    renderTestHarness()
    fireEvent.click(screen.getByText('Enter'))
    expect(screen.getByTestId('kiosk-mode')).toHaveTextContent('on')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(screen.getByTestId('kiosk-mode')).toHaveTextContent('off')
  })

  it('fullscreenchange sai do modo quiosque quando fullscreen é perdido', () => {
    localStorage.setItem('labhub_kiosk_mode', 'true')
    renderTestHarness()
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
    })
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    expect(screen.getByTestId('kiosk-mode')).toHaveTextContent('off')
  })
})

describe('KioskExitPill', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renderiza o botão de entrada', () => {
    renderWithProvider(<KioskExitPill />)
    expect(screen.getByLabelText('Mostrar opções do modo quiosque')).toBeInTheDocument()
  })

  it('exibe botão de sair ao clicar no pill', () => {
    renderWithProvider(<KioskExitPill />)
    fireEvent.click(screen.getByLabelText('Mostrar opções do modo quiosque'))
    expect(screen.getByText('Sair do modo quiosque')).toBeInTheDocument()
  })

  it('esconde botão de sair após 4 segundos', () => {
    renderWithProvider(<KioskExitPill />)
    fireEvent.click(screen.getByLabelText('Mostrar opções do modo quiosque'))
    expect(screen.getByText('Sair do modo quiosque')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(4000) })
    expect(screen.queryByText('Sair do modo quiosque')).not.toBeInTheDocument()
  })

  it('botão de sair chama exitKiosk via useKioskMode', () => {
    function TestHarnessWithPill() {
      const { kioskMode } = useKioskMode()
      return (
        <div>
          <span data-testid="kiosk-mode">{kioskMode ? 'on' : 'off'}</span>
          <KioskExitPill />
        </div>
      )
    }
    render(
      <KioskProvider>
        <TestHarnessWithPill />
      </KioskProvider>,
    )
    fireEvent.click(screen.getByLabelText('Mostrar opções do modo quiosque'))
    fireEvent.click(screen.getByText('Sair do modo quiosque'))
    expect(screen.getByTestId('kiosk-mode')).toHaveTextContent('off')
  })
})
