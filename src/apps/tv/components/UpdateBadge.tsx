import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { getUpdateAvailable, onUpdateAvailable } from '../../../lib/useServiceWorker'

const BADGE_DISPLAY_MS = 8000

export function UpdateBadge() {
  const [visible, setVisible] = useState(getUpdateAvailable())

  useEffect(() => {
    const unsub = onUpdateAvailable((available) => {
      setVisible(available)
    })
    return unsub
  }, [])

  /* Auto-hide after a few seconds */
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => setVisible(false), BADGE_DISPLAY_MS)
    return () => clearTimeout(timer)
  }, [visible])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '6rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1.25rem',
        borderRadius: '9999px',
        background: 'rgba(99, 102, 241, 0.15)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        backdropFilter: 'blur(8px)',
        color: '#a5b4fc',
        fontSize: '0.8rem',
        fontWeight: 600,
        animation: 'update-badge-in 0.3s ease-out',
        pointerEvents: 'none',
      }}
    >
      <RefreshCw size={14} style={{ animation: 'update-badge-spin 1s linear infinite' }} />
      <span>Nova versão disponível — recarregando...</span>
    </div>
  )
}

/* Keyframes injetados globalmente (uma vez) */
if (!document.getElementById('update-badge-styles')) {
  const style = document.createElement('style')
  style.id = 'update-badge-styles'
  style.textContent = `
    @keyframes update-badge-in {
      from { opacity: 0; transform: translateX(-50%) translateY(10px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes update-badge-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `
  document.head.appendChild(style)
}
