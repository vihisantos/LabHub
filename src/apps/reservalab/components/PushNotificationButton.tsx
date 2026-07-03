import { motion } from 'framer-motion'
import { usePushNotifications } from '../../../lib/usePushNotifications'

export function PushNotificationButton() {
  const { supported, permission, subscribed, loading, subscribe } = usePushNotifications([
    { id: 'labhub', name: 'LabHub', subscribeUrl: '/api/push/subscribe', icon: '' },
  ])

  if (!supported || permission === 'granted' || subscribed) return null

  const isDenied = permission === 'denied'

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.95 }}
      onClick={subscribe}
      disabled={loading}
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)',
        right: '1.5rem',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 20px',
        borderRadius: '9999px',
        border: 'none',
        background: isDenied
          ? 'rgba(239, 68, 68, 0.9)'
          : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        color: '#ffffff',
        fontSize: '14px',
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
        boxShadow: '0 4px 20px rgba(99, 102, 241, 0.35)',
      }}
    >
      <span style={{ fontSize: '1.2rem' }}>
        {loading ? '⏳' : isDenied ? '🔕' : '🔔'}
      </span>
      <span>
        {loading
          ? 'Ativando...'
          : isDenied
            ? 'Notificações bloqueadas'
            : 'Ativar Notificações'}
      </span>
    </motion.button>
  )
}
