import type { User } from '../core/auth/types'
import type { PushUserInfo } from './usePushNotifications'
import { permissionService } from '../core/permissions/service'
import { appRegistry } from '../appRegistry'

/**
 * Monta o payload de segmentação do push (inscrição) a partir do usuário logado.
 *
 * Usado por quem assina as notificações (PushNotificationButton, Settings do
 * Chamados, PushStatusCard) — o backend filtra as inscrições por esse payload
 * (módulo `apps`, `workspace_ids`, `notify_settings`).
 */
export function buildPushUser(user: User): PushUserInfo {
  const apps: Record<string, boolean> = {}
  if (user.is_super_admin) {
    for (const app of appRegistry) apps[app.id] = true
  } else {
    const role = permissionService.getRoleForUser(user.roleId)
    for (const app of appRegistry) {
      apps[app.id] = permissionService.resolveAppAccess(role, user, app.id) !== null
    }
  }
  return {
    id: user.id,
    name: user.name,
    role: user.roleId,
    is_super_admin: user.is_super_admin,
    workspace_ids: user.workspace_ids,
    apps,
    notify_settings: user.notify_settings,
  }
}
