export type AppAccessLevel = 'dash' | 'read' | 'full'

/** Valor possível no override individual por usuário (permite bloquear explicitamente) */
export type AppAccessOverride = AppAccessLevel | 'none'

export interface Role {
  id: string
  /** Slug estável do cargo (usado na migração legada / matching por nome). Cargos novos podem não ter. */
  key?: string
  name: string
  description: string
  isDefault: boolean
  /** Id do usuário (profile) que lidera o setor do cargo */
  leaderId?: string
  /**
   * FASE 4/5 (RBAC 2.0): classificação do CARGO como de liderança.
   * "Liderar" é propriedade do cargo, independente de qualquer acesso por app.
   * Ausente em cargos antigos até o migrate() backfill.
   */
  isLeadership?: boolean
  /** Nível hierárquico para ordenação entre cargos de liderança (0 executante, 1 líder, 2 coordenador). */
  leadershipLevel?: number
}

/** Níveis de liderança do RBAC 2.0. (const object — erasableSyntaxOnly não permite enum) */
export const LeadershipLevel = {
  None: 0,
  Leader: 1,
  Coordinator: 2,
} as const

export const LEADERSHIP_LEVEL_LABELS: Record<number, string> = {
  [LeadershipLevel.None]: 'Executante',
  [LeadershipLevel.Leader]: 'Líder de unidade',
  [LeadershipLevel.Coordinator]: 'Coordenador multiunidades',
}

/**
 * Cargos padrão — o admin absoluto (is_super_admin) não tem cargo.
 * Acesso administrativo ao app "admin" só existe via is_super_admin.
 * Ids fixos (determinísticos) para funcionarem entre dispositivos.
 *
 * ── Onde a visibilidade de módulo vive agora (F2-D-N2) ──────────────────────
 * Este objeto NÃO tem mais `appAccess`, e isso é intencional. Ele serve só para
 * NOME e identidade de cargo (rótulos em telas admin, `resolveRoleId`, badges).
 * A visibilidade de módulo é resolvida pela matriz RBAC2
 * (`core/permissions/moduleVisibility.ts`), a partir de membership ativa →
 * `roles.slug` → matriz, somada a `workspace.disabled_apps` e ao bypass de super
 * admin. A autorização de operação é por Action (`useCanAccessAction`).
 *
 * A remoção de `appAccess` foi feita depois que o F2-D-N1 encerrou a ÚLTIMA
 * leitura viva da cadeia legada (`buildPushUser`). Nada aqui é mais consultado
 * pelo banco — a tabela `public.roles` (036) tem shape RBAC2 (`slug`,
 * `workspace_id`, `is_system`) e a coleção local está em
 * `LOCAL_ONLY_COLLECTIONS` (lib/sync.ts), logo nunca sincroniza.
 *
 * `AppAccessLevel`/`AppAccessOverride` continuam existindo APENAS como tipo do
 * campo `User.app_access` (compatibilidade de payload enquanto a coluna
 * `profiles.app_access` não for removida na etapa de banco).
 */
export const DEFAULT_ROLES: Role[] = [
  {
    id: 'role-technician',
    key: 'technician',
    name: 'Técnico',
    description: 'Acesso aos aplicativos de operação',
    isDefault: false,
    isLeadership: false,
    leadershipLevel: LeadershipLevel.None,
  },
  {
    id: 'role-viewer',
    key: 'viewer',
    name: 'Visualizador',
    description: 'Acesso somente leitura aos aplicativos liberados',
    isDefault: true,
    isLeadership: false,
    leadershipLevel: LeadershipLevel.None,
  },
  {
    id: 'role-lider',
    key: 'lider',
    name: 'Líder',
    description: 'Gestão da unidade, sem acesso administrativo global',
    isDefault: false,
    isLeadership: true,
    leadershipLevel: LeadershipLevel.Leader,
  },
  {
    id: 'role-coordinator',
    key: 'coordinator',
    name: 'Coordenador Multiunidade',
    description: 'Gestão operacional de múltiplas unidades, sem acesso administrativo global',
    isDefault: false,
    isLeadership: true,
    leadershipLevel: LeadershipLevel.Coordinator,
  },
]

/** Mapeamento de valores legados da coluna profiles.role → id de cargo. Admin virou técnico. */
export const LEGACY_ROLE_TO_ID: Record<string, string> = {
  admin: 'role-technician',
  technician: 'role-technician',
  viewer: 'role-viewer',
  lider: 'role-lider',
  coordinator: 'role-coordinator',
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
