import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { notificationService } from './service'

/**
 * Marca como lida qualquer notificação cuja `actionUrl` corresponde à página
 * que o usuário acabou de visitar — mesmo que ele tenha navegado direto, sem
 * clicar na notificação. Componente global (renderiza nada), montado no App.
 */
export function MarkNotificationsReadOnVisit() {
  const location = useLocation()

  useEffect(() => {
    const current = location.pathname + location.search
    for (const n of notificationService.getAll()) {
      if (n.read) continue
      if (n.actionUrl && current === n.actionUrl) {
        notificationService.markAsRead(n.id)
      }
    }
  }, [location.pathname, location.search])

  return null
}
