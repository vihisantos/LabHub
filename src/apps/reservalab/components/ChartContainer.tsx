import type { ReactNode } from 'react'

interface ChartContainerProps {
  title: string
  subtitle?: string
  children: ReactNode
  isMobile?: boolean
}

export function ChartContainer({ title, subtitle, children, isMobile }: ChartContainerProps) {
  return (
    <div style={{
      background: 'color-mix(in srgb, var(--bg-card) 85%, transparent)',
      backdropFilter: 'blur(12px)',
      borderRadius: '1rem',
      border: '1px solid var(--border)',
      padding: isMobile ? '1rem' : '1.5rem',
    }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: isMobile ? '0.85rem' : '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {title}
        </h3>
        {subtitle && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  )
}
