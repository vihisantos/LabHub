import { useCallback, useEffect, useState } from 'react'
import { workspaceStore } from '../workspaces/store'
import type { TeamMember } from './membership'
import { getLeaderTeam, getLastTeamServiceError } from './teamService'

/**
 * RBAC 2.0 (Fase 7): equipe do líder no workspace ativo.
 *
 * Sincroniza com o `workspaceStore` (troca de unidade na sessão) e consulta o
 * RPC server-side `get_leader_team` — a UI nunca decide escopo. Sem workspace
 * ativo (ex.: nada selecionado ainda) devolve estado vazio, fail-closed.
 */
export function useTeam() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(() =>
    workspaceStore.activeWorkspaceId,
  )
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const refresh = useCallback(async () => {
    const wsId = workspaceStore.activeWorkspaceId
    if (!wsId) {
      setTeam([])
      setLoading(false)
      setFailed(false)
      return
    }
    setLoading(true)
    setFailed(false)
    const members = await getLeaderTeam(wsId)
    // Erro no RPC/profiles vira `failed` (vazio legítimo NÃO é erro).
    setFailed(members.length === 0 && getLastTeamServiceError() !== null)
    setTeam(members)
    setLoading(false)
  }, [])

  useEffect(() => {
    const unsubscribe = workspaceStore.subscribe(() => {
      setWorkspaceId(workspaceStore.activeWorkspaceId)
      void refresh()
    })
    void refresh()
    return () => {
      unsubscribe()
    }
  }, [refresh])

  return { team, loading, failed, workspaceId, refresh }
}