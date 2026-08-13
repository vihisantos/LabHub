import { defaultDb, stockDb } from '../../lib/supabase'
import type { User, AuthCredentials, SignUpData } from './types'
import { themeStore } from '../theme/store'
import { resolveRoleId } from '../permissions/types'

let currentUser: User | null = null
let authListeners: Array<(user: User | null) => void> = []
let initialized = false

/** Coluna Supabase `role` (string legada ou id) → campo TS `roleId` (id estável). */
function fromDbUser<T extends Record<string, unknown>>(row: T): Omit<T, 'role'> & { roleId: string } {
  const { role, ...rest } = row
  return { ...rest, roleId: resolveRoleId(typeof role === 'string' ? role : undefined) }
}

/** Campo TS `roleId` → payload do Supabase (`role`). */
function toDbUser(data: Record<string, unknown>): Record<string, unknown> {
  const { roleId, ...rest } = data
  return { ...rest, ...(roleId !== undefined ? { role: roleId } : {}) }
}

export function applyUserPreferences(user: User) {
  themeStore.apply(user.theme_variant, user.accent)
}

function notifyListeners() {
  for (const listener of authListeners) {
    listener(currentUser)
  }
}

function requireDb() {
  if (!defaultDb) throw new Error('Supabase não configurado. Verifique as variáveis de ambiente.')
}

