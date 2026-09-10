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

async function notifyUser(userId: string, title: string, body: string): Promise<void> {
  if (!stockDb) return
  try {
    await stockDb.from('notifications').insert({
      id: crypto.randomUUID(),
      title,
      body,
      type: 'approval',
      severity: 'info',
      module: 'auth',
      actionUrl: `/admin/users?pending=${userId}`,
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

  approveUser: async (
    userId: string,
    extra?: { roleId?: string; app_access?: User['app_access']; workspace_ids?: string[] },
  ): Promise<boolean> => {
    if (!defaultDb) return false

    // 1. Memberships + espelho (atômico, servidor). Falhou ⇒ nada mudou.
    const roleId = extra?.roleId ?? 'role-viewer'
    const memberships = await adminService.setUserMemberships(userId, extra?.workspace_ids ?? [], roleId)
    if (!memberships) {
      console.error('[Admin] Failed to approve user: memberships write failed')
      return false
    }

    // 2. Status/cargo/app_access (trigger 041 re-sincroniza de forma idempotente
    // a partir do espelho já gravado).
    const { data, error } = await defaultDb
      .from('profiles')
      .update({ status: 'active', ...toDbUser({ roleId, app_access: extra?.app_access }), updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id')

    // RLS pode bloquear o update silenciosamente (0 linhas) — não mascarar
    if (error || !data || data.length === 0) {
      console.error('[Admin] Failed to approve user:', error?.message ?? '0 linhas alteradas')
      return false
    }

    await notifyUser(userId, 'Conta aprovada', 'Sua conta foi aprovada pelo administrador.')

    return true
  },

  rejectUser: async (userId: string): Promise<boolean> => {
    if (!defaultDb) return false

    // Delete the auth user and profile
    // For now, just delete the profile (auth user must be deleted from Supabase dashboard)
    const { data, error } = await defaultDb
      .from('profiles')
      .delete()
      .eq('id', userId)
      .select('id')

    if (error || !data || data.length === 0) {
      console.error('[Admin] Failed to reject user:', error?.message ?? '0 linhas alteradas')
      return false
    }

    await notifyUser(userId, 'Conta negada', 'Sua conta foi recusada pelo administrador.')

    return true
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

  updateUserRole: async (userId: string, roleId: string): Promise<boolean> => {
    if (!defaultDb) return false

    const { data, error } = await defaultDb
      .from('profiles')
      .update({ role: ROLE_ID_TO_DB[roleId] ?? roleId, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id')

    if (error || !data || data.length === 0) {
      console.error('[Admin] Failed to update user role:', error?.message ?? '0 linhas alteradas')
      return false
    }

    return true
  },

  updateUserProfile: async (userId: string, data: Partial<Pick<User, 'name' | 'roleId' | 'accent' | 'theme_variant' | 'avatar' | 'app_access' | 'is_super_admin' | 'notify_settings'>>): Promise<boolean> => {
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
   * @deprecated Use setUserMemberships (9.2-C, atômico via servidor).
   * Adapter: preserva o cargo atual e delega ao endpoint.
   */
  updateUserWorkspaces: async (userId: string, workspace_ids: string[]): Promise<boolean> => {
    const users = await adminService.listAllProfiles()
    const roleId = users.find((u) => u.id === userId)?.roleId ?? 'role-viewer'
    return (await adminService.setUserMemberships(userId, workspace_ids, roleId)) !== null
  },

  /**
   * RBAC 2.0 (9.2-C): define os workspaces do usuário de forma ATÔMICA via
   * endpoint backend (`POST /api/admin/users/:id/memberships` → RPC 052:
   * memberships + espelho na mesma transação; managed_by preservado).
   * Retorna as memberships resultantes (null em falha). Super-admin-only.
   */
  setUserMemberships: async (
    userId: string,
    workspaceIds: string[],
    roleId: string,
  ): Promise<Membership[] | null> => {
    if (!defaultDb) return null
    try {
      const { data: { session } } = await defaultDb.auth.getSession()
      if (!session) return null
      const res = await fetch(`/api/admin/users/${userId}/memberships`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ workspace_ids: workspaceIds, role: roleId }),
      })
      if (!res.ok) return null
      const data = await res.json().catch(() => null)
      if (!data?.ok || !Array.isArray(data?.memberships)) return null
      return data.memberships as Membership[]
    } catch (e) {
      console.error('[Admin] Failed to set user memberships:', e)
      return null
    }
  },
}
