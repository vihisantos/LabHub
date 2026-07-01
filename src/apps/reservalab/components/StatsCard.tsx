import { useState, useEffect, type ReactNode } from 'react'
import { motion } from 'framer-motion'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle: string
  icon: ReactNode
  color: string
  index: number
  isMobile?: boolean
}

function AnimatedValue({ value }: { value: number }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    let start = 0
    const end = value
    const duration = 1000
    const step = Math.max(1, Math.floor(end / 60))
    const timer = setInterval(() => {
      start += step
      if (start >= end) {
        setDisplay(end)
        clearInterval(timer)
      } else {
        setDisplay(start)
      }
    }, duration / 60)
    return () => clearInterval(timer)
  }, [value])

  return <>{display}</>
}

export function StatsCard({ title, value, subtitle, icon, color, index, isMobile }: StatsCardProps) {
  const isNumeric = typeof value === 'number'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 * index, duration: 0.4 }}
      style={{
        background: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(12px)',
        borderRadius: '1rem',
        border: '1px solid rgba(99, 102, 241, 0.15)',
        padding: isMobile ? '1rem' : '1.5rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Color accent bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '4px',
        height: '100%',
        background: color,
        borderRadius: '4px 0 0 4px',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: isMobile ? '0.75rem' : '0.85rem', color: '#71717a', fontWeight: 500, marginBottom: '0.5rem' }}>
            {title}
          </p>
          <p style={{
            fontSize: isMobile ? '1.5rem' : '2rem',
            fontWeight: 800,
            color: '#0f172a',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.1,
          }}>
            {isNumeric ? <AnimatedValue value={value as number} /> : value}
          </p>
        </div>
        <div style={{
          width: isMobile ? '32px' : '40px',
          height: isMobile ? '32px' : '40px',
          borderRadius: '0.75rem',
          background: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>
      <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {subtitle}
      </p>
    </motion.div>
  )
}
