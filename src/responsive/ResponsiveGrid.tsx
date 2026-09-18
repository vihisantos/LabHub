import type { CSSProperties, ElementType, ReactNode } from 'react'
import { cn } from '../lib/components/ui/utils'

type CssSize = string | number

interface ResponsiveGridProps {
  /** Largura mínima de cada coluna (default `240`px). Use string p/ unidades customizadas. */
  minWidth?: CssSize
  /**
   * Limite superior de cada coluna. Sem ele as colunas crescem até preencher o
   * container (`1fr`); com ele a coluna para de expandir em `min(maxWidth,
   * 100%)` — use para evitar "cards excessivamente largos" em telas grandes.
   */
  maxWidth?: CssSize
  /** Espaço entre itens (default `16`px). */
  gap?: CssSize
  as?: ElementType
  'data-testid'?: string
  className?: string
  children: ReactNode
  style?: CSSProperties
}

function toCss(value: CssSize): string {
  return typeof value === 'number' ? `${value}px` : value
}

/**
 * Grade responsiva baseada em `auto-fit/minmax`.
 *
 * Preferir esta primitive em vez de espalhar `sm:`/`md:`/`lg:` de grid por
 * módulo: o número de colunas se ajusta sozinho à largura disponível. O mínimo
 * é sempre `min(minWidth, 100%)` — garante que uma faixa estreita nunca estoure
 * o container (sem scroll horizontal quando a coluna mínima excede a largura).
 */
export function ResponsiveGrid({
  minWidth = 240,
  maxWidth,
  gap = 16,
  as: Tag = 'div',
  'data-testid': dataTestId,
  className,
  children,
  style,
}: ResponsiveGridProps) {
  const low = `min(${toCss(minWidth)}, 100%)`
  const high = maxWidth != null ? `min(${toCss(maxWidth)}, 100%)` : '1fr'
  return (
    <Tag
      data-testid={dataTestId}
      className={cn('grid', className)}
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(${low}, ${high}))`,
        gap: toCss(gap),
        ...style,
      }}
    >
      {children}
    </Tag>
  )
}