export type RoleKey = 'admin' | 'technician' | 'viewer'

export type AppAccessLevel = 'dash' | 'read' | 'full'

/** Valor possível no override individual por usuário (permite bloquear explicitamente) */
export type AppAccessOverride = AppAccessLevel | 'none'

export interface Role {
  id: string
  key: RoleKey
  name: string
  description: string
  /** Nível de acesso por aplicativo (id do appRegistry) — ausente = sem acesso */
  appAccess: Partial<Record<string, AppAccessLevel>>
  isDefault: boolean
}

export const APP_ACCESS_LEVELS: AppAccessLevel[] = ['dash', 'read', 'full']

export const APP_ACCESS_LABELS: Record<AppAccessLevel, string> = {
  dash: 'Dashboard',
  read: 'Só leitura',
  full: 'Acesso total',
}

export const APP_ACCESS_DESCRIPTIONS: Record<AppAccessLevel, string> = {
  dash: 'Somente o dashboard para verificação de quantidades',
  read: 'Visualização dos dados, sem criar ou editar',
  full: 'Pode visualizar, criar, editar e excluir',
}

/** Acesso padrão por cargo — ids precisam bater com o appRegistry */
export const DEFAULT_ROLE_APPS: Record<RoleKey, Partial<Record<string, AppAccessLevel>>> = {
  admin: {
    dashboard: 'full',
    'pc-care': 'full',
    stock: 'full',
    reservalab: 'full',
    tv: 'full',
    chamados: 'full',
    admin: 'full',
  },
  technician: {
    'pc-care': 'full',
    stock: 'full',
    reservalab: 'read',
    chamados: 'full',
  },
  viewer: {
    'pc-care': 'read',
    stock: 'read',
    reservalab: 'dash',
    chamados: 'read',
  },
}

export const DEFAULT_ROLES: Omit<Role, 'id'>[] = [
  {
    key: 'admin',
    name: 'Administrador',
    description: 'Acesso total a todos os aplicativos',
    appAccess: { ...DEFAULT_ROLE_APPS.admin },
    isDefault: false,
  },
  {
    key: 'technician',
    name: 'Técnico',
    description: 'Acesso aos aplicativos de operação',
    appAccess: { ...DEFAULT_ROLE_APPS.technician },
    isDefault: false,
  },
  {
    key: 'viewer',
    name: 'Visualizador',
    description: 'Acesso somente leitura aos aplicativos liberados',
    appAccess: { ...DEFAULT_ROLE_APPS.viewer },
    isDefault: true,
  },
]