export const authService = {
  init: async (): Promise<User | null> => {
    if (!defaultDb) return null
    if (initialized) return currentUser
    initialized = true

    // 1. Set up auth state listener FIRST (before getSession)
    defaultDb.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] State change:', event)
      if (session?.user) {
        const profile = await authService.fetchUserProfile(session.user.id)
        currentUser = profile
        if (profile) applyUserPreferences(profile)
      } else {
        currentUser = null
      }
      notifyListeners()
    })

    // 2. Then restore existing session
    try {
      const { data: { session }, error } = await defaultDb.auth.getSession()
      if (error) {
        console.warn('[Auth] getSession error:', error.message)
      }
      if (session?.user) {
        console.log('[Auth] Session restored for:', session.user.email)
        currentUser = await authService.fetchUserProfile(session.user.id)
        if (currentUser) applyUserPreferences(currentUser)
        notifyListeners()
      } else {
        console.log('[Auth] No active session')
      }
    } catch (e) {
      console.warn('[Auth] Failed to init:', e)
    }

    return currentUser
  },

  signIn: async (credentials: AuthCredentials): Promise<User> => {
    requireDb()

    console.log('[Auth] Attempting sign in for:', credentials.email)

    const { data, error } = await defaultDb!.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    })

    if (error) {
      console.error('[Auth] Sign in error:', error.message)
      throw error
    }
    if (!data.user) throw new Error('Usuário não retornado')

    console.log('[Auth] Sign in successful, user ID:', data.user.id)

    let profile = await authService.fetchUserProfile(data.user.id)
    console.log('[Auth] Profile fetch result:', profile)

    // If profile doesn't exist (user created before trigger), create it
    if (!profile) {
      console.log('[Auth] Profile not found, creating...')
      profile = await authService.createProfile(data.user.id, data.user.email || credentials.email, '')
    }

    if (!profile) {
      console.error('[Auth] Failed to create or fetch profile')
      throw new Error('Não foi possível criar o perfil do usuário. Verifique se a tabela profiles existe no Supabase.')
    }

    currentUser = profile
    applyUserPreferences(profile)
    notifyListeners()
    return profile
  },

  signUp: async (data: SignUpData): Promise<User> => {
    requireDb()

    const { data: authData, error } = await defaultDb!.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { name: data.name },
      },
    })

    if (error) throw error
    if (!authData.user) throw new Error('Usuário não retornado')

    // O perfil pendente é criado pelo trigger do banco (handle_new_user),
    // que roda com SECURITY DEFINER e ignora RLS. O insert direto pelo
    // client falharia com "new row violates row-level security policy"
    // quando ainda não existe sessão no momento do cadastro.
    const now = new Date().toISOString()
    const profile = {
      id: authData.user.id,
      email: data.email,
      name: data.name,
      roleId: 'role-viewer',
      status: 'pending' as const,
      is_super_admin: false,
      workspace_ids: [] as string[],
      accent: 'blue' as const,
      theme_variant: 'dark' as const,
      avatar: '',
      banner: '',
      created_at: now,
      updated_at: now,
    }

    // Create a notification DIRECTLY on Supabase so admins receive it
    // regardless of this device's sync (pendente não roda sync)
    try {
      if (stockDb) {
        await stockDb.from('notifications').insert({
          id: crypto.randomUUID(),
          title: 'Novo usuário pendente',
          body: `${data.name} (${data.email}) aguarda aprovação`,
          type: 'approval',
          severity: 'info',
          module: 'auth',
          actionUrl: `/admin/users?pending=${profile.id}`,
          read: false,
          createdAt: new Date().toISOString(),
          audience: 'role',
          targetSuperAdmin: true,
        })
      }
    } catch (e) {
      console.warn('[Auth] Failed to create approval notification:', e)
    }

    // Don't set currentUser — user is not approved yet
    // But return the profile so the UI can show the pending screen
    notifyListeners()
    return { ...profile, status: 'pending' }
  },

  signOut: async (): Promise<void> => {
    if (!defaultDb) return
    await defaultDb.auth.signOut()
    currentUser = null
    initialized = false
    notifyListeners()
  },

  getCurrentUser: (): User | null => currentUser,

  updateProfile: async (data: Partial<User>): Promise<User> => {
    if (!currentUser) throw new Error('Não autenticado')
    requireDb()

    const { error } = await defaultDb!
      .from('profiles')
      .update({ ...toDbUser(data), updated_at: new Date().toISOString() })
      .eq('id', currentUser.id)

    if (error) throw error

    currentUser = { ...currentUser, ...data }
    notifyListeners()
    return currentUser
  },

  fetchUserProfile: async (userId: string): Promise<User | null> => {
    if (!defaultDb) return null

    const { data, error } = await defaultDb
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error || !data) return null
    return fromDbUser(data) as unknown as User
  },

  createProfile: async (userId: string, email: string, name: string): Promise<User | null> => {
    if (!defaultDb) return null

    const now = new Date().toISOString()
    const profile = {
      id: userId,
      email,
      name: name || email.split('@')[0],
      roleId: 'role-viewer',
      status: 'active',
      is_super_admin: false,
      workspace_ids: [],
      accent: 'blue',
      theme_variant: 'dark',
      avatar: '',
      banner: '',
      created_at: now,
      updated_at: now,
    }

    console.log('[Auth] Creating profile:', profile)

    const { data, error } = await defaultDb
      .from('profiles')
      .insert(toDbUser(profile))
      .select()
      .single()

    if (error) {
      console.error('[Auth] Failed to create profile:', error.message, error)
      return null
    }

    console.log('[Auth] Profile created:', data)
    return fromDbUser(data) as User
  },

  onAuthChange: (callback: (user: User | null) => void) => {
    authListeners.push(callback)
    return () => {
      authListeners = authListeners.filter((l) => l !== callback)
    }
  },

  /** Re-fetch the user profile from Supabase and notify listeners if changed */
  refreshProfile: async (): Promise<User | null> => {
    if (!defaultDb) return currentUser

    const prev = currentUser

    // No in-memory user (e.g., right after signUp) — bootstrap from the session
    if (!prev) {
      const { data: { session }, error } = await defaultDb.auth.getSession()
      if (error || !session?.user) return currentUser

      const profile = await authService.fetchUserProfile(session.user.id)
      if (!profile) return currentUser

      currentUser = profile
      applyUserPreferences(profile)
      notifyListeners()
      return currentUser
    }

    const profile = await authService.fetchUserProfile(prev.id)
    if (!profile) return currentUser

    // Only update and notify if something actually changed
    const changed =
      profile.status !== prev.status ||
      profile.roleId !== prev.roleId ||
      profile.is_super_admin !== prev.is_super_admin ||
      profile.theme_variant !== prev.theme_variant ||
      profile.accent !== prev.accent

    if (changed) {
      currentUser = profile
      applyUserPreferences(profile)
      notifyListeners()
    }

    return currentUser
  },

  isConfigured: (): boolean => {
    return !!defaultDb
  },
}
