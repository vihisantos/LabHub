import { LeadershipLevel, LEADERSHIP_LEVEL_LABELS, type Role } from './types'

/**
 * RBAC 2.0 (Fase 5): liderança é propriedade formal do cargo, não de appAccess.
 * Quem lidera é decidido pela classificação `isLeadership`/`leadershipLevel` do
 * cargo — nunca por uma permissão de app nem pelo override individual.
 */

type RoleLike = Pick<Role, 'isLeadership' | 'leadershipLevel'> | null | undefined

export function isLeadershipRole(role?: RoleLike): boolean {
  return role?.isLeadership === true
}

export function leadershipLevelOf(role?: RoleLike): number {
  return role?.leadershipLevel ?? LeadershipLevel.None
}

export function leadershipLabelOf(role?: RoleLike): string | null {
  if (!isLeadershipRole(role)) return null
  return LEADERSHIP_LEVEL_LABELS[leadershipLevelOf(role)] ?? 'Liderança'
}

/** Área institucional de cada cargo de liderança (team = unidade, coordination = multiunidades). */
export type LeadershipArea = 'team' | 'coordination'

const AREA_BY_KEY: Record<string, LeadershipArea> = {
  lider: 'team',
  coordinator: 'coordination',
}

export function leadershipAreaOf(role?: Role | null): LeadershipArea | null {
  if (!role || !isLeadershipRole(role)) return null
  return AREA_BY_KEY[role.key ?? ''] ?? null
}

/** Ordena verdadeiramente pela hierarquia: coordenador (2) > líder (1) > executante (0). */
export function isHigherLeadership(leader?: RoleLike, other?: RoleLike): boolean {
  return leadershipLevelOf(leader) > leadershipLevelOf(other)
}

/**
 * RBAC 2.0 (#296 PR-4C): resolve a liderança pelo SLUG do cargo da MEMBERSHIP
 * ATIVA (`memberships.role_id → public.roles.slug`), e não mais pela coleção
 * local `roles` nem por `profiles.role`.
 *
 * Devolve um objeto com o MESMO shape lido por `leadership.ts`
 * (`isLeadership`/`leadershipLevel`/`key`), para que `useLeadership()` mantenha
 * a API pública e nenhum consumidor precise mudar.
 *
 * Slugs: os mesmos já semeados pela migration 036 (`lider`, `coordinator`).
 * Qualquer outro slug — `tec`, `vis`, `est`, `opv`, `adm`, `role-*` legado ou
 * cargo customizado sem par no banco — devolve `null` (fail-closed: sem
 * liderança reconhecida, nunca um palpite).
 */
export const LEADERSHIP_BY_SLUG: Record<
  string,
  { isLeadership: true; leadershipLevel: number; area: LeadershipArea }
> = {
  lider: { isLeadership: true, leadershipLevel: LeadershipLevel.Leader, area: 'team' },
  coordinator: {
    isLeadership: true,
    leadershipLevel: LeadershipLevel.Coordinator,
    area: 'coordination',
  },
}

/** Cargo de liderança equivalente ao slug da membership ativa, ou `null`. */
export type LeadershipFromSlug = {
  key: string
  isLeadership: true
  leadershipLevel: number
  area: LeadershipArea
}

export function leadershipFromSlug(
  slug: string | null | undefined,
): LeadershipFromSlug | null {
  if (!slug) return null
  const hit = LEADERSHIP_BY_SLUG[slug]
  if (!hit) return null
  return { key: slug, ...hit }
}

/** Área de liderança do slug da membership ativa, ou `null` se não for liderança. */
export function areaOfSlug(slug: string | null | undefined): LeadershipArea | null {
  return leadershipFromSlug(slug)?.area ?? null
}
