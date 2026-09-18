import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBreakpoint, type BreakpointState } from '../useBreakpoint'

function createMockMediaQueryList(matches: boolean) {
  const listeners: Array<() => void> = []
  return {
    matches,
    addEventListener: vi.fn((_event: string, cb: () => void) => {
      listeners.push(cb)
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

interface Matches {
  gte640?: boolean
  gte1024?: boolean
  gte1280?: boolean
}

/**
 * Simula `window.matchMedia` mapeando as 3 queríes usadas pelo hook
 * (`min-width: 640/1024/1280`) para os respectivos MediaQueryLists,
 * no mesmo padrão do teste existente de `useMediaQuery`.
 */
function installMatchMediaMock(matches: Matches) {
  const m640 = createMockMediaQueryList(matches.gte640 ?? false)
  const m1024 = createMockMediaQueryList(matches.gte1024 ?? false)
  const m1280 = createMockMediaQueryList(matches.gte1280 ?? false)

  ;(window.matchMedia as any) = vi.fn((query: string) => {
    if (query === '(min-width: 640px)') return m640
    if (query === '(min-width: 1024px)') return m1024
    if (query === '(min-width: 1280px)') return m1280
    return createMockMediaQueryList(false)
  })

  return { m640, m1024, m1280 }
}

function renderBreakpoint(matches: Matches) {
  const list = installMatchMediaMock(matches)
  const { result } = renderHook(() => useBreakpoint())
  return { result, list }
}

describe('useBreakpoint', () => {
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    window.matchMedia = vi.fn()
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it.each<[string, Matches]>([
    ['compact', { gte640: false, gte1024: false, gte1280: false }],
    ['tablet', { gte640: true, gte1024: false, gte1280: false }],
    ['desktop', { gte640: true, gte1024: true, gte1280: false }],
    ['wide', { gte640: true, gte1024: true, gte1280: true }],
  ])('%s — estado inicial correto e flags consistentes', (_band, matches) => {
    const { result } = renderBreakpoint(matches)
    const expected: BreakpointState = {
      bp: _band as BreakpointState['bp'],
      isCompact: _band === 'compact',
      isTablet: _band === 'tablet',
      isDesktop: _band === 'desktop',
      isWide: _band === 'wide',
    }
    expect(result.current).toEqual(expected)
  })

  it('atualiza a faixa ao mudar o viewport (compact → tablet)', () => {
    const { result, list } = renderBreakpoint({ gte640: false })

    expect(result.current.bp).toBe('compact')

    act(() => {
      list.m640.matches = true
      list.m640._trigger()
    })

    expect(result.current.bp).toBe('tablet')
    expect(result.current.isCompact).toBe(false)
    expect(result.current.isTablet).toBe(true)
  })

  it('atualiza a faixa ao mudar o viewport (tablet → desktop → wide)', () => {
    const { result, list } = renderBreakpoint({ gte640: true, gte1024: false })

    expect(result.current.bp).toBe('tablet')

    act(() => {
      list.m1024.matches = true
      list.m1024._trigger()
    })
    expect(result.current.bp).toBe('desktop')

    act(() => {
      list.m1280.matches = true
      list.m1280._trigger()
    })
    expect(result.current.bp).toBe('wide')
    expect(result.current.isWide).toBe(true)
  })

  it('registra e remove listeners das 3 queríes', () => {
    const { list } = renderBreakpoint({ gte640: false })

    expect(list.m640.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(list.m1024.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(list.m1280.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('sem window.matchMedia (ex.: jsdom puro) não quebra e assume compact', () => {
    ;(window.matchMedia as any) = undefined

    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toEqual({
      bp: 'compact',
      isCompact: true,
      isTablet: false,
      isDesktop: false,
      isWide: false,
    })
  })
})