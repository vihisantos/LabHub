import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../core/auth/AuthContext'

const listeners = new Set<() => void>()
const fallback = new Map<string, boolean>()
const currentKey = (id: string) => 'onboardingCompleted_' + id
const legacyKey = (id: string) => 'labhub_onboarding_done_' + id

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

export function isOnboardingPending(userId?: string): boolean {
  if (!userId) return false
  try {
    return localStorage.getItem(currentKey(userId)) !== 'true' &&
      localStorage.getItem(legacyKey(userId)) !== 'true'
  } catch {
    return fallback.get(userId) ?? true
  }
}

export function setOnboardingPending(userId: string, pending: boolean): void {
  fallback.set(userId, pending)
  try {
    if (pending) {
      localStorage.removeItem(currentKey(userId))
      localStorage.removeItem(legacyKey(userId))
    } else {
      localStorage.setItem(currentKey(userId), 'true')
    }
  } catch { /* memory fallback */ }
  listeners.forEach(listener => listener())
}

export function useOnboardingPending(userId?: string): boolean {
  return useSyncExternalStore(subscribe, () => isOnboardingPending(userId), () => false)
}

const SuppressStartupPrompts = createContext(false)

/** Serialize non-critical startup prompts behind the single platform tour. */
export function OnboardingPromptProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const { pathname } = useLocation()
  const pending = useOnboardingPending(user?.id)
  const path = pathname.toLowerCase().replace(/\/+$/, '') || '/'
  const suppress = loading || user?.status !== 'active' || pending ||
    path === '/login' || path === '/approval-pending'
  return <SuppressStartupPrompts.Provider value={suppress}>{children}</SuppressStartupPrompts.Provider>
}

export function useSuppressStartupPrompts(): boolean {
  return useContext(SuppressStartupPrompts)
}
