import { defaultDb } from '../../lib/supabase'
import type { Membership, TeamMember, TeamMemberProfile } from './membership'
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
 * relação de gestão dentro das próprias unidades (NULL remove da equipe); a RLS de
 * memberships permanece super-admin-only — o RPC é o ÚNICO caminho do coordenador.
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
  if (!defaultDb) {
    lastError = { message: 'Supabase não configurado' }
    return false
  }

  clearError()

  const { error } = await defaultDb.rpc('coordinator_set_manager', {
    p_membership_id: membershipId,
    p_manager_id: managerId,
  })

  if (error) {
    lastError = error
    console.warn('[Coordinator] coordinator_set_manager error:', error.message)
    return false
  }

  return true
}