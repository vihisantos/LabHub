import { useState, useEffect } from 'react'

function formatTime(d: Date) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(d: Date) {
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function ClockDisplay() {
  const [clock, setClock] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div style={{
      position: 'fixed', top: '2.5rem', left: '3rem', zIndex: 10,
      display: 'flex', flexDirection: 'column', gap: '0.125rem',
    }}>
      <span style={{
        fontSize: '5rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.03em', lineHeight: 1, color: '#ffffff',
        textShadow: '0 0 30px rgba(255,255,255,0.15)',
      }}>
        {formatTime(clock)}
      </span>
      <span style={{ fontSize: '1.125rem', color: '#cbd5e1', fontWeight: 500, textTransform: 'capitalize', letterSpacing: '0.02em' }}>
        {formatDate(clock)}
      </span>
    </div>
  )
}
