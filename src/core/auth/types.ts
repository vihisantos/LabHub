export type UserRole = 'admin' | 'technician' | 'viewer'

export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  role: UserRole
  workspaceIds: string[]
  createdAt: string
  updatedAt: string
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
