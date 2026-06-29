import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { icons } from '../../../lib/icons'

const RADIUS = 54
const CIRC = 2 * Math.PI * RADIUS

export function QRGenerator() {
  const navigate = useNavigate()
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    if (countdown <= 0) {
      navigate('/stock/qr', { replace: true })
      return
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown, navigate])

  const progress = countdown / 3

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-8 overflow-hidden bg-surface p-8 text-fg">
      {/* Wallpaper blob */}
      <div className="pointer-events-none absolute -right-32 -top-32 h-[500px] w-[500px] rounded-full bg-sky-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-blue-500/10 blur-3xl" />

      {/* Anel de progresso */}
      <div className="relative flex items-center justify-center">
        <svg width="140" height="140" className="-rotate-90">
          <circle
            cx="70"
            cy="70"
            r={RADIUS}
            fill="none"
            stroke="oklch(0.5 0.1 240 / 0.15)"
            strokeWidth="6"
          />
          <circle
            cx="70"
            cy="70"
            r={RADIUS}
            fill="none"
            stroke="oklch(0.7 0.18 220)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - progress)}
            className="transition-all duration-1000 ease-linear"
          />
        </svg>
        <span className="absolute text-3xl font-bold tracking-tight text-sky-400">{countdown}</span>
      </div>

      {/* Card do app destino */}
      <div className="animate-[slide-up_0.35s_ease-out] flex items-center gap-4 rounded-2xl border border-line/40 bg-card/70 p-4 backdrop-blur-xl shadow-[var(--shadow-card)]">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-md shadow-sky-500/20">
          <icons.ui.qrCode size={24} />
        </div>
        <div>
          <p className="text-xs font-medium text-fg-muted">Redirecionando para</p>
          <p className="text-base font-semibold text-fg">Estoque</p>
        </div>
      </div>

      {/* Barra linear sutil */}
      <div className="h-1 w-48 overflow-hidden rounded-full bg-input">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-500 transition-all duration-1000 ease-linear"
          style={{ width: `${(1 - progress) * 100}%` }}
        />
      </div>

      <button
        type="button"
        onClick={() => navigate('/stock/qr', { replace: true })}
        className="rounded-xl bg-card px-6 py-3 text-sm font-medium text-fg-muted transition-all hover:bg-input hover:text-fg active:scale-95"
      >
        Ir agora
      </button>
    </div>
  )
}
