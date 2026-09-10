import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { MascotProps, MascotState } from './types'

const GLASS_ID = 'mascot-glass-gradient'
const LIQUID_ID = 'mascot-liquid-gradient'
const GLOW_ID = 'mascot-glow-gradient'

/** Silhueta do frasco do mascote (simétrica em torno de x=100). */
const FLASK_PATH = `
  M87 54
  L113 54
  L113 72
  C113 76 124 82 143 92
  C160 102 166 120 166 136
  C166 158 144 170 100 170
  C56 170 34 158 34 136
  C34 120 40 102 57 92
  C76 82 87 76 87 72
  Z
`

const EYE_LEFT = 84
const EYE_RIGHT = 116
const EYE_Y = 114
const MOUTH_Y = 130

interface EyeProps {
  cx: number
  shape: 'open' | 'happy' | 'sleep' | 'error'
  pupilScale: number
}

function Eye({ cx, shape, pupilScale }: EyeProps) {
  const cy = shape === 'error' ? EYE_Y + 2 : EYE_Y
  if (shape === 'happy') {
    return <path d={`M ${cx - 5} ${cy} Q ${cx} ${cy - 5} ${cx + 5} ${cy}`} stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" fill="none" />
  }
  if (shape === 'sleep') {
    return <path d={`M ${cx - 5} ${cy} Q ${cx} ${cy + 3} ${cx + 5} ${cy}`} stroke="#0f172a" strokeWidth="3" strokeLinecap="round" fill="none" />
  }
  return (
    <g className="mascot-eye">
      <circle className="mascot-eye-open" cx={cx} cy={cy} r="6.5" fill="#0f172a" />
      <circle className="mascot-pupil" cx={cx} cy={cy} r={2.2 * pupilScale} fill="#ffffff" />
      {shape === 'error' && (
        <path className="mascot-brow" d={`M ${cx - 6} ${cy - 10} L ${cx + 4} ${cy - 6}`} stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
      )}
    </g>
  )
}

function mouthFor(state: MascotState): ReactNode {
  if (state === 'approved' || state === 'celebration') {
    return <path d={`M ${EYE_LEFT + 4} ${MOUTH_Y - 2} Q 100 ${MOUTH_Y + 12} ${EYE_RIGHT - 4} ${MOUTH_Y - 2}`} stroke="#0f172a" strokeWidth="4" strokeLinecap="round" fill="none" />
  }
  if (state === 'sleeping') {
    return <path d={`M ${EYE_LEFT + 4} ${MOUTH_Y + 2} Q 100 ${MOUTH_Y - 2} ${EYE_RIGHT - 4} ${MOUTH_Y + 2}`} stroke="#0f172a" strokeWidth="3" strokeLinecap="round" fill="none" />
  }
  if (state === 'error') {
    return <path d={`M ${EYE_LEFT + 4} ${MOUTH_Y + 3} Q 100 ${MOUTH_Y - 6} ${EYE_RIGHT - 4} ${MOUTH_Y + 3}`} stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" fill="none" />
  }
  if (state === 'notification') {
    return <circle cx="100" cy={MOUTH_Y} r="3" fill="#0f172a" />
  }
  return <path d={`M ${EYE_LEFT + 5} ${MOUTH_Y} Q 100 ${MOUTH_Y + 3} ${EYE_RIGHT - 5} ${MOUTH_Y}`} stroke="#0f172a" strokeWidth="3" strokeLinecap="round" fill="none" />
}

function ThoughtDots() {
  return (
    <g className="mascot-thoughts">
      <circle className="mascot-thought" cx="132" cy="34" r="3.5" fill="#94a3b8" />
      <circle className="mascot-thought" cx="146" cy="26" r="5" fill="#94a3b8" />
      <circle className="mascot-thought" cx="164" cy="18" r="6.5" fill="#cbd5e1" />
    </g>
  )
}

function Zzz() {
  return (
    <g className="mascot-zzz" fill="currentColor">
      <text className="mascot-zzz-text" x="138" y="52" fontSize="14" fontWeight="700" opacity="0.55">z</text>
      <text className="mascot-zzz-text" x="150" y="40" fontSize="18" fontWeight="700" opacity="0.75">z</text>
      <text className="mascot-zzz-text" x="166" y="24" fontSize="22" fontWeight="700" opacity="1">z</text>
    </g>
  )
}

function Sparkles() {
  const star = (x: number, y: number, s: number, delay: number) => (
    <path
      className="mascot-sparkle"
      style={{ animationDelay: `${delay}ms` }}
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -12 L3 -3 L12 0 L3 3 L0 12 L-3 3 L-12 0 L-3 -3 Z"
      fill="#fbbf24"
    />
  )
  return (
    <g className="mascot-sparkles">
      {star(28, 52, 1, 0)}
      {star(172, 44, 1.4, 180)}
      {star(182, 108, 1, 360)}
      {star(18, 116, 1.3, 540)}
    </g>
  )
}

const creaturePoses: Record<MascotState, { y?: number | number[]; rotate?: number | number[]; scale?: number | number[]; scaleY?: number | number[]; transition: object }> = {
  idle: { scaleY: [1, 1.02, 1], transition: { duration: 3.6, repeat: Infinity, ease: 'easeInOut' } },
  waiting: { scaleY: [1, 1.035, 1], transition: { duration: 4.8, repeat: Infinity, ease: 'easeInOut' } },
  loading: { scaleY: [1, 1.03, 1], transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' } },
  thinking: { rotate: [0, -1.5, 1.5, 0], transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } },
  sleeping: { scaleY: [1, 1.012, 1], transition: { duration: 7, repeat: Infinity, ease: 'easeInOut' } },
  approved: { y: [0, -10, -14, -10, 0], rotate: [0, -2, 0, 2, 0], transition: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } },
  celebration: { y: [0, -16, 0], rotate: [0, 2.5, -2.5, 0], scale: [1, 1.06, 1], transition: { duration: 0.62, repeat: Infinity, ease: 'easeInOut' } },
  error: { scaleY: [1, 1.02, 1], transition: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } },
  notification: { rotate: [0, -1.2, 1.2, 0], transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' } },
}

