import type { User } from '../core/auth/types'
import type { PushUserInfo } from './usePushNotifications'
import { assignedWorkspaceIds } from '../core/memberships/service'

/**
 * Monta o payload de segmentação do push (inscrição) a partir do usuário logado.
 *
 * Usado por quem assina as notificações (PushNotificationButton, Settings do
 * Chamados, PushStatusCard) — o backend filtra as inscrições por esse payload
 * (módulo `apps`, `workspace_ids`, `notify_settings`).
 *
 * ── `apps`: VAZIO POR DECISÃO DE ARQUITETURA (F2-D-N1) ────────────────────────
 *
 * ANTES (legado): `apps[appId] = permissionService.resolveAppAccess(role, user,
 * appId) ?? false`, isto é, o nível efetivo GLOBAL do usuário — o cargo local
 * (`Role.appAccess`) sobrescrito pelo override individual (`User.app_access`, a
 * coluna `profiles.app_access`).
 *
 * DEPOIS: `{}`. O campo continua no contrato (e, portanto, na tela de
 * diagnóstico de inscrições), mas vazio — e isso é intencional, não um efeito
 * colateral. Motivos, na ordem:
 *
 *   1. A cadeia legada acabou. `resolveAppAccess` lia `User.app_access` e
 *      `Role.appAccess`, e era a ÚLTIMA leitura viva dela no sistema. Com o
 *      F2-D-K/L a visibilidade passou a vir de `membership ativa → roles.slug →
 *      matriz`, e nada mais consome a coluna.
 *   2. Não existe representação GLOBAL fiel. A matriz RBAC2 é resolvida POR
 *      WORKSPACE (`resolveModuleVisibilities` exige `workspaceId` e resolve o
 *      slug de forma assíncrona), enquanto `apps` é um snapshot único por
 *      dispositivo, válido para todos os workspaces. Qualquer agregação
 *      (união/intersecção/maior nível) seria uma semântica INVENTADA, e um valor
 *      por unidade num campo global seria enganoso. Por isso o campo esvazia em
 *      vez de mentir.
 *   3. O campo nunca teve poder de decisão. O targeting é resolvido no SERVIDOR
 *      por membership ativa + `role_permissions`, via `_target_subs` +
 *      `_MODULE_PUSH_ACTIONS` (`reservalab/api/app.py:947`), e é fail-closed.
 *      Registros antigos com `apps: {reservalab: 'full'}` nunca concederam envio
 *      algum — é travado em `api/tests/test_push_targeting_rbac2.py`.
 *
 * O backend tolera a ausência e normaliza sozinho (`user.get('apps') or {}`,
 * `app.py:589`), então nenhuma alteração de backend foi necessária — e nenhuma
 * foi feita. Inscrições já gravadas no Redis continuam legíveis: o registro
 * antigo continua exibindo seus níveis, o novo mostra `{}`.
 *
 * ⚠️ NÃO use este campo para autorizar, segmentar ou granting nada. Para saber
 * o que o usuário pode ver, use `useModuleVisibility`; para saber o que ele pode
 * FAZER, use a Action (`useCanAccessAction`) ou o RLS.
 */
export function buildPushUser(user: User): PushUserInfo {
  return {
    id: user.id,
    name: user.name,
    role: user.roleId,
    is_super_admin: user.is_super_admin,
    // Compat de payload (o backend filtra por este campo): origem = memberships
    // ativas, nunca a coluna legada.
    workspace_ids: assignedWorkspaceIds(user),
    // Vazio por decisão — ver a nota acima. Mantido no payload para não alterar
    // o contrato nem a tela de diagnóstico.
    apps: {},
    notify_settings: user.notify_settings,
  }
}
