export type AppAccessLevel = 'dash' | 'read' | 'full'

/** Valor possível no override individual por usuário (permite bloquear explicitamente) */
export type AppAccessOverride = AppAccessLevel | 'none'

export interface Role {
  id: string
  /** Slug estável do cargo (usado na migração legada / matching por nome). Cargos novos podem não ter. */
  key?: string
  name: string
  description: string
  /** Nível de acesso por aplicativo (id do appRegistry) — ausente = sem acesso */
  appAccess: Partial<Record<string, AppAccessLevel>>
  /** Permissão separada: gera QR de salas mesmo sem acesso full ao app */
  manageQr?: boolean
  isDefault: boolean
  /** Id do usuário (profile) que lidera o setor do cargo */
  leaderId?: string
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

/**
 * Cargos padrão — o admin absoluto (is_super_admin) não tem cargo.
 * Acesso administrativo ao app "admin" só existe via is_super_admin.
 * Ids fixos (determinísticos) para funcionarem entre dispositivos.
 */
export const DEFAULT_ROLES: Role[] = [
  {
    id: 'role-technician',
    key: 'technician',
    name: 'Técnico',
    description: 'Acesso aos aplicativos de operação',
    appAccess: {
      'pc-care': 'full',
      stock: 'full',
      reservalab: 'read',
      chamados: 'full',
    },
    manageQr: true,
    isDefault: false,
  },
  {
    id: 'role-viewer',
    key: 'viewer',
    name: 'Visualizador',
    description: 'Acesso somente leitura aos aplicativos liberados',
    appAccess: {
      'pc-care': 'read',
      stock: 'read',
      reservalab: 'dash',
      chamados: 'read',
    },
    manageQr: false,
    isDefault: true,
  },
]

/** Mapeamento de valores legados da coluna profiles.role → id de cargo. Admin virou técnico. */
export const LEGACY_ROLE_TO_ID: Record<string, string> = {
  admin: 'role-technician',
  technician: 'role-technician',
  viewer: 'role-viewer',
}

/** Normaliza qualquer referência de cargo (id novo ou valor legado) para o id estável. */
export function resolveRoleId(value: string | null | undefined): string {
  if (!value) return 'role-viewer'
  return LEGACY_ROLE_TO_ID[value] ?? value
}

/** Paleta para badges de cargo (Tailwind exige classes estáticas). */
export const ROLE_BADGE_COLORS: string[] = [
  'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  'bg-slate-500/15 text-fg-muted',
  'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
]

export function roleBadgeClass(role?: Pick<Role, 'id' | 'name'> | null): string {
  if (!role) return 'bg-fg-muted/15 text-fg-muted'
  let hash = 0
  const s = role.name || role.id
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  return ROLE_BADGE_COLORS[hash % ROLE_BADGE_COLORS.length]
}
