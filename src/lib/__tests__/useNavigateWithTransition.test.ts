import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

import { useNavigateWithTransition } from '../useNavigateWithTransition'

describe('useNavigateWithTransition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(document, 'startViewTransition', {
      value: undefined,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('chama navigate diretamente quando startViewTransition não existe', () => {
    const { result } = renderHook(() => useNavigateWithTransition())

    result.current('/dashboard')

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', undefined)
  })

  it('chama navigate com options quando fornecidas', () => {
    const { result } = renderHook(() => useNavigateWithTransition())

    result.current('/pcs', { replace: true })

    expect(mockNavigate).toHaveBeenCalledWith('/pcs', { replace: true })
  })

  it('usa startViewTransition quando disponível', () => {
    const startVT = vi.fn((_cb: () => void) => {})
    Object.defineProperty(document, 'startViewTransition', {
      value: startVT,
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => useNavigateWithTransition())

    result.current('/parts')

    expect(startVT).toHaveBeenCalledOnce()
    expect(mockNavigate).not.toHaveBeenCalled()

    // Executa o callback passado ao startViewTransition
    const vtCallback = startVT.mock.calls[0][0]
    vtCallback()

    expect(mockNavigate).toHaveBeenCalledWith('/parts', undefined)
  })

  it('passa options para navigate dentro de startViewTransition', () => {
    const startVT = vi.fn((_cb: () => void) => {})
    Object.defineProperty(document, 'startViewTransition', {
      value: startVT,
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => useNavigateWithTransition())

    result.current('/maintenance', { state: { from: 'home' } })

    const vtCallback = startVT.mock.calls[0][0]
    vtCallback()

    expect(mockNavigate).toHaveBeenCalledWith('/maintenance', { state: { from: 'home' } })
  })

  it('chama startViewTransition com callback que navega', () => {
    const startVT = vi.fn((cb: () => void) => { cb() })
    Object.defineProperty(document, 'startViewTransition', {
      value: startVT,
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => useNavigateWithTransition())

    result.current('/stock')

    expect(startVT).toHaveBeenCalledOnce()
    expect(mockNavigate).toHaveBeenCalledWith('/stock', undefined)
  })
})
