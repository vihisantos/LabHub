import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './OnboardingTour.css'
import { roleBasedSteps, defaultSteps, type TourStep } from './onboardingSteps'
import { useAuth } from '../core/auth/AuthContext'
import { useTheme } from '../lib/ThemeContext'
import type { ThemeVariant, Accent } from '../lib/ThemeContext'

// ─── Theme picker step ─────────────────────────────────────────────────────────
const THEMES: { value: ThemeVariant; label: string; icon: string }[] = [
  { value: 'dark',  label: 'Dark',  icon: '🌑' },
  { value: 'dim',   label: 'Dim',   icon: '🌗' },
  { value: 'light', label: 'Light', icon: '☀️'  },
]

const ACCENTS: { value: Accent; label: string; color: string }[] = [
  { value: 'emerald', label: 'Esmeralda', color: '#10b981' },
  { value: 'cyan',    label: 'Ciano',     color: '#06b6d4' },
  { value: 'blue',    label: 'Azul',      color: '#3b82f6' },
  { value: 'purple',  label: 'Roxo',      color: '#a855f7' },
]

function ThemePickerStep() {
  const { theme, accent, setTheme, setAccent } = useTheme()
  return (
    <div className="ot-theme-picker">
      <p className="ot-theme-label">Escolha o tema:</p>
      <div className="ot-theme-row">
        {THEMES.map(t => (
          <button
            key={t.value}
            className={`ot-theme-btn ${theme === t.value ? 'active' : ''}`}
            onClick={() => setTheme(t.value)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <p className="ot-theme-label" style={{ marginTop: 12 }}>Escolha a cor de destaque:</p>
      <div className="ot-accent-row">
        {ACCENTS.map(a => (
          <button
            key={a.value}
            className={`ot-accent-btn ${accent === a.value ? 'active' : ''}`}
            style={{ '--accent-color': a.color } as React.CSSProperties}
            onClick={() => setAccent(a.value)}
            title={a.label}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Arrow pointing from tooltip to element ────────────────────────────────────
function TourArrow({ rect, tipRef }: { rect: DOMRect; tipRef: React.RefObject<HTMLDivElement | null> }) {
  const [line, setLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  useEffect(() => {
    if (!tipRef.current) return
    const tipRect = tipRef.current.getBoundingClientRect()
    // Arrow from center of tooltip to center-top of highlight rect
    setLine({
      x1: tipRect.left + tipRect.width / 2,
      y1: tipRect.top,
      x2: rect.left + rect.width / 2,
      y2: rect.bottom,
    })
  }, [rect, tipRef])

  if (!line) return null
  return (
    <svg className="ot-arrow-svg" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10001 }}>
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="var(--ot-accent)" />
        </marker>
      </defs>
      <line
        x1={line.x1} y1={line.y1}
        x2={line.x2} y2={line.y2}
        stroke="var(--ot-accent)"
        strokeWidth="2"
        strokeDasharray="6 4"
        markerEnd="url(#arrowhead)"
      />
    </svg>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────────
const THEME_STEP: TourStep = {
  selector: '__theme__',
  title: '🎨 Personalize sua aparência',
  description: 'Escolha o tema e cor de destaque da plataforma. Você pode mudar isso a qualquer momento no seu perfil.',
}

function storageKey(userId?: string) {
  return `onboardingCompleted_${userId ?? 'guest'}`
}

export default function OnboardingTour() {
  const { user } = useAuth()
  const { accent } = useTheme()

  const roleId = user?.roleId ?? 'user'
  const steps: TourStep[] = [
    THEME_STEP,
    ...(roleBasedSteps[roleId] ?? defaultSteps),
  ]

  const [current, setCurrent] = useState(0)
  const [show, setShow] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  // Interactive mode: waiting for user to click the highlighted element
  const [waitingClick, setWaitingClick] = useState(false)
  const tipRef = useRef<HTMLDivElement>(null)

  // Derive CSS accent variable from app accent
  const accentColor: Record<Accent, string> = {
    emerald: '#10b981',
    cyan:    '#06b6d4',
    blue:    '#3b82f6',
    purple:  '#a855f7',
  }

  // Show tour on first visit per user
  useEffect(() => {
    if (!user) return
    if (!localStorage.getItem(storageKey(user.id))) {
      setShow(true)
    }
  }, [user])

  // Compute highlighted element rect
  useEffect(() => {
    if (!show) return
    const step = steps[current]
    if (step.selector === '__theme__') { setRect(null); return }

    const el = document.querySelector(step.selector) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => setRect(el.getBoundingClientRect()), 300)
      setWaitingClick(!!step.interactive)
    } else {
      setRect(null)
    }
  }, [current, show])

  // Listen for click on highlighted element in interactive mode
  useEffect(() => {
    if (!waitingClick || !rect) return
    const step = steps[current]
    const el = document.querySelector(step.selector) as HTMLElement | null
    if (!el) return

    const handler = () => {
      setWaitingClick(false)
      setTimeout(() => goNext(), 200)
    }
    el.addEventListener('click', handler, { once: true })
    return () => el.removeEventListener('click', handler)
  }, [waitingClick, rect, current])

  const goNext = useCallback(() => {
    setCurrent(c => (c < steps.length - 1 ? c + 1 : c))
  }, [steps.length])

  const goPrev = useCallback(() => setCurrent(c => (c > 0 ? c - 1 : c)), [])

  const finish = useCallback(() => {
    if (user) localStorage.setItem(storageKey(user.id), 'true')
    setShow(false)
  }, [user])

  /** Called from Profile – resets tour */
  // Exposed globally so ProfileSheet can trigger it
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__restartOnboardingTour = () => {
      if (user) localStorage.removeItem(storageKey(user.id))
      setCurrent(0)
      setShow(true)
    }
  }, [user])

  if (!show) return null

  const step = steps[current]
  const isThemeStep = step.selector === '__theme__'
  const isLast = current === steps.length - 1
  const accentVar = accentColor[accent]

  // Tooltip positioning: below element, or centered for theme step
  const tipStyle: React.CSSProperties = rect
    ? {
        top: Math.min(rect.bottom + 16, window.innerHeight - 220),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 340)),
        maxWidth: 320,
      }
    : {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: 360,
      }

  return (
    <div className="ot-backdrop" style={{ '--ot-accent': accentVar } as React.CSSProperties}>
      {/* Overlay */}
      <div className="ot-overlay" />

      {/* Highlighted element cutout */}
      <AnimatePresence mode="wait">
        {rect && (
          <motion.div
            key={`highlight-${current}`}
            className="ot-highlight"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.25 }}
            style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
          />
        )}
      </AnimatePresence>

      {/* Arrow */}
      {rect && <TourArrow rect={rect} tipRef={tipRef} />}

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`tooltip-${current}`}
          ref={tipRef}
          className="ot-tooltip"
          style={tipStyle}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {/* Progress dots */}
          <div className="ot-dots">
            {steps.map((_, i) => (
              <span key={i} className={`ot-dot ${i === current ? 'active' : ''}`} />
            ))}
          </div>

          <h3 className="ot-title">{step.title}</h3>
          <p className="ot-desc">{step.description}</p>

          {/* Theme picker rendered inline */}
          {isThemeStep && <ThemePickerStep />}

          {/* Interactive hint */}
          {waitingClick && (
            <p className="ot-interactive-hint">👆 Clique no elemento destacado para continuar!</p>
          )}

          <div className="ot-controls">
            {current > 0 && (
              <button className="ot-btn secondary" onClick={goPrev}>← Anterior</button>
            )}
            <button
              className="ot-btn primary"
              onClick={isLast ? finish : goNext}
              disabled={waitingClick}
            >
              {isLast ? '✅ Concluir' : 'Próximo →'}
            </button>
            <button className="ot-btn ghost" onClick={finish}>Pular</button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
