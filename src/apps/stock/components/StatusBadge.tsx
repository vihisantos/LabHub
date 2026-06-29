import type { StockItemStatus } from '../types'

const config: Record<StockItemStatus, { label: string; dot: string; cls: string }> = {
  ativo: { label: 'Ativo', dot: 'bg-emerald-500', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  em_conserto: { label: 'Em Conserto', dot: 'bg-amber-500', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  descartado: { label: 'Descartado', dot: 'bg-red-500', cls: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  emprestado: { label: 'Emprestado', dot: 'bg-violet-500', cls: 'bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400' },
}

export function StatusBadge({ status }: { status: StockItemStatus }) {
  const c = config[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${c.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}
