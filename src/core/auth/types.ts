import type { AppAccessOverride } from '../permissions/types'

export type UserRole = 'admin' | 'technician' | 'viewer'
export type Accent = 'emerald' | 'cyan' | 'blue' | 'purple'
export type ThemeVariant = 'dark' | 'dim' | 'light'

export type UserStatus = 'active' | 'pending'

export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  banner?: string
  role: UserRole
  status: UserStatus
  /** Admin absoluto — vê todos os workspaces e administra usuários */
  is_super_admin?: boolean
  workspace_ids: string[]
  accent: Accent
  theme_variant: ThemeVariant
  /** Override individual de acesso por aplicativo — sobrescreve o cargo */
  app_access?: Partial<Record<string, AppAccessOverride>>
  created_at: string
  updated_at: string
}

export interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
}

export interface AuthCredentials {
  email: string
  password: string
}

export interface SignUpData extends AuthCredentials {
  name: string
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  technician: 'Técnico',
  viewer: 'Visualizador',
}

export const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  technician: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  viewer: 'bg-fg-muted/15 text-fg-muted',
}
