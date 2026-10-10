import { defaultDb } from '../../lib/supabase'
import { dbRoleToRoleId } from './membership'
import type { Membership } from './membership'

/**
 * RBAC 2.0 — lista de atribuição (dropdown "Atribuir a" e transferência do
 * módulo chamados).
 *
 * Fonte: memberships ATIVAS do workspace + perfis visíveis por RLS, filtradas
 * pelos candidatos LEGITIMAMENTE aptos a ATENDER um chamado — Action
 * `ticket.claim` (scope workspace) no cargo da membership (RBAC 2.0 — migration
 * 038). É a MESMA regra do backend (`_eligible_to_attend`): a lista nunca
 * diverge da autoridade do servidor.
 *   - `memberships_select`     → is_super_admin OR user_belongs_to_workspace(ws)
 *   - `profiles_select`        → self OR is_super_admin OR profile_visible_to_me
 *   - `role_permissions_select`→ blueprint global OR membro do workspace
 *
 * Nenhuma RPC nova nem gabarito: leitura direta já autorizada pela RLS,
 * fail-closed (erro/RPC indisponível ⇒ lista vazia, nunca dado errado).
 */

export interface WorkspaceAssignee {
  userId: string
  profileId: string
  name: string
  roleId: string
}

export async function getWorkspaceAssignees(workspaceId: string): Promise<WorkspaceAssignee[]> {
  if (!defaultDb || !workspaceId) return []

  const { data: memberships, error } = await defaultDb
    .from('memberships')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')

  if (error) {
    console.warn('[Assignees] memberships fetch error:', error.message)
    return []
  }

  const rows = (memberships as Membership[] | null) ?? []
  if (rows.length === 0) return []

  const roleIds = [...new Set(rows.map((m) => m.role_id).filter(Boolean))]
  if (roleIds.length === 0) return []

  const ids = [...new Set(rows.map((m) => m.profile_id))]
  const { data: profiles, error: profilesError } = await defaultDb
    .from('profiles')
    .select('id, name, status, role')
    .in('id', ids)

  if (profilesError) {
    console.warn('[Assignees] profiles fetch error:', profilesError.message)
    return []
  }

  const { data: claimPerms, error: permsError } = await defaultDb
    .from('role_permissions')
    .select('role_id')
    .in('role_id', roleIds)
    .eq('action', 'ticket.claim')
    .eq('scope', 'workspace')

  if (permsError) {
    console.warn('[Assignees] role_permissions fetch error:', permsError.message)
    return []
  }
  const eligibleRoleIds = new Set(
    ((claimPerms as { role_id: string }[] | null) ?? []).map((p) => p.role_id),
  )

  const profileMap = new Map(
    ((profiles as { id: string; name: string; status: string; role: string }[] | null) ?? []).map((p) => [p.id, p]),
  )

  return rows
    .map((m) => {
      if (!eligibleRoleIds.has(m.role_id)) return null
      const p = profileMap.get(m.profile_id)
      if (!p || p.status !== 'active') return null
      return {
        userId: p.id,
        profileId: m.profile_id,
        name: p.name,
        roleId: dbRoleToRoleId(p.role),
      }
    })
    .filter((a): a is WorkspaceAssignee => a !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}