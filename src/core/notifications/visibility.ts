import type { AppNotification } from './types'
import type { User } from '../auth/types'
import { workspaceStore } from '../workspaces/store'

/**
 * Decide se uma notificação deve aparecer para o usuário atual.
 * Sem usuário (contexto de teste / não autenticado) → sem filtro.
 */
export function notificationAppliesTo(n: AppNotification, user: User | null): boolean {
  if (!user) return true

  // Sem audience = notificação legada (todas eram de aprovação) → só admins
  if (!n.audience) {
    return user.role === 'admin'
  }

  switch (n.audience) {
    case 'role':
      if (n.targetRole && n.targetRole !== user.role) return false
      if (n.targetSuperAdmin && !user.is_super_admin) return false
      return true
    case 'workspace':
      return workspaceStore.matches({ workspace_id: n.workspace_id })
    case 'user':
      return !!n.targetUserId && n.targetUserId === user.id
    default:
      return true
  }
}
