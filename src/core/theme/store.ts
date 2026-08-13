// Global theme store — single source of truth for theme state
// Used by both applyUserPreferences() (non-React) and ThemeContext (React)

import type { Accent, ThemeVariant } from '../auth/types'

export interface ThemeState {
  theme: ThemeVariant
  accent: Accent
}

type Listener = (state: ThemeState) => void

let state: ThemeState = { theme: 'dark', accent: 'blue' }
const listeners = new Set<Listener>()

function applyToDom(theme: ThemeVariant, accent: Accent) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('dim', theme === 'dim')
  root.classList.toggle('light', theme === 'light')
  root.setAttribute('data-accent', accent)
}

export const themeStore = {
  getState: (): ThemeState => ({ ...state }),

  setState: (partial: Partial<ThemeState>) => {
    state = { ...state, ...partial }
    applyToDom(state.theme, state.accent)
    listeners.forEach((fn) => fn(state))
  },

  /** Applies theme + accent AND updates store + DOM + notifies listeners */
  apply: (theme: ThemeVariant, accent: Accent) => {
    state = { theme, accent }
    applyToDom(theme, accent)
    listeners.forEach((fn) => fn(state))
  },

  /** Preview an accent temporarily without persisting */
  previewAccent: (accent: Accent) => {
    document.documentElement.setAttribute('data-accent', accent)
  },

  /** Reset accent back to the stored value */
  resetAccent: () => {
    document.documentElement.setAttribute('data-accent', state.accent)
  },

  subscribe: (fn: Listener) => {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}
