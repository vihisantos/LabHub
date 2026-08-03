import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import type { Workspace } from './types'
import { workspaceService } from './service'
import { workspaceStore } from './store'

interface WorkspaceContextValue {
  workspace: Workspace | null
  workspaces: Workspace[]
  assignedWorkspaces: Workspace[]
  loading: boolean
  setWorkspace: (workspace: Workspace) => void
  reload: () => void
}

const STORAGE_KEY = 'labhub_active_workspace'

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: null,
  workspaces: [],
  assignedWorkspaces: [],
  loading: true,
  setWorkspace: () => {},
  reload: () => {},
})

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [workspace, setWorkspaceState] = useState<Workspace | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  const assignedWorkspaces = workspaces.filter((w) => {
    if (!user) return true
    if (user.role === 'admin') return true
    return user.workspace_ids.length === 0 || user.workspace_ids.includes(w.id)
  })

  const load = useCallback(async () => {
    setLoading(true)
    await workspaceService.initDefault()
    const all = workspaceService.getAll()
    setWorkspaces(all)

    // Restore previously selected workspace from localStorage
    const savedSlug = localStorage.getItem(STORAGE_KEY)
    if (savedSlug) {
      const found = all.find((w) => w.slug === savedSlug)
      if (found && (user?.role === 'admin' || user?.workspace_ids.includes(found.id))) {
        setWorkspaceState(found)
      }
    }
    // No auto-selection — user must choose via workspace selector/admin screen

    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  // Sync workspace store (used by storage layer for filtering)
  useEffect(() => {
    workspaceStore.set(
      workspace,
      user?.role === 'admin' || false,
      user?.workspace_ids || [],
    )
  }, [workspace, user])

  const setWorkspace = useCallback((ws: Workspace) => {
    setWorkspaceState(ws)
    localStorage.setItem(STORAGE_KEY, ws.slug)
  }, [])

  return (
    <WorkspaceContext.Provider value={{ workspace, workspaces, assignedWorkspaces, loading, setWorkspace, reload: load }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

// eslint-disable-next-line react/only-export-components
export function useWorkspace() {
  return useContext(WorkspaceContext)
}
