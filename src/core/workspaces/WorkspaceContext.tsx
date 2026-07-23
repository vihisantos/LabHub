import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { Workspace } from './types'
import { workspaceService } from './service'

interface WorkspaceContextValue {
  workspace: Workspace | null
  workspaces: Workspace[]
  loading: boolean
  setWorkspace: (workspace: Workspace) => void
  reload: () => void
}

const STORAGE_KEY = 'labhub_active_workspace'

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: null,
  workspaces: [],
  loading: true,
  setWorkspace: () => {},
  reload: () => {},
})

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspaceState] = useState<Workspace | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    workspaceService.initDefault()
    const all = workspaceService.getAll()
    setWorkspaces(all)

    const savedSlug = localStorage.getItem(STORAGE_KEY)
    if (savedSlug) {
      const found = all.find((w) => w.slug === savedSlug)
      if (found) {
        setWorkspaceState(found)
        setLoading(false)
        return
      }
    }

    if (all.length > 0) {
      setWorkspaceState(all[0])
      localStorage.setItem(STORAGE_KEY, all[0].slug)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const setWorkspace = useCallback((ws: Workspace) => {
    setWorkspaceState(ws)
    localStorage.setItem(STORAGE_KEY, ws.slug)
  }, [])

  return (
    <WorkspaceContext.Provider value={{ workspace, workspaces, loading, setWorkspace, reload: load }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

// eslint-disable-next-line react/only-export-components
export function useWorkspace() {
  return useContext(WorkspaceContext)
}
