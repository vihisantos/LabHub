import { motion } from 'framer-motion'
import { useEffect, useState, useRef } from 'react'

function AnimatedValue({ value }) {
  const [display, setDisplay] = useState(() => (
    typeof value === 'number' ? 0 : value
  ))
  const prevValue = useRef(undefined)

  useEffect(() => {
    if (typeof value !== 'number') {
      setDisplay(value)
      return
    }

    const from = prevValue.current !== value ? (typeof prevValue.current === 'number' ? prevValue.current : 0) : value
    if (from === value) return

    const startTime = performance.now()
    const duration = 1.2

    const rafId = requestAnimationFrame(function animate(now) {
      const elapsed = (now - startTime) / 1000
      const p = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (p < 1) requestAnimationFrame(animate)
    })

    prevValue.current = value
    return () => {
      cancelAnimationFrame(rafId)
      prevValue.current = undefined
    }
  }, [value])

  return <span>{display}</span>
}

export default function StatsCard({
  title,
  value,
  subtitle,
  icon,
  color,
  index = 0
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 * index, duration: 0.5 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      style={{
        background: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(12px)',
        borderRadius: '1rem',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
        border: '1px solid rgba(0,0,0,0.04)'
      }}
    >
      <div style={{
        height: '4px',
        background: `linear-gradient(90deg, ${color}, ${color}33)`,
        width: '100%'
      }} />
      <div style={{ padding: '1.5rem 1.5rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '0.25rem'
            }}>
              {title}
            </p>
            <span style={{
              fontSize: '2.25rem',
              fontWeight: 800,
              color: '#0f172a',
              lineHeight: 1.1,
              fontVariantNumeric: 'tabular-nums',
              display: 'block'
            }}>
              <AnimatedValue value={value} />
            </span>
          </div>
          <div style={{
            width: '2.75rem',
            height: '2.75rem',
            borderRadius: '0.75rem',
            background: `${color}12`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {icon}
          </div>
        </div>
        <p style={{
          fontSize: '0.75rem',
          color: '#94a3b8',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {subtitle}
        </p>
      </div>
    </motion.div>
  )
}
