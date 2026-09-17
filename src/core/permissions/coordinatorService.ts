import { defaultDb } from '../../lib/supabase'
import type { Membership, MembershipStatus, TeamMember, TeamMemberProfile } from './membership'
import { dbRoleToRoleId } from './membership'

/**
 * RBAC 2.0 (Fase 8): escopo de COORDENAÇÃO via RPCs server-side.
 *
 * A UI NÃO decide escopo: tudo vem de helpers SECURITY DEFINER fail-closed
 * (migration 047) que resolvem por `auth.uid() + cargo 'coordinator' ativo`:
 *   - `get_coordinator_units()`           → membership de coordenação por unidade;
 *   - `get_coordinator_leaders(ws)`       → memberships geridas DIRETAMENTE pela
 *                                            membership de coordenação na unidade;
 *   - `get_memberships_by_manager(id)`    → equipe ativa de uma liderança (árvore
 *                                            dentro do workspace do gestor).
 * A escrita escopada `coordinator_set_manager(membership, manager)` re-parenta a
 * relação de gestão dentro das próprias unidades (NULL remove da equipe); a RLS
 * de memberships permanece super-admin-only — o RPC é o ÚNICO caminho do
 * coordenador.
 *
 * Fase 9 (migration 065) adiciona o ciclo de vida da unidade via RPCs
 * fail-closed (`coordinator_get_requests` / `_approve_` / `_reject_` /
 * `_suspend_` / `_restore_` / `_remove_membership` + `_set_role`): a UI chama e
 * reage ao erro; escopo, transições e cargos permitidos são decididos no banco.
 *
 * Fase 10 (migration 066) adiciona a leitura de memberships INATIVAS
 * (`coordinator_get_inactive_members`) e projeta o perfil dentro dos RPCs de
 * listagem, porque a RLS de `profiles` (044) esconde perfis de memberships não
 * ativas. Restaurar continua sendo `suspended → active` (nunca `removed`) e o
 * servidor rejeita alvos `adm`/`coordinator`.
 */

/** Liderança / subordinação direta ao coordenador na unidade + sua equipe. */
export interface CoordinatedLeader {
  /** Membership da liderança (managed_by = membership de coordenação do chamador). */
  leadership: Membership
  /** Perfil para exibição (null se o RLS esconder — fail-closed, não inventa). */
  profile: TeamMemberProfile | null
  /** Membros ativos geridos diretamente por esta liderança (equipe). */
  members: TeamMember[]
}

/** Unidade sob coordenação (uma membership de coordenação ativa). */
export interface CoordinatedUnit {
  /** Membership de coordenação do chamador na unidade (origem do escopo). */
  coordination: Membership
  unitId: string
  /** Nome da unidade; fallback se a workspace não for visível por RLS. */
  unitName: string
  leaders: CoordinatedLeader[]
}

interface RawProfileRow {
  id: string
  name: string
  email: string
  status: 'active' | 'pending' | string
  role: string
}

let lastError: { message: string } | null = null

/** Último erro (para a UI oferecer "tentar de novo" sem expor detalhes). */
export function getLastCoordinatorServiceError(): string | null {
  return lastError?.message ?? null
}

function clearError() {
  lastError = null
}

