import type { ReactNode } from 'react'

interface ChartCardProps {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}

export function ChartCard({ title, subtitle, action, children }: ChartCardProps) {
  return (
    <div className="rounded-xl border border-line bg-card/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px] text-fg-dim">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}
