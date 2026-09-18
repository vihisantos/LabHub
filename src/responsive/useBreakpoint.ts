import { useEffect, useState } from 'react'

export type Breakpoint = 'compact' | 'tablet' | 'desktop' | 'wide'

export interface BreakpointState {
  bp: Breakpoint
  isCompact: boolean
  isTablet: boolean
  isDesktop: boolean
  isWide: boolean
}

/**
 * Faixas (alinhadas aos defaults do Tailwind v4):
 * - compact: < 640px
 * - tablet:  640–1023px
 * - desktop: 1024–1279px
 * - wide:    >= 1280px
 */

const MIN_WIDTH_TABLET = '(min-width: 640px)'
const MIN_WIDTH_DESKTOP = '(min-width: 1024px)'
const MIN_WIDTH_WIDE = '(min-width: 1280px)'

function computeBreakpoint(): BreakpointState {
  // SSR-safe e seguro em ambientes sem matchMedia (ex.: jsdom puro):
  // sem capacidade de medir a viewport, assume a faixa mais conservadora.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return { bp: 'compact', isCompact: true, isTablet: false, isDesktop: false, isWide: false }
  }

  const isTabletOrAbove = window.matchMedia(MIN_WIDTH_TABLET).matches
  const isDesktopOrAbove = window.matchMedia(MIN_WIDTH_DESKTOP).matches
  const isWide = window.matchMedia(MIN_WIDTH_WIDE).matches

  let bp: Breakpoint = 'compact'
  if (isWide) bp = 'wide'
  else if (isDesktopOrAbove) bp = 'desktop'
  else if (isTabletOrAbove) bp = 'tablet'

  return {
    bp,
    isCompact: bp === 'compact',
    isTablet: bp === 'tablet',
    isDesktop: bp === 'desktop',
    isWide: bp === 'wide',
  }
}

/**
 * Hook de breakpoint único para o LabHub.
 *
 * Baseado no padrão do `useMediaQuery` existente (`src/lib/useMediaQuery`),
 * porém self-contained: usa 3 listeners de `min-width` (640/1024/1280) e
 * deriva a faixa. Não criar 4 hooks independentes nem listeners em excesso.
 */
export function useBreakpoint(): BreakpointState {
  const [state, setState] = useState<BreakpointState>(computeBreakpoint)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const mediaQueryLists = [MIN_WIDTH_TABLET, MIN_WIDTH_DESKTOP, MIN_WIDTH_WIDE].map(
      (query) => window.matchMedia(query),
    )

    const onViewportChange = () => setState(computeBreakpoint())

    mediaQueryLists.forEach((mql) => mql.addEventListener('change', onViewportChange))
    return () => {
      mediaQueryLists.forEach((mql) => mql.removeEventListener('change', onViewportChange))
    }
  }, [])

  return state
}