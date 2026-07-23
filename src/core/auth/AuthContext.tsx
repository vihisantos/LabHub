import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { User, AuthCredentials, SignUpData } from './types'
import { authService } from './service'

interface AuthContextValue {
  user: User | null
  loading: boolean
  error: string | null
  signIn: (credentials: AuthCredentials) => Promise<void>
  signUp: (data: SignUpData) => Promise<void>
  signOut: () => Promise<void>
  isAuthenticated: boolean
  isConfigured: boolean
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  error: null,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  isAuthenticated: false,
  isConfigured: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
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
      const msg = e instanceof Error ? e.message : 'Erro ao fazer login'
      setError(msg)
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
      const msg = e instanceof Error ? e.message : 'Erro ao criar conta'
      setError(msg)
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

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      error,
      signIn,
      signUp,
      signOut,
      isAuthenticated: !!user,
      isConfigured: authService.isConfigured(),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
