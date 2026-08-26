// Global workspace state - accessible outside React components
// Synced from WorkspaceContext on every change

import type { Workspace } from './types'

type Listener = () => void

const listeners = new Set<Listener>()

let _workspace: Workspace | null = null
let _activeWorkspaceId: string | null = null
let _isAdmin = false
let _userWorkspaceIds: string[] = []

export const workspaceStore = {
  get workspace() { return _workspace },
  get activeWorkspaceId() { return _activeWorkspaceId },
  get isAdmin() { return _isAdmin },
  get userWorkspaceIds() { return _userWorkspaceIds },

  set(workspace: Workspace | null, isAdmin: boolean, userWorkspaceIds: string[]) {
    _workspace = workspace
    _activeWorkspaceId = workspace?.id || null
    _isAdmin = isAdmin
    _userWorkspaceIds = userWorkspaceIds
    listeners.forEach((fn) => fn())
  },

  subscribe(fn: Listener) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  matches(item: { workspace_id?: string | null }): boolean {
    if (_isAdmin && !_activeWorkspaceId) return true
    if (_isAdmin && _activeWorkspaceId) return item.workspace_id === _activeWorkspaceId
    if (_activeWorkspaceId) return item.workspace_id === _activeWorkspaceId
    if (_userWorkspaceIds.length > 0) return _userWorkspaceIds.includes(item.workspace_id || '')
    return false
  },

  filter<T extends { workspace_id?: string | null }>(items: T[]): T[] {
    return items.filter((item) => workspaceStore.matches(item))
  },
}