export async function getCoordinatorScope(): Promise<CoordinatedUnit[]> {
  if (!defaultDb) {
    lastError = { message: 'Supabase não configurado' }
    return []
  }

  clearError()
  const db = defaultDb

  const rpc = async <R>(fn: string, params?: Record<string, unknown>): Promise<R | null> => {
    const { data, error } = params ? await db.rpc(fn, params) : await db.rpc(fn)
    if (error) {
      lastError = error
      console.warn(`[Coordinator] ${fn} error:`, error.message)
      return null
    }
    return (data as R | null) ?? null
  }

  // 1. Unidades sob minha coordenação (memberships ativas, cargo coordinator).
  const units = await rpc<Membership[]>('get_coordinator_units')
  if (units === null) return []
  if (units.length === 0) return []

  // 2. Nomes das unidades (RLS; ausentes viram fallback "Unidade").
  const { data: wsRows, error: wsError } = await db
    .from('workspaces')
    .select('id, name')
    .in(
      'id',
      [...new Set(units.map((u) => u.workspace_id))],
    )
  if (wsError) {
    lastError = wsError
    console.warn('[Coordinator] workspaces fetch error:', wsError.message)
    return []
  }
  const unitName = new Map(
    ((wsRows as { id: string; name: string }[] | null) ?? []).map((w) => [w.id, w.name]),
  )

  // 3. Lideranças/subordinações diretas por unidade (fail-closed por RPC).
  const perUnit = await Promise.all(
    units.map(async (coordination) => {
      const rows = await rpc<Membership[]>('get_coordinator_leaders', {
        p_workspace_id: coordination.workspace_id,
      })
      return { coordination, leaders: rows ?? [] }
    }),
  )
  if (getLastCoordinatorServiceError() !== null) return []

  // 4. Equipe de cada liderança (fail-closed por RPC).
  const allLeaderRows = perUnit.flatMap((u) => u.leaders)
  const byManager = await Promise.all(
    allLeaderRows.map(async (leadership) => {
      const rows = await rpc<Membership[]>('get_memberships_by_manager', {
        p_manager_membership_id: leadership.id,
      })
      return { leadership, members: rows ?? [] }
    }),
  )
  if (getLastCoordinatorServiceError() !== null) return []

  // 5. Perfis (uma única consulta) para lideranças e membros.
  const profileIds = [
    ...new Set([
      ...allLeaderRows.map((l) => l.profile_id),
      ...byManager.flatMap((t) => t.members.map((m) => m.profile_id)),
    ]),
  ]
  const { data: profileRows, error: profileError } = await db
    .from('profiles')
    .select('id, name, email, status, role')
    .in('id', profileIds)
  if (profileError) {
    lastError = profileError
    console.warn('[Coordinator] profiles fetch error:', profileError.message)
    return []
  }
  const profileOf = new Map<string, TeamMemberProfile>()
  for (const raw of (profileRows as RawProfileRow[] | null) ?? []) {
    profileOf.set(raw.id, {
      id: raw.id,
      name: raw.name,
      email: raw.email,
      status: raw.status === 'active' ? 'active' : 'pending',
      roleId: dbRoleToRoleId(raw.role),
    })
  }

  const membersOf = new Map(byManager.map((t) => [t.leadership.id, t.members]))

  return perUnit.map(({ coordination, leaders }) => ({
    coordination,
    unitId: coordination.workspace_id,
    unitName: unitName.get(coordination.workspace_id) ?? 'Unidade',
    leaders: leaders.map((leadership) => ({
      leadership,
      profile: profileOf.get(leadership.profile_id) ?? null,
      members: (membersOf.get(leadership.id) ?? []).map((membership) => ({
        membership,
        profile: profileOf.get(membership.profile_id) ?? null,
      })),
    })),
  }))
}

/**
 * Escrita ESCOPOADA da relação de gestão (migration 047).
 * `managerId === null` remove o membro da equipe (managed_by = NULL).
 * Retorna false + erro sinalizado quando o RPC nega (fora do escopo, etc.).
 */
export async function setCoordinatorManager(
  membershipId: string,
  managerId: string | null,
): Promise<boolean> {
  return callCoordinatorRpc('coordinator_set_manager', {
    p_membership_id: membershipId,
    p_manager_id: managerId,
  })
}

/**
 * RBAC 2.0 (Fase 9 / migration 065): ciclo de vida das memberships da UNIDADE
 * coordenada. Toda a autoridade vive nos RPCs SECURITY DEFINER fail-closed
 * (escopo = coordenador ativo da unidade): a UI apenas chama e reage ao erro.
 */

