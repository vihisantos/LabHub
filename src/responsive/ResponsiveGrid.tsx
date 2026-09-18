import type { CSSProperties, ElementType, ReactNode } from 'react'
import { cn } from '../lib/components/ui/utils'

type CssSize = string | number

interface ResponsiveGridProps {
  /** Largura mínima de cada coluna (default `240`px). Use string p/ unidades customizadas. */
  minWidth?: CssSize
  /** Espaço entre itens (default `16`px). */
  gap?: CssSize
  as?: ElementType
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
 * módulo: o número de colunas se ajusta sozinho à largura disponível.
 */
export function ResponsiveGrid({
  minWidth = 240,
  gap = 16,
  as: Tag = 'div',
  className,
  children,
  style,
}: ResponsiveGridProps) {
  return (
    <Tag
      className={cn('grid', className)}
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(${toCss(minWidth)}, 1fr))`,
        gap: toCss(gap),
        ...style,
      }}
    >
      {children}
    </Tag>
  )
}