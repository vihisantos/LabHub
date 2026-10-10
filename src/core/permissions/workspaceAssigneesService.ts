import { defaultDb } from '../../lib/supabase'
import { dbRoleToRoleId } from './membership'
import type { Membership } from './membership'

/**
 * RBAC 2.0 — lista de atribuição (dropdown "Atribuir a" e transferência do
 * módulo chamados).
 *
 * Fonte: memberships ATIVAS do workspace + perfis visíveis por RLS, filtradas
 * pelos candidatos LEGITIMAMENTE aptos a ATENDER um chamado segundo a MESMA
 * resolução do motor RBAC 2.0 (`rbac_can`): Action `ticket.claim` (scope
 * workspace) da role BASE, corrigida pelos OVERRIDES por membership
 * (`membership_overrides`, migration 036 — `override > role`).
 *
 * Precedência (idêntica a `rbac_can` e ao backend `_eligible_to_attend`):
 *   1. perfil `is_super_admin` ⇒ elegível (bypass global, 1ª regra do motor);
 *   2. override `deny` para `ticket.claim` ⇒ inelegível (override vence a role);
 *   3. override `allow` para `ticket.claim` ⇒ elegível (concede mesmo sem base);
 *   4. senão, elegível sse a role base concede `ticket.claim` (scope workspace).
 * Também exige membership `status='active'` e perfil `status='active'`.
 *
 *   - `memberships_select`       → is_super_admin OR user_belongs_to_workspace(ws)
 *   - `profiles_select`          → self OR is_super_admin OR profile_visible_to_me
 *   - `role_permissions_select`  → blueprint global OR membro do workspace
 *   - `membership_overrides_select` → super admin OR membro do workspace da membership
 *
 * `role_permissions` NÃO é fonte completa: sozinho ele divergiria da autoridade
 * sempre que houver override. Nenhuma RPC nova nem gabarito: leitura direta já
 * autorizada pela RLS, fail-closed (erro/leitura indisponível de QUALQUER
 * tabela ⇒ lista vazia, nunca dado errado). A validação do servidor permanece a
 * autoridade; esta lista só a ESPELHA.
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
    .select('id, name, status, role, is_super_admin')
    .in('id', ids)

  if (profilesError) {
    console.warn('[Assignees] profiles fetch error:', profilesError.message)
    return []
  }

  // Base: roles cuja role concede `ticket.claim` (scope workspace).
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
  const baseEligibleRoleIds = new Set(
    ((claimPerms as { role_id: string }[] | null) ?? []).map((p) => p.role_id),
  )

  // Overrides por membership para `ticket.claim` (override > role). Lidos
  // pelas memberships do PRÓPRIO workspace do usuário (RLS autoriza).
  const membershipIds = rows.map((m) => m.id)
  const { data: overrides, error: overridesError } = await defaultDb
    .from('membership_overrides')
    .select('membership_id, effect')
    .in('membership_id', membershipIds)
    .eq('action', 'ticket.claim')

  if (overridesError) {
    console.warn('[Assignees] membership_overrides fetch error:', overridesError.message)
    return []
  }
  const overrideByMembership = new Map(
    ((overrides as { membership_id: string; effect: string }[] | null) ?? []).map(
      (o) => [o.membership_id, o.effect],
    ),
  )

  const profileMap = new Map(
    ((profiles as { id: string; name: string; status: string; role: string; is_super_admin?: boolean }[] | null) ?? []).map(
      (p) => [p.id, p],
    ),
  )

  return rows
    .map((m) => {
      const p = profileMap.get(m.profile_id)
      if (!p || p.status !== 'active') return null
      // Precedência idêntica a `rbac_can`: super admin > override > role base.
      const override = overrideByMembership.get(m.id)
      const eligible = p.is_super_admin
        ? true
        : override === 'deny'
          ? false
          : override === 'allow'
            ? true
            : baseEligibleRoleIds.has(m.role_id)
      if (!eligible) return null
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