/** Cargos que o coordenador PODE atribuir (nunca adm/coordinator — servidor). */
export type CoordinatorAssignableRole = 'tec' | 'vis' | 'est' | 'opv' | 'lider'

/**
 * Lista canônica e fechada dos slugs atribuíveis (espelha o CHECK do RPC 065).
 * Mantida aqui para que a UI nunca ofereça um cargo que o servidor rejeitaria.
 */
export const COORDINATOR_ASSIGNABLE_ROLE_SLUGS: readonly CoordinatorAssignableRole[] = [
  'tec',
  'vis',
  'est',
  'opv',
  'lider',
]

/** Cargo atribuível + nome para exibição (`roles.slug`/`roles.name`, RLS global). */
export interface CoordinatorRoleOption {
  /** id (uuid) da tabela pública `roles` — casa com `membership.role_id`. */
  id: string
  slug: CoordinatorAssignableRole
  name: string
}

/** Membership da unidade + perfil para exibição (pendente ou inativa). */
export interface CoordinatorRequest {
  membership: Membership
  profile: TeamMemberProfile | null
}

/** Alias semântico: membership `suspended`/`removed` da unidade (Fase 10). */
export type CoordinatorInactiveMember = CoordinatorRequest

/**
 * Projeção devolvida pelas RPCs de listagem (065/066): a membership + os campos
 * de perfil já projetados DENTRO do SECURITY DEFINER. O perfil precisa vir da
 * RPC porque a RLS de `profiles` (044) esconde alvos de memberships não-ativas
 * (pending/suspended/removed) — a UI nunca faz SELECT direto de `profiles`.
 */
interface CoordinatorMemberRow {
  membership_id: string
  profile_id: string
  workspace_id: string
  role_id: string
  status: MembershipStatus
  managed_by: string | null
  created_at: string
  updated_at: string
  profile_name: string | null
  profile_email: string | null
  profile_status: string | null
  profile_role: string | null
}

