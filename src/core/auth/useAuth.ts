import { useCallback, useEffect, useState } from 'react'
import type { User, AuthCredentials, SignUpData } from './types'
import { authService } from './service'

export function useAuth() {
  const [user, setUser] = useState<User | null>(authService.getCurrentUser())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = authService.onAuthChange((u) => {
      setUser(u)
      setLoading(false)
    })

    authService.init().finally(() => setLoading(false))

    return unsubscribe
  }, [])

  const signIn = useCallback(async (credentials: AuthCredentials) => {
    setLoading(true)
    setError(null)
    try {
      await authService.signIn(credentials)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao fazer login')
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  const signUp = useCallback(async (data: SignUpData) => {
    setLoading(true)
    setError(null)
    try {
      await authService.signUp(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar conta')
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    setLoading(true)
    try {
      await authService.signOut()
    } finally {
      setLoading(false)
    }
  }, [])

  const updateProfile = useCallback(async (data: Partial<User>) => {
    try {
      await authService.updateProfile(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar perfil')
      throw e
    }
  }, [])

  return {
    user,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    updateProfile,
    isAuthenticated: !!user,
    isConfigured: authService.isConfigured(),
  }
}
