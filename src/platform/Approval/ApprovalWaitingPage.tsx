import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth/useAuth'
import { authService } from '../../core/auth/service'
import { useRealtimeSubscription } from '../../lib/useRealtimeSubscription'
import { ApprovalScreen as ApprovalWaitingPage } from './ApprovalScreen'

export { ApprovalScreen as ApprovalWaitingPage } from './ApprovalScreen'
export type { ApprovalWaitingPageProps } from './ApprovalScreen'

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
 * - Permanece pendente → página de espera (realtime na própria linha de `profiles`
 *   como primário + poll de 15s como fallback).
 */
export function ApprovalRoute() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()

  const [phase, setPhase] = useState<'checking' | 'waiting' | 'celebrating' | 'denied' | 'no-session'>('checking')
  const [countdown, setCountdown] = useState(3)
  const pendingUserRef = useRef<string | null>(null)

  // Realtime primário: a RLS de `profiles_select` (id = auth.uid()) entrega ao
  // pendente os UPDATEs da própria linha; ao aprovar, o refresh publica o novo
  // status e o fluxo abaixo celebra automaticamente. Eventos de outras linhas
  // visíveis são ignorados (defesa em profundidade).
  useRealtimeSubscription(
    'profiles',
    'UPDATE',
    (payload) => {
      const row = (payload.new ?? {}) as { id?: string }
      if (user && row.id === user.id) {
        authService.refreshProfile().catch(() => { /* sessão inválida é tratada pelo AuthContext */ })
      }
    },
    { enabled: !!user && user.status === 'pending' },
  )

  useEffect(() => {
    if (loading) return
    if (!user) {
      pendingUserRef.current = null
      setPhase('no-session')
    } else if (user.status === 'pending') {
      pendingUserRef.current = user.id
      setCountdown(3)
      setPhase('waiting')
    } else if (user.status !== 'active') {
      pendingUserRef.current = null
      setPhase('denied')
    } else if (pendingUserRef.current === user.id) {
      setPhase('celebrating')
    } else {
      navigate('/', { replace: true })
    }
  }, [loading, user?.id, user?.status, navigate])

  useEffect(() => {
    if (!user || user.status === 'active') return
    // Defesa em profundidade: o ThemeProvider já sincroniza o perfil; este poll
    // garante a detecção da aprovação independente de realtime/re-sync da UI.
    const t = setInterval(() => {
      authService.refreshProfile().catch(() => { /* sessão inválida é tratada pelo AuthContext */ })
    }, 15_000)
    return () => clearInterval(t)
  }, [user?.id, user?.status])

  useEffect(() => {
    if (phase !== 'celebrating' || loading || user?.status !== 'active' || pendingUserRef.current !== user.id) return
    playApprovalSound()
    const t = setTimeout(() => navigate('/', { replace: true }), 3_000)
    const iv = setInterval(() => setCountdown((s) => Math.max(0, s - 1)), 1_000)
    return () => {
      clearTimeout(t)
      clearInterval(iv)
    }
  }, [phase, navigate, loading, user?.id, user?.status])

  if (loading || phase === 'checking') {
    return <ApprovalWaitingPage status="loading" />
  }

  if (!user || phase === 'no-session') {
    return <Navigate to="/login" replace />
  }

  if (user.status === 'blocked' || user.status === 'rejected') {
    return <ApprovalWaitingPage status={user.status} onSignOut={() => {
      void authService.signOut().finally(() => navigate('/login', { replace: true }))
    }} />
  }

  if (phase === 'celebrating' && user.status === 'active' && pendingUserRef.current === user.id) {
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