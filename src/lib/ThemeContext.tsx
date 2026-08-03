import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Accent, ThemeVariant } from '../core/auth/types'
import { authService } from '../core/auth/service'
import { themeStore, type ThemeState } from '../core/theme/store'

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
