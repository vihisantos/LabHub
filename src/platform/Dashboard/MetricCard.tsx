interface MetricCardProps {
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
  trend?: {
    value: number
    isPositive: boolean
  }
}

export function MetricCard({ label, value, icon, color, trend }: MetricCardProps) {
  return (
    <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-bold text-fg">{value}</p>
          <p className="mt-0.5 text-[11px] text-fg-muted">{label}</p>
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: color + '15', color }}
        >
          {icon}
        </div>
      </div>
      {trend && (
        <div className="mt-2 flex items-center gap-1">
          <span className={`text-[10px] font-medium ${trend.isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
          <span className="text-[10px] text-fg-dim">vs. mês anterior</span>
        </div>
      )}
    </div>
  )
}
