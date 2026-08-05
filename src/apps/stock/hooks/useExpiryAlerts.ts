import { useEffect } from 'react'
import { syncExpiryNotifications } from '../services/expiryAlerts'

const CHECK_INTERVAL_MS = 10 * 60 * 1000

/** Verifica periodicamente itens com validade próxima/vencida e gera notificações. */
export function useExpiryAlerts() {
  useEffect(() => {
    syncExpiryNotifications()
    const timer = setInterval(syncExpiryNotifications, CHECK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])
}
