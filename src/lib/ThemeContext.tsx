import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

export type ThemeVariant = 'dark' | 'dim' | 'light'
export type Accent = 'emerald' | 'cyan' | 'blue' | 'purple'

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

interface ThemeProviderProps {
  children: ReactNode
  storageKey?: string
  defaultTheme?: ThemeVariant
  defaultAccent?: Accent
}

function applyTheme(variant: ThemeVariant, accent: Accent) {
  const root = document.documentElement
  root.classList.toggle('dark', variant === 'dark')
  root.classList.toggle('dim', variant === 'dim')
  root.classList.toggle('light', variant === 'light')
  root.setAttribute('data-accent', accent)
}

export function ThemeProvider({
  children,
  storageKey = 'labhub_theme',
  defaultTheme = 'dark',
  defaultAccent = 'emerald',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeVariant>(() => {
    if (typeof window === 'undefined') return defaultTheme
    return (localStorage.getItem(`${storageKey}_variant`) as ThemeVariant) || defaultTheme
  })

  const [accent, setAccentState] = useState<Accent>(() => {
    if (typeof window === 'undefined') return defaultAccent
    return (localStorage.getItem(`${storageKey}_accent`) as Accent) || defaultAccent
  })

  const setTheme = useCallback((t: ThemeVariant) => {
    setThemeState(t)
    localStorage.setItem(`${storageKey}_variant`, t)
  }, [storageKey])

  const setAccent = useCallback((a: Accent) => {
    setAccentState(a)
    localStorage.setItem(`${storageKey}_accent`, a)
  }, [storageKey])

  function toggle() {
    const next = theme === 'dark' ? 'dim' : theme === 'dim' ? 'light' : 'dark'
    setTheme(next)
  }

  useEffect(() => {
    applyTheme(theme, accent)
    return () => {
      document.documentElement.classList.remove('dark', 'dim', 'light')
      document.documentElement.removeAttribute('data-accent')
    }
  }, [theme, accent])

  return (
    <ThemeContext.Provider value={{ theme, accent, setTheme, setAccent, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
