type Status = 'pending' | 'in_progress' | 'done'

const statusConfig: Record<Status, { label: string; dot: string; class: string }> = {
  pending: { label: 'Pendente', dot: 'bg-slate-400', class: 'bg-input text-fg-dim' },
  in_progress: { label: 'Em andamento', dot: 'bg-amber-400', class: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300' },
  done: { label: 'Concluído', dot: 'bg-emerald-400', class: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300' },
}

interface StatusBadgeProps {
  status: Status
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${config.class}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
}
