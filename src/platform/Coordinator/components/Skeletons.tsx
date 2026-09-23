import { cn } from '../../../lib/components/ui/utils'

/**
 * Skeletons discretos da Central (PR visual).
 *
 * Todos usam a classe `.skeleton-shimmer` do design system (animação em
 * `index.css`, respeita `prefers-reduced-motion`). São blocos de loading
 * apresentacionais — nenhum estado lógico (loading/erro/vazio) mudou; apenas a
 * apresentação veio para cá.
 */

function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn('skeleton-shimmer rounded-full', className)} />
}

/** Espelha o `CoordinatorMetricCard` (ícone + número + rótulo). */
export function SkeletonMetric() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3.5">
      <div className="skeleton-shimmer h-10 w-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonLine className="h-3 w-10" />
        <SkeletonLine className="h-2.5 w-3/4" />
      </div>
    </div>
  )
}

/** Espelha linhas de membro/solicitação (avatar + nome + e-mail + badge). */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-2">
      <div className="skeleton-shimmer h-7 w-7 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <SkeletonLine className="h-2.5 w-2/5" />
        <SkeletonLine className="h-2 w-3/5" />
      </div>
      <div className="skeleton-shimmer h-5 w-16 shrink-0 rounded-full" />
    </div>
  )
}

/** Espelha a grade compacta de estatísticas da unidade (stat cells). */
export function SkeletonStatGrid() {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-lg bg-input/50 px-2 py-2">
          <SkeletonLine className="h-2 w-2/3" />
          <SkeletonLine className="mt-1.5 h-3 w-8" />
        </div>
      ))}
    </div>
  )
}

/** Corpo de painel (título + algumas linhas), para o estado de carga do shell. */
export function SkeletonPanelRows() {
  return (
    <div className="space-y-2">
      <SkeletonRow />
      <SkeletonRow />
    </div>
  )
}