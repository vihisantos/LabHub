import { defaultDb, stockDb } from '../../lib/supabase'
import type { User } from './types'
import type { Membership } from '../permissions/membership'
import { resolveRoleId } from '../permissions/types'

function fromDbUser<T extends Record<string, unknown>>(row: T): Omit<T, 'role'> & { roleId: string } {
  const { role, ...rest } = row
  return { ...rest, roleId: resolveRoleId(typeof role === 'string' ? role : undefined) }
}

const ROLE_ID_TO_DB: Record<string, string> = {
  'role-technician': 'technician',
  'role-viewer': 'viewer',
  'role-admin': 'admin',
  'role-coordinator': 'coordinator',
}

function toDbUser(data: Record<string, unknown>): Record<string, unknown> {
  const { roleId, ...rest } = data
  return { ...rest, ...(roleId !== undefined ? { role: ROLE_ID_TO_DB[String(roleId)] ?? roleId } : {}) }
}

async function notifyUser(userId: string, title: string, body: string, actionUrl = '/'): Promise<void> {
  if (!stockDb) return
  try {
    await stockDb.from('notifications').insert({
      id: crypto.randomUUID(),
      title,
      body,
      type: 'approval',
      severity: 'info',
      module: 'auth',
      // A notificação da conta aprovada vai para o USUÁRIO (que não acessa
      // /admin): sem ?pending= não há botões inline de aprovar/recusar
      // (NotificationItem) — o clique entra no LabHub.
      actionUrl,
      read: false,
      createdAt: new Date().toISOString(),
      audience: 'user',
      targetUserId: userId,
    })
  } catch (e) {
    console.warn('[Admin] Failed to notify user:', e)
  }
}

