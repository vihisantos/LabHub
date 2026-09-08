import type { User } from '../auth/types'
import type { Role } from './types'
import { leadershipAreaOf } from './leadership'

/**
 * RBAC 2.0 (Fase 7 — área do Líder / scope team).
 *
 * A liderança NÃO é atributo global: é uma RELAÇÃO ENTRE MEMBERSHIPS do mesmo
 * workspace (`memberships.managed_by`, migration 045). A equipe de um líder é
 * derivada server-side por `get_leader_team(workspace_id)` (RPC SECURITY
 * DEFINER, fail-closed) — a UI apenas consome esse escopo, não o decide.
 *
 * Os helpers abaixo são puros (testáveis) e refletem exatamente essa regra:
 *   - ver a área = cargo de liderança de nível "equipe" (`leadershipAreaOf`);
 *   - gerenciar a área = mesma base (Fase 7 não tem Actions de gestão ainda);
 *   - ver um membro = o membro pertence à equipe do escopo OU é o próprio
 *     usuário. Nunca "todos do workspace".
 */

export type MembershipStatus = 'pending' | 'active' | 'suspended' | 'removed'

/** Linha da tabela pública `memberships` (RBAC 2.0) — espelho da migration 036/045. */
export interface Membership {
  id: string
  profile_id: string
  workspace_id: string
  role_id: string
  status: MembershipStatus
  /** Membership do gestor direto (mesmo workspace). NULL = sem gestor. */
  managed_by: string | null
  created_at: string
  updated_at: string
}

/** Perfil resumido de um membro da equipe (vindo de `profiles`, visível por RLS). */
export interface TeamMemberProfile {
  id: string
  name: string
  email: string
  status: 'active' | 'pending'
  /** roleId do frontend (coleção `roles`) derivado do `role` do banco. */
  roleId: string
}

/** Membro da equipe = membership (relação) + perfil para exibição. */
export interface TeamMember {
  membership: Membership
  profile: TeamMemberProfile | null
}

/** Contexto dos autorizadores puros de área "equipe". */
export interface TeamContext {
  user: User | null
  role: Role | undefined
  team: TeamMember[]
}

/**
 * Mapeamento determinístico role do banco → roleId do frontend (espelha o
 * mapping de 041/045 e o ROLE_ID_TO_DB do adminService). Valores inesperados
 * viram `role-<db>` (fail-closed: o frontend não reconhece → sem label de cargo).
 */
const DB_ROLE_TO_ID: Record<string, string> = {
  technician: 'role-technician',
  viewer: 'role-viewer',
  admin: 'role-admin',
  coordinator: 'role-coordinator',
  lider: 'role-lider',
}

export function dbRoleToRoleId(dbRole: string): string {
  return DB_ROLE_TO_ID[dbRole] ?? `role-${dbRole}`
}

/** Pode entrar na Área do Líder (scope team). Só o cargo decide — nunca appAccess. */
export function canViewTeam(ctx: TeamContext): boolean {
  if (!ctx.user) return false
  return leadershipAreaOf(ctx.role) === 'team'
}

/**
 * Pode gerenciar a equipe (escopo). É a mesma base de canViewTeam: na Fase 7 a
 * gestão é a própria relação `managed_by` (o líder É o gestor da equipe); as
 * Actions de gestão (atribuir, remover...) chegam na Fase 8+ e serão checadas
 * por essa mesma base OU por membro.
 */
export function canManageTeam(ctx: TeamContext): boolean {
  return canViewTeam(ctx)
}

/** Pode ver um membro específico: da própria equipe do escopo OU self. */
export function canViewTeamMember(ctx: TeamContext, memberId: string): boolean {
  if (!canViewTeam(ctx)) return false
  if (ctx.user?.id === memberId) return true
  return ctx.team.some(
    (m) => m.membership.profile_id === memberId || m.membership.id === memberId,
  )
}