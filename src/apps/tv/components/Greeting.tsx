import { useState, useEffect } from 'react'

function greeting(h: number) {
  if (h >= 5 && h < 12) return 'Bom dia, Campus!'
  if (h >= 12 && h < 18) return 'Boa tarde, Campus!'
  return 'Boa noite, Campus!'
}

export function Greeting() {
  const [clock, setClock] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div style={{
      position: 'fixed', top: '12%', left: '50%',
      transform: 'translate(-50%, -50%)', zIndex: 10,
      pointerEvents: 'none', userSelect: 'none',
      textAlign: 'center',
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        fontSize: 'clamp(2.5rem, 5vw, 5rem)',
        fontWeight: 800,
        lineHeight: 1.2,
        color: '#f1f5f9',
        textShadow: '0 0 40px rgba(129,140,248,0.4), 0 0 80px rgba(99,102,241,0.15)',
        animation: 'hue-shift 4s linear infinite',
      }}>
        {greeting(clock.getHours())}
      </span>
    </div>
  )
}