const armPoses = (state: MascotState): { left: number; right: number } => {
  if (state === 'approved' || state === 'celebration') return { left: -42, right: 42 }
  if (state === 'sleeping') return { left: 16, right: -16 }
  if (state === 'error') return { left: -8, right: 8 }
  return { left: 0, right: 0 }
}

export function Mascot({ state = 'idle', size = 168, className, 'aria-label': ariaLabel, ...rest }: MascotProps) {
  const celebrating = state === 'approved' || state === 'celebration'
  const sleeping = state === 'sleeping'
  const eyeShape: EyeProps['shape'] = celebrating ? 'happy' : sleeping ? 'sleep' : state === 'error' ? 'error' : 'open'
  const pupilScale = state === 'notification' ? 1.35 : 1
  const defaultLabel = `Mascote do LabHub — ${state}`

  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? defaultLabel}
      data-mascot-state={state}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={`mascot mascot-state-${state} ${className ?? ''}`}
      {...rest}
    >
      <defs>
        <linearGradient id={GLASS_ID} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="55%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
        <linearGradient id={LIQUID_ID} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
        <radialGradient id={GLOW_ID} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={celebrating ? '#fbbf24' : '#34d399'} stopOpacity="0.45" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </radialGradient>
        <clipPath id="mascot-body-clip">
          <path d={FLASK_PATH} />
        </clipPath>
      </defs>

      <circle className="mascot-aura" cx="100" cy="112" r="92" fill={`url(#${GLOW_ID})`} />

      <motion.g className="mascot-creature" animate={creaturePoses[state]} style={{ originX: '50%', originY: '88%' }}>
        <g className="mascot-antenna">
          <line x1="100" y1="58" x2="100" y2="42" stroke="#10b981" strokeWidth="4" strokeLinecap="round" />
          <circle className="mascot-antenna-tip" cx="100" cy="38" r="4.5" fill="#fcd34d" />
          <motion.circle
            cx="100"
            cy="38"
            r="11"
            fill="none"
            stroke="#fcd34d"
            strokeOpacity="0.5"
            strokeWidth="2"
            animate={{ scale: [0.7, 1.25, 0.7], opacity: [0.8, 0.15, 0.8] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </g>

        <path d={FLASK_PATH} fill={`url(#${GLASS_ID})`} stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.5" />

        <g clipPath="url(#mascot-body-clip)">
          <rect x="30" y="126" width="140" height="60" fill={`url(#${LIQUID_ID})`} opacity="0.92" />
          <path d="M34 126 q 8 -7 16 0 t 16 0 t 16 0 t 16 0 t 16 0 t 16 0 t 16 0 t 16 0" fill="#ffffff" opacity="0.18" />
          <circle cx="66" cy="146" r="3" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.4" />
          <circle cx="128" cy="152" r="2" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="1.2" />
        </g>

        <ellipse className="mascot-shine" cx="76" cy="86" rx="14" ry="34" fill="#ffffff" opacity="0.22" transform="rotate(-18 76 86)" />

        <g className="mascot-face">
          <g className="mascot-eyes">
            <Eye cx={EYE_LEFT} shape={eyeShape} pupilScale={pupilScale} />
            <Eye cx={EYE_RIGHT} shape={eyeShape} pupilScale={pupilScale} />
          </g>
          {mouthFor(state)}
          <g className="mascot-blush">
            <ellipse cx="70" cy="124" rx="6" ry="3.5" fill="#f472b6" opacity="0.3" />
            <ellipse cx="130" cy="124" rx="6" ry="3.5" fill="#f472b6" opacity="0.3" />
          </g>
        </g>

        <motion.g
          className="mascot-arm mascot-arm-left"
          animate={{ rotate: armPoses(state).left }}
          transition={{ type: 'spring', stiffness: 160, damping: 13 }}
          style={{ originX: '55px', originY: '106px' }}
        >
          <line x1="52" y1="102" x2="32" y2="120" stroke="#10b981" strokeWidth="9" strokeLinecap="round" />
          <circle cx="32" cy="120" r="6" fill="#fcd34d" />
        </motion.g>
        <motion.g
          className="mascot-arm mascot-arm-right"
          animate={{ rotate: armPoses(state).right }}
          transition={{ type: 'spring', stiffness: 160, damping: 13 }}
          style={{ originX: '145px', originY: '106px' }}
        >
          <line x1="148" y1="102" x2="168" y2="120" stroke="#10b981" strokeWidth="9" strokeLinecap="round" />
          <circle cx="168" cy="120" r="6" fill="#fcd34d" />
        </motion.g>

        <ellipse className="mascot-shadow" cx="100" cy="172" rx="40" ry="6" fill="#000000" opacity="0.07" />

        {state === 'approved' || state === 'celebration' ? <Sparkles /> : null}
        {state === 'sleeping' ? <Zzz /> : null}
        {state === 'loading' || state === 'thinking' ? <ThoughtDots /> : null}
      </motion.g>
    </svg>
  )
}