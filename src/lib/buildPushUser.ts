import type { User } from '../core/auth/types'
import type { PushUserInfo } from './usePushNotifications'
import { permissionService } from '../core/permissions/service'
import { assignedWorkspaceIds } from '../core/memberships/service'
import { appRegistry } from '../appRegistry'

/**
 * Monta o payload de segmentação do push (inscrição) a partir do usuário logado.
 *
 * Usado por quem assina as notificações (PushNotificationButton, Settings do
 * Chamados, PushStatusCard) — o backend filtra as inscrições por esse payload
 * (módulo `apps`, `workspace_ids`, `notify_settings`).
 *
 * ── `apps`: PAYLOAD LEGADO, SEM PODER DE DECISÃO (F2-D-H §E) ─────────────
 * O mapa `apps` (nível efetivo por app, derivado de `resolveAppAccess`) é
 * gravado no snapshot da inscrição e devolvido na listagem administrativa, mas
 * **não participa mais do targeting**: desde o F2-D-E (`09ecff4`) o
 * `_target_subs` decide por membership ativa + `role_permissions`, resolvidos
 * no servidor (`_module_action_ok` em `reservalab/api/app.py:947`). O
 * comentário do backend e os testes `test_push_targeting_rbac2.py` travam isso
 * (`apps.reservalab='full'` no snapshot NÃO concede envio).
 *
 * MANTIDO de propósito: removê-lo mudaria o contrato de exibição da tela
 * administrativa de inscrições e esvaziaria o campo de linhas já gravadas, sem
 * ganho funcional. Fica como compatibilidade até a decisão de produto sobre a
 * visibilidade de módulos. Não use este campo para autorizar nada.
 */
export function buildPushUser(user: User): PushUserInfo {
  const apps: Record<string, boolean | string> = {}
  if (user.is_super_admin) {
    for (const app of appRegistry) apps[app.id] = 'full'
  } else {
    const role = permissionService.getRoleForUser(user.roleId)
    for (const app of appRegistry) {
      apps[app.id] = permissionService.resolveAppAccess(role, user, app.id) ?? false
    }
  }
  return {
    id: user.id,
    name: user.name,
    role: user.roleId,
    is_super_admin: user.is_super_admin,
    // Compat de payload (o backend filtra por este campo): origem = memberships
    // ativas, nunca a coluna legada.
    workspace_ids: assignedWorkspaceIds(user),
    apps,
    notify_settings: user.notify_settings,
  }
}
