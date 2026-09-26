import type { ReactNode } from 'react'
import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'

interface EmptyStateProps {
  /**
   * Ícone opcional; padrão `inbox`. Usa a biblioteca de ícones do projeto.
   */
  icon?: ReactNode
  title: string
  description?: string
  /**
   * `card` (padrão): container próprio com borda tracejada — para tela cheia.
   * `soft`: conteúdo solto para dentro de um painel já existente (sem card
   * dentro de card).
   */
  variant?: 'card' | 'soft'
  className?: string
}

/**
 * Estado vazio padronizado do Coordenador (PR visual).
 *
 * É 100% apresentacional: recebe textos prontos e nunca inventa ação. Reaproveita
 * os tokens visuais do design system (`bg-input`, `text-fg`, `text-fg-muted`,
 * `empty-state-icon`) para manter uma única linguagem visual com o resto do app.
 */
export function EmptyState({
  icon,
  title,
  description,
  variant = 'card',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 text-center',
        variant === 'card'
          ? 'rounded-2xl border border-dashed border-line bg-card px-6 py-10'
          : 'px-4 py-6',
        className,
      )}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-input/60 empty-state-icon">
        {icon ?? <icons.ui.inbox size={20} className="text-fg-muted" />}
      </span>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description && (
        <p className="max-w-xs text-xs leading-relaxed text-fg-muted">{description}</p>
      )}
    </div>
  )
}