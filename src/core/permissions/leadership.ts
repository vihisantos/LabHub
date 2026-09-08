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