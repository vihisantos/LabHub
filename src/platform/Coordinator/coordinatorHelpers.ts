import type { Membership, TeamMember, TeamMemberProfile } from '../../core/permissions/membership'
import { permissionService } from '../../core/permissions/service'
import type {
  CoordinatorRoleOption,
  CoordinatedUnit,
} from '../../core/permissions/coordinatorService'

/**
 * Helpers puros da Área do Coordenador (RBAC 2.0, Fases 8.2 + 9 + 10).
 *
 * Nenhum deles decide autorização: apenas formatam exibição (iniciais/rótulos)
 * ou projetam o MESMO conjunto de candidatos que o Postgres aceita (o RPC 047
 * continua a autoridade — a UI restringe visualmente ao que o servidor valida).
 */

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase()
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

/**
 * Rótulo do cargo da MEMBERSHIP (o que o coordenador gerencia), casando o
 * `role_id` (uuid) com a tabela `roles`. Sem correspondência (ex.: cargo fora do
 * conjunto atribuível), cai no cargo do perfil para exibição — nunca inventa.
 */
export function roleLabelFor(
  membership: Membership,
  profile: TeamMemberProfile | null,
  rolesById: Map<string, CoordinatorRoleOption>,
): string {
  const option = rolesById.get(membership.role_id)
  if (option) return option.name
  if (!profile) return '—'
  const role = permissionService.getRoleForUser(profile.roleId)
  return role?.name ?? profile.roleId
}

export interface ManagerOption {
  membershipId: string
  label: string
  note: string
}

/**
 * Fase 8.2: gestores que o RPC 047 aceita para um membro NESTA unidade — a
 * própria membership de coordenação OU uma liderança já subordinada direta a
 * ela. Espelha exatamente o check de escopo do servidor ("manager is outside
 * the coordinator scope"): a UI restringe visualmente ao mesmo conjunto e o
 * Postgres continua a autoridade (nada de regra nova no frontend).
 */
export function managerOptionsForMember(
  unit: CoordinatedUnit,
  member: TeamMember,
): ManagerOption[] {
  const current = member.membership.managed_by
  const options: ManagerOption[] = [
    {
      membershipId: unit.coordination.id,
      label: 'Coordenador(a) desta unidade',
      note: 'Equipe vinculada direto à coordenação',
    },
  ]
  for (const leader of unit.leaders) {
    if (leader.leadership.id === member.membership.id) continue
    if (leader.leadership.id === current) continue
    options.push({
      membershipId: leader.leadership.id,
      label: leader.profile?.name ?? 'Membro sem perfil',
      note: leader.profile?.email ?? 'Liderança da unidade',
    })
  }
  return options
}