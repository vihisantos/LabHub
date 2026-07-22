import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type Season = 'confetes' | 'snow' | 'leaves' | 'none'

function detectSeason(): Season {
  const now = new Date()
  const month = now.getMonth()
  // Verão no Brasil: Dez, Jan, Fev (meses 11, 0, 1)
  // Outono: Mar, Abr, Mai (2, 3, 4)
  // Inverno: Jun, Jul, Ago (5, 6, 7)
  // Primavera: Set, Out, Nov (8, 9, 10)

  // Confetes: formaturas (Maio-Junho, Novembro-Dezembro) e feriados principais
  if (month === 4 || month === 5 || month === 10 || month === 11) {
    return 'confetes'
  }
  // Neve: Dezembro (tema natalino)
  if (month === 11) {
    return 'snow'
  }
  return 'none'
}

interface Particle {
  id: number
  x: number
  delay: number
  duration: number
  size: number
  rotation: number
  color?: string
  opacity: number
}

const CONFETI_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f59e0b', '#10b981', '#3b82f6', '#a855f7',
  '#14b8a6', '#f97316',
]

export function SeasonalEffects() {
  const season = useMemo(() => detectSeason(), [])

  const particles = useMemo<Particle[]>(() => {
    if (season === 'none') return []

    const count = season === 'confetes' ? 40 : 30
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 8,
      duration: 4 + Math.random() * 6,
      size: season === 'snow' ? 3 + Math.random() * 5 : 6 + Math.random() * 8,
      rotation: Math.random() * 360,
      color: season === 'confetes' ? CONFETI_COLORS[i % CONFETI_COLORS.length] : '#ffffff',
      opacity: season === 'snow' ? 0.3 + Math.random() * 0.5 : 0.7 + Math.random() * 0.3,
    }))
  }, [season])

  if (season === 'none') return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 40,
      }}
      aria-hidden="true"
    >
      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{
              x: `${p.x}vw`,
              y: -20,
              rotate: 0,
              opacity: 0,
            }}
            animate={{
              y: '110vh',
              rotate: season === 'confetes' ? [0, 180, 360] : p.rotation,
              opacity: [0, p.opacity, p.opacity, 0],
              x: season === 'leaves'
                ? [`${p.x}vw`, `${p.x + (Math.random() > 0.5 ? 10 : -10)}vw`]
                : `${p.x + (Math.random() > 0.5 ? 5 : -5)}vw`,
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: season === 'snow' ? 'linear' : 'easeInOut',
            }}
            style={{
              position: 'absolute',
              top: 0,
              width: season === 'confetes' ? `${p.size}px` : `${p.size}px`,
              height: season === 'confetes' ? `${p.size * 0.6}px` : `${p.size}px`,
              borderRadius: season === 'snow' ? '50%' : '2px',
              background: season === 'confetes' ? p.color : '#ffffff',
              opacity: season === 'snow' ? p.opacity : 1,
              boxShadow: season === 'snow'
                ? '0 0 6px rgba(255,255,255,0.3)'
                : 'none',
            }}
          />
        ))}
      </AnimatePresence>

      {/* Seasonal label subtle */}
      <div
        style={{
          position: 'fixed',
          right: '1rem',
          bottom: '3.5rem',
          zIndex: 41,
          fontSize: '0.6rem',
          color: 'rgba(255,255,255,0.08)',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
        }}
      >
        {season === 'confetes' ? '🎉 Festividades' : season === 'snow' ? '❄️ Época Natalina' : ''}
      </div>
    </div>
  )
}
