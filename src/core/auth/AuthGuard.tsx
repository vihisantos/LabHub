import { useEffect, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from './useAuth'
import { authService } from './service'

interface AuthGuardProps {
  children: ReactNode
  fallback?: ReactNode
}

/* ── Animated clock SVG ── */
function AnimatedClock() {
  return (
    <motion.svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      {/* Outer ring with rotating dash */}
      <motion.circle
        cx="24" cy="24" r="22"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="8 4"
        strokeLinecap="round"
        className="text-emerald-500/40"
        fill="none"
        animate={{ rotate: 360 }}
        style={{ originX: '24px', originY: '24px' }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />
      {/* Inner circle */}
      <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="1.5" className="text-emerald-500/20" fill="none" />
      {/* Clock hand - minute */}
      <motion.line
        x1="24" y1="24" x2="24" y2="12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="text-emerald-500"
        animate={{ rotate: 360 }}
        style={{ originX: '24px', originY: '24px' }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      />
      {/* Clock hand - hour */}
      <motion.line
        x1="24" y1="24" x2="28" y2="16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-emerald-400"
        animate={{ rotate: 360 }}
        style={{ originX: '24px', originY: '24px' }}
        transition={{ duration: 48, repeat: Infinity, ease: 'linear' }}
      />
      {/* Center dot */}
      <circle cx="24" cy="24" r="3" className="fill-emerald-500" />
      {/* Pulsing rings */}
      <motion.circle
        cx="24" cy="24" r="22"
        stroke="currentColor"
        strokeWidth="1"
        className="text-emerald-500/30"
        fill="none"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0, 0.5, 0], scale: [0.85, 1.1, 0.85] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.circle
        cx="24" cy="24" r="22"
        stroke="currentColor"
        strokeWidth="0.5"
        className="text-emerald-500/20"
        fill="none"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0, 0.3, 0], scale: [0.9, 1.2, 0.9] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      />
    </motion.svg>
  )
}

/* ── Floating dots background ── */
function FloatingDots() {
  const dots = Array.from({ length: 8 })
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {dots.map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full bg-emerald-500/20"
          style={{
            left: `${15 + (i * 10) % 70}%`,
            top: `${20 + (i * 13) % 60}%`,
          }}
          animate={{
            y: [0, -20, 0],
            opacity: [0, 0.4, 0],
          }}
          transition={{
            duration: 3 + (i % 3),
            repeat: Infinity,
            delay: i * 0.4,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

/* ── Play approval sound + vibration ── */
function playApprovalSound() {
  // Vibrate on supported devices (mobile)
  try {
    if (navigator.vibrate) {
      navigator.vibrate([80, 40, 80, 40, 120])
    }
  } catch { /* ignore */ }

  // Play chime using Web Audio API
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const now = ctx.currentTime

    // Create a pleasant two-tone chime
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()

    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(523.25, now)       // C5
    osc1.frequency.setValueAtTime(659.25, now + 0.1) // E5

    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(783.99, now + 0.2) // G5

    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.15, now + 0.05)
    gain.gain.linearRampToValueAtTime(0.08, now + 0.3)
    gain.gain.linearRampToValueAtTime(0, now + 0.6)

    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(ctx.destination)

    osc1.start(now)
    osc1.stop(now + 0.3)
    osc2.start(now + 0.15)
    osc2.stop(now + 0.5)

    // Cleanup
    setTimeout(() => ctx.close(), 1000)
  } catch {
    // Audio not supported — silently ignore
  }
}

/* ── Animated dashcircle text ── */
function WaitingDots() {
  return (
    <span className="inline-flex">
      {['V','e','r','i','f','i','c','a','n','d','o'].map((char, i) => (
        <motion.span
          key={i}
          className="inline-block"
          animate={{
            opacity: [0.3, 1, 0.3],
            y: [0, -2, 0],
          }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            delay: i * 0.08,
            ease: 'easeInOut',
          }}
        >
          {char}
        </motion.span>
      ))}
      <motion.span
        className="inline-block w-[2px]"
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      >
        |
      </motion.span>
    </span>
  )
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { user, loading, isConfigured } = useAuth()

  // Poll for profile changes when user is pending
  useEffect(() => {
    if (user?.status !== 'pending') return

    const interval = setInterval(async () => {
      const updated = await authService.refreshProfile()
      // If status changed to active, play the approval sound
      if (updated?.status === 'active') {
        playApprovalSound()
      }
    }, 15_000)

    return () => clearInterval(interval)
  }, [user?.status])

  if (!isConfigured) {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-xs text-fg-muted">Verificando autenticação...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return fallback ? <>{fallback}</> : (
      <div className="flex min-h-dvh items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
            <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-fg">Acesso Restrito</h2>
            <p className="mt-1 text-sm text-fg-muted">Faça login para acessar o LabHub</p>
          </div>
        </div>
      </div>
    )
  }

  // Pending approval screen — animated!
  if (user.status === 'pending') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="relative flex min-h-dvh flex-col items-center justify-center bg-surface overflow-hidden"
      >
        <FloatingDots />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.2 }}
          className="relative z-10 flex flex-col items-center gap-6 px-6 text-center max-w-sm"
        >
          {/* Animated clock */}
          <div className="text-emerald-500">
            <AnimatedClock />
          </div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <motion.h2
              className="text-xl font-bold text-fg"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              Aprovação Pendente
            </motion.h2>
            <motion.p
              className="mt-3 text-sm text-fg-muted leading-relaxed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              Sua conta foi criada e está aguardando aprovação do administrador.
              Você receberá acesso automaticamente quando for aprovado.
            </motion.p>
          </motion.div>

          {/* Animated status line */}
          <motion.div
            className="flex items-center gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/5 px-5 py-3"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, duration: 0.4 }}
          >
            {/* Spinning ring */}
            <div className="relative flex h-5 w-5 items-center justify-center">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </div>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <WaitingDots />
            </span>
          </motion.div>

          {/* Email */}
          <motion.p
            className="text-xs text-fg-dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            Email:{' '}
            <span className="font-medium text-fg-muted">{user.email}</span>
          </motion.p>

          {/* Bottom shine line */}
          <motion.div
            className="mt-2 h-px w-32 bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent"
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
          />
        </motion.div>
      </motion.div>
    )
  }

  return <>{children}</>
}
