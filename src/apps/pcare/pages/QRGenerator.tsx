import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { icons } from '../../../lib/icons'

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

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface p-8 text-fg">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30">
        <icons.ui.qrCode size={36} />
      </div>

      <div className="text-center">
        <h1 className="text-lg font-bold">Gerador de QR</h1>
        <p className="mt-1 text-sm text-fg-muted">Redirecionando para o app Estoque...</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-2.5 w-2.5 rounded-full bg-sky-500 transition-all duration-300"
              style={{ opacity: countdown > i ? 1 : 0.2 }}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-fg-muted">{countdown}s</span>
      </div>

      <button
        type="button"
        onClick={() => navigate('/stock/qr', { replace: true })}
        className="rounded-xl bg-card px-6 py-3 text-sm font-medium shadow-[var(--shadow-card)] transition-colors hover:bg-input"
      >
        Ir agora
      </button>
    </div>
  )
}
