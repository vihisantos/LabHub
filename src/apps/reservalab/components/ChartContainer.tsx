import type { ReactNode } from 'react'

interface ChartContainerProps {
  title: string
  subtitle?: string
  children: ReactNode
}

export function ChartContainer({ title, subtitle, children }: ChartContainerProps) {
  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.8)',
      backdropFilter: 'blur(12px)',
      borderRadius: '1rem',
      border: '1px solid rgba(99, 102, 241, 0.15)',
      padding: '1.5rem',
    }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
          {title}
        </h3>
        {subtitle && (
          <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  )
}
