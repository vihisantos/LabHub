import type { Workspace } from './types'

export interface HasWorkspace {
  id: string
  workspace_id?: string
}

export function withWorkspaceFilter<T extends HasWorkspace>(
  items: T[],
  workspaceId?: string | null,
  userWorkspaceIds?: string[],
  isAdmin?: boolean,
): T[] {
  if (!workspaceId && isAdmin) return items
  if (workspaceId) return items.filter((item) => item.workspace_id === workspaceId)
  if (userWorkspaceIds && userWorkspaceIds.length > 0) {
    return items.filter((item) => userWorkspaceIds.includes(item.workspace_id || ''))
  }
  return []
}

export function assignWorkspace<T extends HasWorkspace>(
  item: T,
  workspace: Workspace | null,
): T {
  if (!workspace) return item
  return { ...item, workspace_id: workspace.id }
}
