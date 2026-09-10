import { defaultDb } from '../../lib/supabase'
import type { Membership, TeamMember } from './membership'
import { dbRoleToRoleId } from './membership'

/**
 * RBAC 2.0 (Fase 7): leitura ESCOPOADA da equipe do líder.
 *
 * A UI NÃO decide escopo: a equipe vem do RPC server-side
 * `get_leader_team(workspace_id)` (SECURITY DEFINER, fail-closed — retorna
 * vazio para quem não é líder ativo naquela unidade via cargo 'lider').
 * Aqui fazemos a orquestração: RPC → memberships + JOIN client-side com
 * `profiles` (visíveis por RLS — membros ativos da mesma unidade).
 */

interface RawProfileRow {
  id: string
  name: string
  email: string
  status: 'active' | 'pending' | string
  role: string
}

let lastError: { message: string } | null = null

/** Último erro (para a UI oferecer "tentar de novo" sem expor detalhes). */
export function getLastTeamServiceError(): string | null {
  return lastError?.message ?? null
}

function clearError() {
  lastError = null
}

export async function getLeaderTeam(workspaceId: string): Promise<TeamMember[]> {
  if (!defaultDb) {
    lastError = { message: 'Supabase não configurado' }
    return []
  }

  clearError()

  const { data, error } = await defaultDb.rpc('get_leader_team', {
    p_workspace_id: workspaceId,
  })

  if (error) {
    lastError = error
    console.warn('[Team] get_leader_team error:', error.message)
    return []
  }

  const memberships = (data as Membership[] | null) ?? []
  if (memberships.length === 0) return []

  const ids = [...new Set(memberships.map((m) => m.profile_id))]
  const { data: profiles, error: profilesError } = await defaultDb
    .from('profiles')
    .select('id, name, email, status, role')
    .in('id', ids)

  if (profilesError) {
    lastError = profilesError
    console.warn('[Team] profiles fetch error:', profilesError.message)
    return []
  }

  const profileMap = new Map(
    ((profiles as RawProfileRow[] | null) ?? []).map((p) => [p.id, p]),
  )

  return memberships.map((membership) => {
    const raw = profileMap.get(membership.profile_id)
    return {
      membership,
      profile: raw
        ? {
            id: raw.id,
            name: raw.name,
            email: raw.email,
            status: raw.status === 'active' ? ('active' as const) : ('pending' as const),
            roleId: dbRoleToRoleId(raw.role),
          }
        : null,
    }
  })
}