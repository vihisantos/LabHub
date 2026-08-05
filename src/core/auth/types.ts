import type { AppAccessOverride } from '../permissions/types'

export type UserRole = 'admin' | 'technician' | 'viewer'
export type Accent = 'emerald' | 'cyan' | 'blue' | 'purple'
export type ThemeVariant = 'dark' | 'dim' | 'light'

export type UserStatus = 'active' | 'pending'

/** Preferências de notificação do usuário — override manual sobre a regra automática por acesso */
export interface NotifyChannelSettings {
  inapp: boolean
  push: boolean
}

export interface UserNotifySettings {
  /** Silencia todas as notificações do usuário */
  muted: boolean
  /** Canais por aplicativo (ausente = ambos ativos, segue a regra por acesso) */
  apps: Partial<Record<string, NotifyChannelSettings>>
}

export const DEFAULT_NOTIFY_SETTINGS: UserNotifySettings = { muted: false, apps: {} }

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
  /** Preferências de notificação (canais por app, mudo) */
  notify_settings?: UserNotifySettings
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
