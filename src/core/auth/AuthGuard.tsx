import { useEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './useAuth'
import { authService } from './service'

interface AuthGuardProps {
  children: ReactNode
  fallback?: ReactNode
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
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
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

  // Conta pendente: a tela de espera vive na rota dedicada /approval-pending
  // (ApprovalRoute), que celebra a aprovação e libera a entrada.
  if (user.status === 'pending') {
    return <Navigate to="/approval-pending" replace />
  }

  return <>{children}</>
}
