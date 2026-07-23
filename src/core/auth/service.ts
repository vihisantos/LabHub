import { defaultDb } from '../../lib/supabase'
import type { User, AuthCredentials, SignUpData } from './types'

let currentUser: User | null = null
let authListeners: Array<(user: User | null) => void> = []

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

    try {
      const { data: { session } } = await defaultDb.auth.getSession()
      if (session?.user) {
        currentUser = await authService.fetchUserProfile(session.user.id)
        notifyListeners()
      }
    } catch (e) {
      console.warn('[Auth] Failed to init:', e)
    }

    if (defaultDb) {
      defaultDb.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          currentUser = await authService.fetchUserProfile(session.user.id)
        } else {
          currentUser = null
        }
        notifyListeners()
      })
    }

    return currentUser
  },

  signIn: async (credentials: AuthCredentials): Promise<User> => {
    requireDb()

    const { data, error } = await defaultDb!.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    })

    if (error) throw error
    if (!data.user) throw new Error('Usuário não retornado')

    const profile = await authService.fetchUserProfile(data.user.id)
    if (!profile) throw new Error('Perfil do usuário não encontrado. Contate o administrador.')

    currentUser = profile
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

    // Profile is created by the trigger, just fetch it
    const profile = await authService.fetchUserProfile(authData.user.id)
    if (!profile) throw new Error('Perfil não criado automaticamente')

    currentUser = profile
    notifyListeners()
    return profile
  },

  signOut: async (): Promise<void> => {
    if (!defaultDb) return
    await defaultDb.auth.signOut()
    currentUser = null
    notifyListeners()
  },

  getCurrentUser: (): User | null => currentUser,

  updateProfile: async (data: Partial<User>): Promise<User> => {
    if (!currentUser) throw new Error('Não autenticado')
    requireDb()

    const { error } = await defaultDb!
      .from('profiles')
      .update({ ...data, updatedAt: new Date().toISOString() })
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
      .single()

    if (error || !data) return null
    return data as User
  },

  onAuthChange: (callback: (user: User | null) => void) => {
    authListeners.push(callback)
    return () => {
      authListeners = authListeners.filter((l) => l !== callback)
    }
  },

  isConfigured: (): boolean => {
    return !!defaultDb
  },
}
