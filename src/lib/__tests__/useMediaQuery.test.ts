import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMediaQuery } from '../useMediaQuery'

function createMockMediaQueryList(matches: boolean) {
  const listeners: Array<() => void> = []
  return {
    matches,
    addEventListener: vi.fn((event: string, cb: () => void) => {
      if (event === 'change') listeners.push(cb)
    }),
    removeEventListener: vi.fn((_event: string, cb: () => void) => {
      const idx = listeners.indexOf(cb)
      if (idx !== -1) listeners.splice(idx, 1)
    }),
    _trigger() {
      for (const cb of listeners) cb()
    },
  }
}

describe('useMediaQuery', () => {
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    window.matchMedia = vi.fn()
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('retorna false quando media query não combina', () => {
    const mql = createMockMediaQueryList(false)
    ;(window.matchMedia as any).mockReturnValue(mql)

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)
  })

  it('retorna true quando media query combina', () => {
    const mql = createMockMediaQueryList(true)
    ;(window.matchMedia as any).mockReturnValue(mql)

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(true)
  })

  it('atualiza quando media query muda de false para true', () => {
    const mql = createMockMediaQueryList(false)
    ;(window.matchMedia as any).mockReturnValue(mql)

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)

    act(() => {
      mql.matches = true
      mql._trigger()
    })

    expect(result.current).toBe(true)
  })

  it('atualiza quando media query muda de true para false', () => {
    const mql = createMockMediaQueryList(true)
    ;(window.matchMedia as any).mockReturnValue(mql)

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(true)

    act(() => {
      mql.matches = false
      mql._trigger()
    })

    expect(result.current).toBe(false)
  })

  it('reavalia quando query string muda', async () => {
    const mql1 = createMockMediaQueryList(false)
    const mql2 = createMockMediaQueryList(true)
    ;(window.matchMedia as any).mockReturnValue(mql1)

    const { rerender } = renderHook(
      ({ query }: { query: string }) => useMediaQuery(query),
      { initialProps: { query: '(min-width: 768px)' } },
    )

    // Verifica que o listener foi registrado na primeira query
    expect(mql1.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))

    // Muda a query e verifica que o listener antigo foi removido e novo registrado
    ;(window.matchMedia as any).mockReturnValue(mql2)
    rerender({ query: '(min-width: 1024px)' })

    expect(mql1.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 1024px)')
    expect(mql2.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('chama matchMedia com a query correta', () => {
    const mql = createMockMediaQueryList(false)
    ;(window.matchMedia as any).mockReturnValue(mql)

    renderHook(() => useMediaQuery('(prefers-color-scheme: dark)'))
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
  })
})