function mapCoordinatorMemberRow(row: CoordinatorMemberRow): CoordinatorRequest {
  const profile: TeamMemberProfile | null =
    row.profile_name === null
      ? null
      : {
          id: row.profile_id,
          name: row.profile_name,
          email: row.profile_email ?? '',
          status: row.profile_status === 'active' ? 'active' : 'pending',
          roleId: dbRoleToRoleId(row.profile_role ?? ''),
        }
  return {
    membership: {
      id: row.membership_id,
      profile_id: row.profile_id,
      workspace_id: row.workspace_id,
      role_id: row.role_id,
      status: row.status,
      managed_by: row.managed_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    profile,
  }
}

/** Chamada de leitura de membros da unidade por RPC (projeção com perfil). */
async function getCoordinatorMembers(
  fn: string,
  workspaceId: string,
): Promise<CoordinatorRequest[]> {
  if (!defaultDb) {
    lastError = { message: 'Supabase não configurado' }
    return []
  }

  clearError()

  const { data, error } = await defaultDb.rpc(fn, { p_workspace_id: workspaceId })
  if (error) {
    lastError = error
    console.warn(`[Coordinator] ${fn} error:`, error.message)
    return []
  }

  const rows = (data as CoordinatorMemberRow[] | null) ?? []
  return rows.map(mapCoordinatorMemberRow)
}

/** Chamada de RPC de escrita; `true` em sucesso, `false` + erro sinalizado. */
async function callCoordinatorRpc(
  fn: string,
  params: Record<string, unknown>,
): Promise<boolean> {
  if (!defaultDb) {
    lastError = { message: 'Supabase não configurado' }
    return false
  }

  clearError()

  const { error } = await defaultDb.rpc(fn, params)

  if (error) {
    lastError = error
    console.warn(`[Coordinator] ${fn} error:`, error.message)
    return false
  }

  return true
}

/**
 * Solicitações PENDENTES da unidade (migration 065, projeção da 066). Fail-closed:
 * o RPC só devolve linhas se o chamador coordenar ativamente a unidade; erro ⇒ []
 * + erro sinalizado (a UI não inventa pedidos).
 */
export function getCoordinatorRequests(workspaceId: string): Promise<CoordinatorRequest[]> {
  return getCoordinatorMembers('coordinator_get_requests', workspaceId)
}

/**
 * Memberships INATIVAS (`suspended`/`removed`) da unidade (migration 066),
 * somente se o chamador coordena ativamente a unidade. A RPC projeta o perfil
 * (nome/e-mail) dentro do SECURITY DEFINER — a RLS de `profiles` (044) esconde
 * alvos de memberships não-ativas, então não há SELECT direto no frontend.
 * A distinção suspended/removed vem do `membership.status`.
 */
export function getCoordinatorInactiveMembers(
  workspaceId: string,
): Promise<CoordinatorInactiveMember[]> {
  return getCoordinatorMembers('coordinator_get_inactive_members', workspaceId)
}

/**
 * Cargos que o coordenador pode atribuir, com o id (uuid) e o nome para exibição.
 * Leitura RLS da tabela `roles` (blueprints globais — `roles_select`, 036); a
 * lista de slugs é FECHADA (`COORDINATOR_ASSIGNABLE_ROLE_SLUGS`), então a UI nunca
 * oferece adm/coordinator. Fail-closed: erro/sem linhas → [] + erro sinalizado
 * (sem cargos atribuíveis a UI desabilita a troca de cargo; nada é inventado).
 */
export async function getCoordinatorAssignableRoles(): Promise<CoordinatorRoleOption[]> {
  if (!defaultDb) {
    lastError = { message: 'Supabase não configurado' }
    return []
  }

  clearError()

  const { data, error } = await defaultDb
    .from('roles')
    .select('id, slug, name')
    .in('slug', [...COORDINATOR_ASSIGNABLE_ROLE_SLUGS])
  if (error) {
    lastError = error
    console.warn('[Coordinator] roles fetch error:', error.message)
    return []
  }

  const rows = (data as { id: string; slug: string; name: string }[] | null) ?? []
  const bySlug = new Map(rows.map((row) => [row.slug, row]))
  return COORDINATOR_ASSIGNABLE_ROLE_SLUGS.flatMap((slug) => {
    const row = bySlug.get(slug)
    return row ? [{ id: row.id, slug, name: row.name }] : []
  })
}

/** pending → active (só solicitação pendente da unidade coordenada). */
export function approveCoordinatorMembership(membershipId: string): Promise<boolean> {
  return callCoordinatorRpc('coordinator_approve_membership', {
    p_membership_id: membershipId,
  })
}

/** Rejeita a solicitação pendente (remove a membership; perfil/usuário ficam). */
export function rejectCoordinatorMembership(membershipId: string): Promise<boolean> {
  return callCoordinatorRpc('coordinator_reject_membership', {
    p_membership_id: membershipId,
  })
}

/** active → suspended (neutraliza dependentes, server-side). */
export function suspendCoordinatorMembership(membershipId: string): Promise<boolean> {
  return callCoordinatorRpc('coordinator_suspend_membership', {
    p_membership_id: membershipId,
  })
}

/** suspended → active (NÃO recria managed_by). */
export function restoreCoordinatorMembership(membershipId: string): Promise<boolean> {
  return callCoordinatorRpc('coordinator_restore_membership', {
    p_membership_id: membershipId,
  })
}

/** active → removed (preserva perfil/usuário; neutraliza dependentes). */
export function removeCoordinatorMembership(membershipId: string): Promise<boolean> {
  return callCoordinatorRpc('coordinator_remove_membership', {
    p_membership_id: membershipId,
  })
}

/** Troca ESCOPOADA do cargo da membership (servidor limita a tec/vis/est/opv/lider). */
export function setCoordinatorRole(
  membershipId: string,
  role: CoordinatorAssignableRole,
): Promise<boolean> {
  return callCoordinatorRpc('coordinator_set_role', {
    p_membership_id: membershipId,
    p_role_slug: role,
  })
}