import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, AlertOctagon, Info, X } from 'lucide-react'
import type { UrgentAnnouncement } from '../hooks/useUrgentAnnouncements'

interface UrgentBannerProps {
  announcement: UrgentAnnouncement | null
  onDismiss?: () => void
}

export function UrgentBanner({ announcement, onDismiss }: UrgentBannerProps) {
  if (!announcement) return null

  const getStyle = () => {
    switch (announcement.severity) {
      case 'danger': {
        const Icon = AlertOctagon
        return { bg: 'linear-gradient(90deg, #dc2626 0%, #b91c1c 100%)', border: 'rgba(248, 113, 113, 0.4)', shadow: '0 8px 32px rgba(220, 38, 38, 0.4)', Icon, badgeText: 'URGENTE', badgeBg: '#7f1d1d' }
      }
      case 'warning': {
        const Icon = AlertTriangle
        return { bg: 'linear-gradient(90deg, #d97706 0%, #b45309 100%)', border: 'rgba(251, 191, 36, 0.4)', shadow: '0 8px 32px rgba(217, 119, 6, 0.4)', Icon, badgeText: 'ATENÇÃO', badgeBg: '#78350f' }
      }
      default: {
        const Icon = Info
        return { bg: 'linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)', border: 'rgba(96, 165, 250, 0.4)', shadow: '0 8px 32px rgba(37, 99, 235, 0.4)', Icon, badgeText: 'INFORMAÇÃO', badgeBg: '#1e3a8a' }
      }
    }
  }

  const style = getStyle()
  const IconComponent = style.Icon

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -60 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        style={{
          position: 'fixed',
          top: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          width: 'calc(100% - 4rem)',
          maxWidth: '1100px',
          background: style.bg,
          borderRadius: '1rem',
          padding: '0.85rem 1.5rem',
          boxShadow: style.shadow,
          border: `1px solid ${style.border}`,
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
          <div
            style={{
              padding: '0.5rem',
              borderRadius: '0.75rem',
              background: 'rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconComponent size={24} className="animate-pulse" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.15rem' }}>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '9999px',
                  background: style.badgeBg,
                  color: '#ffffff',
                  textTransform: 'uppercase',
                }}
              >
                {style.badgeText}
              </span>
            </div>
            <p style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, lineHeight: 1.3 }}>
              {announcement.message}
            </p>
          </div>
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            title="Fechar aviso"
          >
            <X size={18} />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
