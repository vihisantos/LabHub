import type { AppAccessOverride } from '../permissions/types'

export type Accent = 'emerald' | 'cyan' | 'blue' | 'purple'
export type ThemeVariant = 'dark' | 'dim' | 'light'

export type UserStatus = 'active' | 'pending'

/** Modo de exibição da tela inicial (Launcher) */
export type HomeMode = 'compact' | 'dynamic'

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
  /** Id do cargo (coleção local `roles`). Admin absoluto não depende de cargo. */
  roleId: string
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
  /** Modo da tela inicial: compacto (cards grandes) ou dinâmico (módulos + ações rápidas) */
  home_mode?: HomeMode
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
