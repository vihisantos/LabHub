import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

interface DonutChartItem {
  name: string
  value: number
  color: string
}

interface DonutChartProps {
  data: DonutChartItem[]
  size?: number
  innerRadius?: number
  outerRadius?: number
  centralLabel?: string
  centralSubLabel?: string
}

interface TooltipPayloadEntry {
  name: string
  value: number
  payload: DonutChartItem
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadEntry[] }) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  return (
    <div className="rounded-lg bg-card px-3 py-2 shadow-[var(--shadow-elevated)] ring-1 ring-line text-xs">
      <span className="text-fg-muted">{entry.name}: </span>
      <span className="font-medium text-fg">{entry.value}</span>
    </div>
  )
}

export function DonutChart({ data, size = 180, innerRadius = 58, outerRadius = 82, centralLabel, centralSubLabel }: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="flex items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
              animationBegin={0}
              animationDuration={800}
              animationEasing="ease-out"
            >
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {total > 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-fg">{centralLabel ?? total}</span>
            {centralSubLabel && <span className="text-[10px] text-fg-dim">{centralSubLabel}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
