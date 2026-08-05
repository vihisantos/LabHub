import { defaultDb } from '../../lib/supabase'
import type { User, UserRole } from './types'

async function notifyUser(userId: string, title: string, body: string): Promise<void> {
  if (!defaultDb) return
  try {
    await defaultDb.from('notifications').insert({
      id: crypto.randomUUID(),
      title,
      body,
      type: 'system',
      severity: 'info',
      module: 'auth',
      actionUrl: '/',
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

    return (data || []) as User[]
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

    return (data || []) as User[]
  },

  approveUser: async (
    userId: string,
    extra?: { role?: UserRole; app_access?: User['app_access'] },
  ): Promise<boolean> => {
    if (!defaultDb) return false

    const { error } = await defaultDb
      .from('profiles')
      .update({ status: 'active', ...extra, updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (error) {
      console.error('[Admin] Failed to approve user:', error.message)
      return false
    }

    await notifyUser(userId, 'Conta aprovada', 'Sua conta foi aprovada pelo administrador.')

    return true
  },

  rejectUser: async (userId: string): Promise<boolean> => {
    if (!defaultDb) return false

    // Delete the auth user and profile
    // For now, just delete the profile (auth user must be deleted from Supabase dashboard)
    const { error } = await defaultDb
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (error) {
      console.error('[Admin] Failed to reject user:', error.message)
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

  updateUserRole: async (userId: string, role: UserRole): Promise<boolean> => {
    if (!defaultDb) return false

    const { error } = await defaultDb
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (error) {
      console.error('[Admin] Failed to update user role:', error.message)
      return false
    }

    return true
  },

  updateUserProfile: async (userId: string, data: Partial<Pick<User, 'name' | 'role' | 'accent' | 'theme_variant' | 'workspace_ids' | 'avatar' | 'app_access' | 'is_super_admin' | 'notify_settings'>>): Promise<boolean> => {
    if (!defaultDb) return false

    const { error } = await defaultDb
      .from('profiles')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (error) {
      console.error('[Admin] Failed to update user profile:', error.message)
      return false
    }

    return true
  },

  updateUserWorkspaces: async (userId: string, workspace_ids: string[]): Promise<boolean> => {
    return adminService.updateUserProfile(userId, { workspace_ids })
  },
}
