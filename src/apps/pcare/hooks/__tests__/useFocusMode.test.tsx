import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { FocusModeProvider, useFocusMode } from '../useFocusMode'

function renderWithProvider() {
  return renderHook(() => useFocusMode(), { wrapper: FocusModeProvider })
}

describe('useFocusMode', () => {
  it('inicia com focusMode false', () => {
    const { result } = renderWithProvider()
    expect(result.current.focusMode).toBe(false)
  })

  it('toggleFocusMode alterna para true', () => {
    const { result } = renderWithProvider()
    act(() => result.current.toggleFocusMode())
    expect(result.current.focusMode).toBe(true)
  })

  it('toggleFocusMode alterna de volta para false', () => {
    const { result } = renderWithProvider()
    act(() => result.current.toggleFocusMode())
    expect(result.current.focusMode).toBe(true)
    act(() => result.current.toggleFocusMode())
    expect(result.current.focusMode).toBe(false)
  })

  it('useFocusMode fora do Provider retorna valor padrão', () => {
    const { result } = renderHook(() => useFocusMode())
    expect(result.current.focusMode).toBe(false)
    expect(result.current.toggleFocusMode).toBeDefined()
  })
})
