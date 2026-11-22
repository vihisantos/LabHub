import { useState, useEffect } from 'react'

export function Greeting() {
  const [clock, setClock] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const time = clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={styles.container}>
      <span style={styles.time}>{time}</span>
    </div>
  )
}

const styles = {
  container: {
    position: 'fixed' as const,
    top: '2.5rem',
    left: '3rem',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  time: {
    fontSize: '1.5rem',
    fontWeight: 600 as const,
    color: '#ffffff',
    textShadow: '0 0 20px rgba(255,255,255,0.2)',
  },
}