export const adminService = {
  listAllProfiles: async (): Promise<User[]> => {
    if (!defaultDb) return []

    const { data, error } = await defaultDb
      .from('profiles')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      console.error('[Admin] Failed to list profiles:', error.message)
      return []
    }

    return ((data || []) as Record<string, unknown>[]).map((row) => fromDbUser(row) as unknown as User)
  },

  listPendingProfiles: async (): Promise<User[]> => {
    if (!defaultDb) return []

    const { data, error } = await defaultDb
      .from('profiles')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Admin] Failed to list pending profiles:', error.message)
      return []
    }

    return ((data || []) as Record<string, unknown>[]).map((row) => fromDbUser(row) as unknown as User)
  },

  /**
   * Aprovação GLOBAL de conta (NÃO de membership).
   *
   * Responde somente: "esta conta está autorizada a existir no LabHub?"
   *   - NÃO cria memberships (acesso operacional segue fail-closed: sem
   *     memberships o motor RBAC 2.0 nega tudo);
   *   - NÃO escolhe workspace/unidade, NÃO atribui cargo, NÃO toca app_access
   *     (etapa posterior de configuração de acesso).
   * Depois da aprovação a conta fica: ativa + aguardando configuração de acesso.
   *
   * Autorização (fail-closed, server-side):
   *   - fila: RLS `profiles_select` (044) — só super admin enxerga pendentes;
   *   - escrita: policy `profiles_update` (067) + trigger
   *     `guard_profile_privileged_columns` (067, is_super_admin()) — usuário
   *     comum NÃO altera `status` de ninguém (raise 42501 / 0 linhas).
   * A rejeição NÃO é feita aqui: desde o #286 PR-1 ela é um estado terminal
   * (`rejected`, migration 074) gravado por `rejectUser` via endpoint
   * Super-Admin-only, que também desativa a identidade Auth. O `profiles` e o
   * `auth.users` são PRESERVADOS.
   */
  approveUser: async (userId: string): Promise<boolean> => {
    if (!defaultDb) return false

    const { data, error } = await defaultDb
      .from('profiles')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id')

    // RLS pode bloquear o update silenciosamente (0 linhas) — não mascarar
    if (error || !data || data.length === 0) {
      console.error('[Admin] Failed to approve user:', error?.message ?? '0 linhas alteradas')
      return false
    }

    await notifyUser(userId, 'Conta aprovada', 'Sua conta foi aprovada. O administrador configurará seu acesso em seguida.')

    return true
  },

  /**
   * Rejeição GLOBAL de conta (#286 PR-1, migration 074).
   *
   * NÃO remove mais o profile. O endpoint backend `POST
   * /api/admin/users/:id/reject` grava o estado terminal `rejected` e DESATIVA a
   * identidade Auth (ban, sem apagar `auth.users`).
   *
   * Por que o `DELETE` foi removido: o micro-audit no Supabase DEV provou que
   * apagar `public.profiles` NÃO revoga a identidade — o mesmo usuário volta a
   * obter sessão no Auth, o profile não é recriado e a conta fica invisível
   * para a fila (que lê `profiles`), ou seja, "rejeitar" não rejeitava nada.
   *
   * Autorização: Super Admin only, server-side (`require_auth` + `require_admin`).
   * Transição: apenas `pending` -> `rejected`; outros estados devolvem 409.
   */
  rejectUser: async (userId: string): Promise<boolean> => {
    if (!defaultDb) return false
    try {
      const { data: { session } } = await defaultDb.auth.getSession()
      if (!session) return false
      const res = await fetch(`/api/admin/users/${userId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        console.error('[Admin] Failed to reject user:', data?.error ?? res.status)
        return false
      }
      return true
    } catch (e) {
      console.error('[Admin] Failed to reject user:', e)
      return false
    }
  },

  updateUserAvatar: async (userId: string, avatar: string): Promise<boolean> => {
    if (!defaultDb) return false

    const { error } = await defaultDb
      .from('profiles')
      .update({ avatar, updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (error) {
      console.error('[Admin] Failed to update avatar:', error.message)
      return false
    }

    return true
  },

  updateUserProfile: async (userId: string, data: Partial<Pick<User, 'name' | 'roleId' | 'accent' | 'theme_variant' | 'avatar' | 'app_access' | 'notify_settings'>>): Promise<boolean> => {
    if (!defaultDb) return false

    const { data: updated, error } = await defaultDb
      .from('profiles')
      .update({ ...toDbUser(data), updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id')

    if (error || !updated || updated.length === 0) {
      console.error('[Admin] Failed to update user profile:', error?.message ?? '0 linhas alteradas')
      return false
    }

    return true
  },

  /**
   * RBAC 2.0 (PR #284): cria ou atualiza a membership de UMA unidade, com o
   * cargo daquela unidade (sempre active; managed_by preservado).
   * Endpoint: POST /api/admin/users/:id/membership → RPC 072.
   * Retorna a membership resultante (null em falha). Super-admin-only.
   * O servidor exige conta active: pending não recebe membership (403 → null).
   */
  setMembership: async (
    userId: string,
    workspaceId: string,
    roleId: string,
  ): Promise<Membership | null> => {
    if (!defaultDb) return null
    try {
      const { data: { session } } = await defaultDb.auth.getSession()
      if (!session) return null
      const res = await fetch(`/api/admin/users/${userId}/membership`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ workspace_id: workspaceId, role: roleId }),
      })
      if (!res.ok) return null
      const data = await res.json().catch(() => null)
      if (!data?.ok || !data?.membership || typeof data.membership !== 'object') return null
      return data.membership as Membership
    } catch (e) {
      console.error('[Admin] Failed to set membership:', e)
      return null
    }
  },

  /**
   * RBAC 2.0 (PR #284): remove a membership de UMA unidade (as demais seguem
   * intactas). Endpoint: DELETE /api/admin/users/:id/membership → RPC 072.
   * Retorna true em sucesso (inclui idempotente), false em falha.
   */
  removeMembership: async (userId: string, workspaceId: string): Promise<boolean> => {
    if (!defaultDb) return false
    try {
      const { data: { session } } = await defaultDb.auth.getSession()
      if (!session) return false
      const res = await fetch(`/api/admin/users/${userId}/membership`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ workspace_id: workspaceId }),
      })
      if (!res.ok) return false
      const data = await res.json().catch(() => null)
      return data?.ok === true
    } catch (e) {
      console.error('[Admin] Failed to remove membership:', e)
      return false
    }
  },

  /**
   * RBAC 2.0 (PR #284): define/limpa o responsável (managed_by) da membership
   * da unidade. managerMembershipId null = sem responsável. Endpoint:
   * POST /api/admin/users/:id/manager → RPC 072 (guarda estrutural no
   * trigger 045: mesma unidade, gestor ativo, sem ciclo).
   * Retorna a membership resultante (null em falha). Super-admin-only.
   */
  setMembershipManager: async (
    userId: string,
    workspaceId: string,
    managerMembershipId: string | null,
  ): Promise<Membership | null> => {
    if (!defaultDb) return null
    try {
      const { data: { session } } = await defaultDb.auth.getSession()
      if (!session) return null
      const res = await fetch(`/api/admin/users/${userId}/manager`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ workspace_id: workspaceId, manager_membership_id: managerMembershipId }),
      })
      if (!res.ok) return null
      const data = await res.json().catch(() => null)
      if (!data?.ok || !data?.membership || typeof data.membership !== 'object') return null
      return data.membership as Membership
    } catch (e) {
      console.error('[Admin] Failed to set membership manager:', e)
      return null
    }
  },
}
