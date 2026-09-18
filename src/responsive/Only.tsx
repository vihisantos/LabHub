import type { ReactNode } from 'react'
import { useBreakpoint, type Breakpoint } from './useBreakpoint'

const BREAKPOINT_ORDER: Record<Breakpoint, number> = {
  compact: 0,
  tablet: 1,
  desktop: 2,
  wide: 3,
}

interface OnlyProps {
  /** Renderiza apenas em faixas a partir de `from` (inclusive). */
  from?: Breakpoint
  /** Renderiza apenas em faixas até `upto` (inclusive). */
  upto?: Breakpoint
  children: ReactNode
}

/**
 * Visibilidade condicional pura (cosmética): algo existe somente a partir de
 * determinado breakpoint (`from`) ou até determinado breakpoint (`upto`).
 *
 * Jamais use para mudar LÓGICA — só para aparência (ex.: densidade, espaço
 * decorativo). Se a mudança envolve dados/comportamento, condicione no código,
 * não no breakpoint.
 */
export function Only({ from, upto, children }: OnlyProps) {
  const { bp } = useBreakpoint()
  const current = BREAKPOINT_ORDER[bp]

  if (from != null && current < BREAKPOINT_ORDER[from]) return null
  if (upto != null && current > BREAKPOINT_ORDER[upto]) return null

  return <>{children}</>
}