import { useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useWorkspace } from './WorkspaceContext'

export function useWorkspaceFilter() {
  const { user } = useAuth()
  const { workspace } = useWorkspace()

  return useMemo(() => {
    const activeWorkspaceId = workspace?.id || null
    const userWorkspaceIds = user?.workspace_ids || []
    const isAdmin = !!user?.is_super_admin

    function filterByWorkspace<T extends { workspace_id?: string }>(items: T[]): T[] {
      if (isAdmin && !activeWorkspaceId) return items
      if (isAdmin && activeWorkspaceId) return items.filter((item) => item.workspace_id === activeWorkspaceId)
      if (activeWorkspaceId) return items.filter((item) => !item.workspace_id || item.workspace_id === activeWorkspaceId)
      if (userWorkspaceIds.length > 0) return items.filter((item) => !item.workspace_id || userWorkspaceIds.includes(item.workspace_id))
      return items
    }

    function matchesWorkspace(item: { workspace_id?: string }): boolean {
      if (isAdmin && !activeWorkspaceId) return true
      if (isAdmin && activeWorkspaceId) return item.workspace_id === activeWorkspaceId
      if (activeWorkspaceId) return !item.workspace_id || item.workspace_id === activeWorkspaceId
      if (userWorkspaceIds.length > 0) return !item.workspace_id || userWorkspaceIds.includes(item.workspace_id)
      return true
    }

    return { filterByWorkspace, matchesWorkspace, activeWorkspaceId, isAdmin }
  }, [user, workspace])
}
