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
      className={cn('rounded-2xl border border-line bg-card p-4', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-fg-muted">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </section>
  )
}