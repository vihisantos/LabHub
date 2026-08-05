import type { AppNotification } from './types'
import type { User } from '../auth/types'
import { workspaceStore } from '../workspaces/store'
import { permissionService } from '../permissions/service'
import { appRegistry } from '../../appRegistry'

function hasAppAccess(user: User, appId: string): boolean {
  if (user.role === 'admin') return true
  permissionService.initDefaults()
  permissionService.migrate()
  const role = permissionService.getRoleForUser(user.role)
  return permissionService.resolveAppAccess(role, user, appId) !== null
}

/**
 * Decide se uma notificação deve aparecer para o usuário atual.
 * Sem usuário (contexto de teste / não autenticado) → sem filtro.
 *
 * Segmentação (híbrida):
 * - Automática: a notificação de um app (módulo do appRegistry) só aparece
 *   para quem tem acesso ao app e pertence ao workspace-alvo.
 * - Manual: notify_settings do perfil (mudo global / canal in-app por app).
 */
export function notificationAppliesTo(n: AppNotification, user: User | null): boolean {
  if (!user) return true

  const settings = user.notify_settings
  if (settings?.muted) return false

  // Segmentação por app: módulos do appRegistry exigem acesso ao app
  const isAppModule = !!n.module && appRegistry.some((app) => app.id === n.module)
  if (isAppModule) {
    if (!hasAppAccess(user, n.module)) return false
    const channel = settings?.apps?.[n.module]
    if (channel && channel.inapp === false) return false
  }

  // Filtro por workspace
  if (n.workspace_id && !workspaceStore.matches({ workspace_id: n.workspace_id })) return false

  // Módulo de app sem audience = entrega a todos com acesso ao app
  if (isAppModule && !n.audience) return true

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
