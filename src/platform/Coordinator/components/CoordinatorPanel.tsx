import type { ReactNode } from 'react'
import { cn } from '../../../lib/components/ui/utils'

interface CoordinatorPanelProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
  children?: ReactNode
  'data-testid'?: string
}

/**
 * Painel de seção reutilizável da Central do Coordenador (PR B — camada de
 * apresentação). É um container semântico (`section`) com título/descrição e
 * ação opcionais; o conteúdo decide seus próprios estados de loading/vazio/erro
 * como já é feito no restante da Central — o painel não inventa nenhum dado.
 */
export function CoordinatorPanel({
  title,
  description,
  action,
  className,
  children,
  'data-testid': dataTestId,
}: CoordinatorPanelProps) {
  return (
    <section
      data-testid={dataTestId}
      className={cn(
        'rounded-2xl border border-line bg-card px-4 py-4 shadow-[var(--shadow-card)] sm:px-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3.5 w-1 shrink-0 rounded-full bg-violet-500/70" />
            <h2 className="text-sm font-semibold tracking-tight text-fg">{title}</h2>
          </div>
          {description && (
            <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">{description}</p>
          )}
        </div>
        {action && <div className="mt-0.5 shrink-0">{action}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  )
}