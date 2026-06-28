import type { StockItemStatus } from '../types'

const config: Record<StockItemStatus, { label: string; dot: string; cls: string }> = {
  ativo: { label: 'Ativo', dot: 'bg-emerald-400', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300' },
  em_conserto: { label: 'Em Conserto', dot: 'bg-amber-400', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300' },
  descartado: { label: 'Descartado', dot: 'bg-red-400', cls: 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300' },
}

export function StatusBadge({ status }: { status: StockItemStatus }) {
  const c = config[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${c.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}
