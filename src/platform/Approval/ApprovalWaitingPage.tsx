import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Database, LogOut, ShieldCheck, UserCheck } from 'lucide-react'
import { Mascot } from '../../core/mascot/Mascot'
import { useAuth } from '../../core/auth/useAuth'
import { authService } from '../../core/auth/service'

export interface ApprovalWaitingPageProps {
  status?: 'loading' | 'waiting' | 'approved' | 'rejected'
  secondsLeft?: number
  totalSeconds?: number
  onEnter?: () => void
  onRetry?: () => void
  onSignOut?: () => void
  email?: string
}

type PageStatus = NonNullable<ApprovalWaitingPageProps['status']>

const PARTICLE_COLORS: Record<PageStatus, string> = {
  loading: 'bg-blue-500/20',
  waiting: 'bg-emerald-500/20',
  approved: 'bg-emerald-500/20',
  rejected: 'bg-red-500/20',
}

const TITLE: Record<PageStatus, { text: string; className: string }> = {
  loading: { text: 'Verificando acesso', className: 'text-fg' },
  waiting: { text: 'Aprovação Pendente', className: 'text-fg' },
  approved: { text: 'Conta Aprovada!', className: 'bg-gradient-to-r from-blue-500 via-emerald-500 to-cyan-500 bg-clip-text text-transparent' },
  rejected: { text: 'Conta Negada', className: 'text-red-500' },
}

const MESSAGE: Record<PageStatus, string> = {
  loading: 'Só um instante, estamos preparando sua página de acesso.',
  waiting:
    'Sua conta foi criada e está aguardando aprovação do administrador. Você receberá acesso automaticamente quando for aprovado.',
  approved: 'Você recebeu acesso ao LabHub! O administrador está montando sua stack de aplicativos.',
  rejected: 'Criação de conta negada pelo administrador.',
}

