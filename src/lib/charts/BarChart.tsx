import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface BarChartItem {
  label: string
  value: number
  color?: string
}

interface BarChartProps {
  data: BarChartItem[]
  layout?: 'horizontal' | 'vertical'
  height?: number
  barRadius?: number
  defaultColor?: string
}

interface TooltipPayloadEntry {
  name: string
  value: number
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg bg-card px-3 py-2 shadow-[var(--shadow-elevated)] ring-1 ring-line text-xs">
      <span className="text-fg-muted">{label}: </span>
      <span className="font-medium text-fg">{payload[0].value}</span>
    </div>
  )
}

export function BarChart({ data, layout = 'vertical', height = 200, barRadius = 4, defaultColor = 'var(--color-chart-bar)' }: BarChartProps) {
  const isHorizontal = layout === 'horizontal'

  const chartData = data.map((d) => ({
    ...d,
    fill: d.color ?? defaultColor,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={chartData}
        layout={isHorizontal ? 'horizontal' : 'vertical'}
        margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
        barCategoryGap={isHorizontal ? '20%' : '30%'}
      >
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-hover)' }} />
        {isHorizontal ? (
          <>
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-fg-muted)', fontSize: 11 }}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-fg-muted)', fontSize: 11 }}
              width={90}
            />
            <Bar dataKey="value" radius={[0, barRadius, barRadius, 0]} maxBarSize={20}>
              {chartData.map((entry, idx) => (
                <Cell key={idx} fill={entry.fill} />
              ))}
            </Bar>
          </>
        ) : (
          <>
            <XAxis
              type="category"
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-fg-muted)', fontSize: 11 }}
            />
            <YAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-fg-muted)', fontSize: 11 }}
              allowDecimals={false}
            />
            <Bar dataKey="value" radius={[barRadius, barRadius, 0, 0]} maxBarSize={32}>
              {chartData.map((entry, idx) => (
                <Cell key={idx} fill={entry.fill} />
              ))}
            </Bar>
          </>
        )}
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}
