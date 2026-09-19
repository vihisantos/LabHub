import type { ReactNode } from 'react'
import { cn } from '../../../lib/components/ui/utils'

type MetricTone = 'neutral' | 'amber' | 'violet' | 'emerald' | 'red'

const TONE_BOX: Record<MetricTone, string> = {
  neutral: 'bg-fg-muted/10 text-fg-muted',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  red: 'bg-red-500/10 text-red-500',
}

interface CoordinatorMetricCardProps {
  label: string
  value: number | string
  icon?: ReactNode
  tone?: MetricTone
  /**
   * Torna o card um botão real (acessível, teclado) com navegação para o app
   * de chamados EXISTENTE. Nenhuma regra de negócio vive aqui — o card é só
   * apresentação; quem decide o que acontece é a página.
   */
  onClick?: () => void
  'data-testid'?: string
}

/**
 * KPI reutilizável da Central do Coordenador: número + rótulo (+ ícone). Sem
 * `onClick` vira um bloco estático de leitura; com `onClick` vira um `<button>`
 * (nunca um div clicável) para preservar foco/teclado/aria.
 */
export function CoordinatorMetricCard({
  label,
  value,
  icon,
  tone = 'neutral',
  onClick,
  'data-testid': dataTestId,
}: CoordinatorMetricCardProps) {
  const content = (
    <>
      {icon && (
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            TONE_BOX[tone],
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-fg">{value}</span>
        <span className="block truncate text-[10px] text-fg-muted">{label}</span>
      </span>
    </>
  )
  const base = 'flex flex-1 items-center gap-2.5 rounded-xl border border-line bg-card px-3 py-3'
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-testid={dataTestId}
        className={cn(base, 'text-left transition-colors hover:bg-input')}
        aria-label={`${label}: ${value}`}
      >
        {content}
      </button>
    )
  }
  return (
    <div data-testid={dataTestId} className={base}>
      {content}
    </div>
  )
}