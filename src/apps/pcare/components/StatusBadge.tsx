type Status = 'pending' | 'in_progress' | 'done'

const statusConfig: Record<Status, { label: string; class: string; glow: string }> = {
  pending: { label: 'Pendente', class: 'bg-slate-700 text-slate-300', glow: 'shadow-[0_0_6px_#47556940]' },
  in_progress: { label: 'Em andamento', class: 'bg-amber-900/60 text-amber-300', glow: 'shadow-[0_0_6px_#d9770640]' },
  done: { label: 'Concluído', class: 'bg-emerald-900/60 text-emerald-300', glow: 'shadow-[0_0_6px_#05966940]' },
}

interface StatusBadgeProps {
  status: Status
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status]
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${config.class} ${config.glow}`}>
      {config.label}
    </span>
  )
}