function FloatingParticles({ status }: { status: PageStatus }) {
  const color = PARTICLE_COLORS[status]
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 7 }).map((_, i) => (
        <motion.div
          key={i}
          className={`absolute h-1.5 w-1.5 rounded-full ${color}`}
          style={{
            left: `${12 + ((i * 13) % 72)}%`,
            top: `${18 + ((i * 11) % 60)}%`,
          }}
          animate={{ y: [0, -24, 0], opacity: [0, 0.5, 0] }}
          transition={{ duration: 3.2 + (i % 3), repeat: Infinity, delay: i * 0.45, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

function SecurityNote() {
  const items = [
    { icon: ShieldCheck, text: 'Senhas nunca são armazenadas em texto puro — apenas hashes criptográficos.' },
    { icon: UserCheck, text: 'Seus dados só são visíveis para você e para o administrador da plataforma.' },
    { icon: Database, text: 'Seu acesso no servidor é segregado por conta e por workspace.' },
  ]
  return (
    <motion.div
      className="mt-7 w-full rounded-2xl border border-line bg-card p-4 text-left"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 1.1 }}
    >
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-fg-dim">Sua conta é protegida</p>
      <ul className="space-y-2.5">
        {items.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2.5">
            <Icon size={15} className="mt-0.5 shrink-0 text-emerald-500" />
            <span className="text-xs leading-relaxed text-fg-muted">{text}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  )
}

function ProgressPill() {
  return (
    <motion.div
      className="flex items-center justify-center gap-2.5 rounded-2xl border border-emerald-500/15 bg-emerald-500/5 px-5 py-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 1.15 }}
    >
      <div className="relative flex h-4 w-4 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
      </div>
      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Aguardando aprovação</span>
    </motion.div>
  )
}

export function ApprovalWaitingPage({
  status = 'waiting',
  secondsLeft = 60,
  totalSeconds = 60,
  onEnter,
  onRetry,
  onSignOut,
  email,
}: ApprovalWaitingPageProps) {
  const approved = status === 'approved'
  const rejected = status === 'rejected'
  const waiting = status === 'waiting'
  const loading = status === 'loading'
  const progress = totalSeconds > 0 ? Math.min(100, ((totalSeconds - secondsLeft) / totalSeconds) * 100) : 0
  const mascotState = approved ? 'celebration' : rejected ? 'error' : loading ? 'loading' : 'waiting'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex min-h-dvh flex-col overflow-hidden bg-surface px-5"
    >
      <FloatingParticles status={status} />

      <div className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center py-10">
        <motion.div
          className="mb-7 flex items-center gap-2.5"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <img src="/logo-192.png" alt="" className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-semibold text-fg">LabHub</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 180, damping: 16, delay: 0.15 }}
          className="w-full text-center"
        >
          <motion.div
            className="mx-auto mb-6 flex justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.25 }}
          >
            <Mascot state={mascotState} size={184} />
          </motion.div>

          <motion.h1
            className={`text-2xl font-bold ${TITLE[status].className}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
          >
            {TITLE[status].text}
          </motion.h1>

          <motion.p
            className="mt-3 text-sm leading-relaxed text-fg-muted"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            {MESSAGE[status]}
          </motion.p>

          {waiting && <div className="mt-7"><ProgressPill /></div>}

          {waiting && email && (
            <motion.p
              className="mt-4 text-xs text-fg-dim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.25 }}
            >
              Email: <span className="font-medium text-fg-muted">{email}</span>
            </motion.p>
          )}

          {approved && (
            <motion.div
              className="mt-7"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.8 }}
            >
              <div className="mb-2 flex items-center justify-between text-xs text-fg-muted">
                <span>Preparando seu ambiente...</span>
                <span className="font-mono text-emerald-500">{secondsLeft}s</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-emerald-500/15">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500"
                  initial={{ width: '0%' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: 'linear' }}
                />
              </div>
              {onEnter && (
                <motion.button
                  type="button"
                  onClick={onEnter}
                  className="mt-6 w-full rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-400 active:scale-[0.97]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                >
                  Entrar no LabHub
                </motion.button>
              )}
            </motion.div>
          )}

          {loading && (
            <div className="mt-7 flex items-center justify-center gap-2.5 rounded-2xl border border-line bg-card/60 px-5 py-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />
              <span className="text-xs font-medium text-fg-muted">Verificando autenticação...</span>
            </div>
          )}

          {waiting && <SecurityNote />}

          {rejected && (
            <motion.button
              type="button"
              onClick={onRetry}
              className="mt-8 w-full rounded-xl bg-red-500 py-3 text-sm font-semibold text-white transition-all hover:bg-red-400 active:scale-[0.97]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
            >
              Tentar novamente
            </motion.button>
          )}

          {waiting && onRetry && (
            <motion.button
              type="button"
              onClick={onRetry}
              className="mt-8 w-full rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-400 active:scale-[0.97]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.35 }}
            >
              Voltar para Login
            </motion.button>
          )}

          {waiting && onSignOut && (
            <motion.button
              type="button"
              onClick={onSignOut}
              className="mx-auto mt-3 flex items-center gap-1.5 text-xs font-medium text-fg-dim transition-colors hover:text-fg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
            >
              <LogOut size={13} />
              Sair da conta
            </motion.button>
          )}
        </motion.div>
      </div>

      <motion.footer
        className="relative z-10 pb-6 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 0.6 }}
      >
        <p className="text-[10px] text-fg-dim">LabHub · Conta segura e privada</p>
      </motion.footer>
    </motion.div>
  )
}

/* ── Play approval sound + vibration ── */
function playApprovalSound() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([80, 40, 80, 40, 120])
    }
  } catch { /* ignore */ }

  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const now = ctx.currentTime

    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()

    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(523.25, now)
    osc1.frequency.setValueAtTime(659.25, now + 0.1)

    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(783.99, now + 0.2)

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

    setTimeout(() => ctx.close(), 1000)
  } catch {
    // Audio not supported — silently ignore
  }
}

/**
 * Rota /approval-pending — única responsável por renderizar a página de aprovação.
 * - Sem sessão → /login.
 * - Usuário ativo que abriu a URL diretamente → / (sem celebração).
 * - Transição real pending → active → celebra ~3s com o mascote e entra no LabHub.
 * - Permanece pendente → página de espera (com poll de 15s + realtime já existente).
 */
export function ApprovalRoute() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()

  const [phase, setPhase] = useState<'checking' | 'waiting' | 'celebrating' | 'no-session'>('checking')
  const [countdown, setCountdown] = useState(3)
  const wasPendingRef = useRef<boolean | null>(null)

  useEffect(() => {
    if (loading) return
    if (!user) {
      setPhase('no-session')
      return
    }

    if (wasPendingRef.current === null) {
      wasPendingRef.current = user.status === 'pending'
      setPhase('waiting')
    }
  }, [loading, user])

  useEffect(() => {
    if (user?.status === 'pending') {
      setPhase('waiting')
    } else if (user) {
      // Usuário ativo: se veio de uma conta pendente celebra antes de liberar;
      // quem abriu a URL diretamente já está ativo e vai direto ao início.
      if (wasPendingRef.current) {
        setPhase('celebrating')
      } else {
        navigate('/', { replace: true })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.status])

  useEffect(() => {
    if (!user) return
    // Defesa em profundidade: o ThemeProvider já sincroniza o perfil; este poll
    // garante a detecção da aprovação independente de realtime/re-sync da UI.
    const t = setInterval(() => {
      authService.refreshProfile().catch(() => { /* sessão inválida é tratada pelo AuthContext */ })
    }, 15_000)
    return () => clearInterval(t)
  }, [!!user])

  useEffect(() => {
    if (phase !== 'celebrating') return
    playApprovalSound()
    const t = setTimeout(() => navigate('/', { replace: true }), 3_000)
    const iv = setInterval(() => setCountdown((s) => Math.max(0, s - 1)), 1_000)
    return () => {
      clearTimeout(t)
      clearInterval(iv)
    }
  }, [phase, navigate])

  if (loading || phase === 'checking') {
    return <ApprovalWaitingPage status="loading" />
  }

  if (!user || phase === 'no-session') {
    return <Navigate to="/login" replace />
  }

  if (phase === 'celebrating') {
    return (
      <ApprovalWaitingPage
        status="approved"
        secondsLeft={countdown}
        totalSeconds={3}
        onEnter={() => navigate('/', { replace: true })}
      />
    )
  }

  return (
    <ApprovalWaitingPage
      status="waiting"
      email={user.email}
      onSignOut={() => authService.signOut().finally(() => navigate('/login', { replace: true }))}
    />
  )
}