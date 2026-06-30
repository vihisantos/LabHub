import { useMemo } from 'react'

interface DonutSlice {
  name: string
  value: number
  color: string
}

interface BarEntry {
  label: string
  value: number
  color?: string
}

export function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
      <h4 className="mb-1 text-xs font-medium text-fg-muted">{title}</h4>
      {subtitle && <p className="mb-3 text-[10px] text-fg-dim">{subtitle}</p>}
      <div className="flex items-center justify-center">{children}</div>
    </div>
  )
}

export function DonutChart({ data, size, centralLabel, centralSubLabel }: { data: DonutSlice[]; size: number; centralLabel: string; centralSubLabel: string }) {
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data])
  const cx = size / 2
  const cy = size / 2
  const strokeWidth = size * 0.12
  const r = cx - strokeWidth / 2

  const segments = useMemo(() => {
    if (total === 0) return []
    let currentAngle = -90
    return data.map((d) => {
      const angle = (d.value / total) * 360
      const startAngle = currentAngle
      const endAngle = currentAngle + angle
      currentAngle = endAngle
      const startRad = (startAngle * Math.PI) / 180
      const endRad = (endAngle * Math.PI) / 180
      const x1 = cx + r * Math.cos(startRad)
      const y1 = cy + r * Math.sin(startRad)
      const x2 = cx + r * Math.cos(endRad)
      const y2 = cy + r * Math.sin(endRad)
      const largeArc = angle > 180 ? 1 : 0
      return { d: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`, color: d.color }
    })
  }, [data, total, cx, cy, r])

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line)" strokeWidth={strokeWidth} />
      {segments.map((seg, i) => (
        <path key={i} d={seg.d} fill="none" stroke={seg.color} strokeWidth={strokeWidth} strokeLinecap="round" />
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle" className="fill-fg text-xs font-bold">{centralLabel}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" className="fill-fg-muted text-[9px]">{centralSubLabel}</text>
    </svg>
  )
}

export function BarChart({ data, layout = 'vertical', height, defaultColor }: { data: BarEntry[]; layout?: 'vertical' | 'horizontal'; height: number; defaultColor?: string }) {
  const max = useMemo(() => Math.max(...data.map((d) => d.value), 1), [data])

  if (layout === 'horizontal') {
    const barHeight = 18
    const gap = 6
    const labelWidth = 80
    const totalHeight = data.length * (barHeight + gap) + 10
    const displayHeight = Math.max(height, totalHeight)

    return (
      <svg width={320} height={displayHeight} viewBox={`0 0 320 ${displayHeight}`} className="overflow-visible">
        {data.map((d, i) => {
          const barW = (d.value / max) * 200
          const y = 5 + i * (barHeight + gap)
          const color = d.color || defaultColor || 'var(--accent)'
          return (
            <g key={i}>
              <text x={labelWidth - 4} y={y + barHeight / 2 + 1} textAnchor="end" className="fill-fg-muted text-[9px]">{d.label}</text>
              <rect x={labelWidth} y={y} width={Math.max(barW, 2)} height={barHeight} rx={3} fill={color} opacity={0.85} />
              <text x={labelWidth + barW + 4} y={y + barHeight / 2 + 1} className="fill-fg-dim text-[9px] font-medium">{d.value}</text>
            </g>
          )
        })}
      </svg>
    )
  }

  // vertical layout
  const barWidth = Math.max(18, Math.min(36, 160 / data.length))
  const gap = 6
  const totalWidth = data.length * (barWidth + gap) + 30
  const labelArea = 14

  return (
    <svg width={totalWidth} height={height} viewBox={`0 0 ${totalWidth} ${height}`} className="overflow-visible">
      {data.map((d, i) => {
        const barH = (d.value / max) * (height - labelArea - 10)
        const x = 15 + i * (barWidth + gap)
        const y = height - labelArea - barH
        const color = d.color || defaultColor || 'var(--accent)'
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={barH} rx={3} fill={color} opacity={0.85} />
            <text x={x + barWidth / 2} y={height - 2} textAnchor="middle" className="fill-fg-muted text-[8px]">{d.label}</text>
            <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" className="fill-fg-dim text-[8px] font-medium">{d.value}</text>
          </g>
        )
      })}
    </svg>
  )
}
