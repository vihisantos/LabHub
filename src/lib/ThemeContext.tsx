import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Accent, ThemeVariant, User } from '../core/auth/types'
import { authService } from '../core/auth/service'
import { useAuth } from '../core/auth/AuthContext'
import { themeStore, type ThemeState } from '../core/theme/store'
import { useRealtimeSubscription } from './useRealtimeSubscription'

export type { Accent, ThemeVariant }

interface ThemeContextValue {
  theme: ThemeVariant
  accent: Accent
  setTheme: (t: ThemeVariant) => void
  setAccent: (a: Accent) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  accent: 'emerald',
  setTheme: () => {},
  setAccent: () => {},
  toggle: () => {},
})

// eslint-disable-next-line react/only-export-components
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id
  const [themeState, setThemeState] = useState<ThemeState>(() => {
    return themeStore.getState()
  })

  // Subscribe to theme store changes (e.g. from applyUserPreferences)
  useEffect(() => {
    const unsub = themeStore.subscribe((newState) => {
      setThemeState(newState)
    })
    return unsub
  }, [])

  // Realtime: re-fetch profile when admin changes this user's theme/accent/role from another device
  useRealtimeSubscription<User>(
    'profiles',
    'UPDATE',
    async (payload) => {
      if (payload.new.id !== userId) return
      await authService.refreshProfile()
    },
    { enabled: !!userId },
  )

  // Fallback: polling — Realtime (Replication) é recurso pago no Supabase, então
  // o sync em tempo real também é coberto por esse polling leve (1 query por PK)
  useEffect(() => {
    if (!userId) return
    const timer = setInterval(() => {
      authService.refreshProfile()
    }, 15000)
    return () => clearInterval(timer)
  }, [userId])

  const setAccent = useCallback(async (accent: Accent) => {
    themeStore.apply(themeState.theme, accent)
    try {
      await authService.updateProfile({ accent })
    } catch (e) {
      console.warn('[Theme] Failed to persist accent:', e)
    }
  }, [themeState.theme])

  const setTheme = useCallback(async (theme: ThemeVariant) => {
    themeStore.apply(theme, themeState.accent)
    try {
      await authService.updateProfile({ theme_variant: theme })
    } catch (e) {
      console.warn('[Theme] Failed to persist theme:', e)
    }
  }, [themeState.accent])

  const toggle = useCallback(() => {
    const next = themeState.theme === 'dark' ? 'dim' : themeState.theme === 'dim' ? 'light' : 'dark'
    setTheme(next)
  }, [themeState.theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme: themeState.theme, accent: themeState.accent, setTheme, setAccent, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react/only-export-components
export function useTheme() {
  return useContext(ThemeContext)
}
