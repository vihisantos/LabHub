import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import type { Workspace } from './types'
import { workspaceService } from './service'
import { workspaceStore } from './store'
import { WorkspaceGate } from '../../platform/WorkspaceGate/WorkspaceGate'

interface WorkspaceContextValue {
  workspace: Workspace | null
  workspaces: Workspace[]
  assignedWorkspaces: Workspace[]
  loading: boolean
  pendingSelection: boolean
  setWorkspace: (workspace: Workspace, opts?: { persist?: boolean }) => void
  clearPreference: () => void
  reload: () => void
}

const STORAGE_KEY = 'labhub_active_workspace'

function getPreferenceKey(userId: string) {
  return `labhub_workspace_preference_${userId}`
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: null,
  workspaces: [],
  assignedWorkspaces: [],
  loading: true,
  pendingSelection: false,
  setWorkspace: () => {},
  clearPreference: () => {},
  reload: () => {},
})

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  const [workspace, setWorkspaceState] = useState<Workspace | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingSelection, setPendingSelection] = useState(false)

  const assignedWorkspaces = useMemo(
    () =>
      workspaces.filter((w) => {
        if (!user) return true
        if (user.is_super_admin) return true
        return user.workspace_ids.length === 0 || user.workspace_ids.includes(w.id)
      }),
    [workspaces, user],
  )

  const applySelection = useCallback((ws: Workspace, persist: boolean) => {
    setWorkspaceState(ws)
    localStorage.setItem(STORAGE_KEY, ws.slug)
    if (persist && user?.id) {
      localStorage.setItem(getPreferenceKey(user.id), ws.id)
    }
    setPendingSelection(false)
  }, [user])

  const load = useCallback(async () => {
    setLoading(true)
    await workspaceService.syncFromSupabase()
    const all = workspaceService.getAll()
    setWorkspaces(all)

    const assigned = all.filter((w) => {
      if (!user) return true
      if (user.is_super_admin) return true
      return user.workspace_ids.length === 0 || user.workspace_ids.includes(w.id)
    })

    if (user) {
      const prefId = localStorage.getItem(getPreferenceKey(user.id))
      const pref = prefId ? assigned.find((w) => w.id === prefId) : undefined
      if (pref) {
        setWorkspaceState(pref)
        setPendingSelection(false)
      } else if (user.is_super_admin) {
        // Super admin sempre escolhe (e pode criar) o workspace ao entrar,
        // mesmo com apenas um ambiente — cada workspace é uma escola.
        setWorkspaceState(null)
        setPendingSelection(true)
      } else if (assigned.length === 1) {
        setWorkspaceState(assigned[0])
        localStorage.setItem(STORAGE_KEY, assigned[0].slug)
        setPendingSelection(false)
      } else if (assigned.length > 1) {
        // Sem preferência persistida: força o gate de seleção
        setWorkspaceState(null)
        setPendingSelection(true)
      } else {
        setWorkspaceState(null)
        setPendingSelection(false)
      }
    } else {
      setWorkspaceState(null)
      setPendingSelection(false)
    }

    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  // Sync workspace store (used by storage layer for filtering)
  useEffect(() => {
    workspaceStore.set(
      workspace,
      user?.is_super_admin || false,
      user?.workspace_ids || [],
    )
  }, [workspace, user])

  const setWorkspace = useCallback((ws: Workspace, opts?: { persist?: boolean }) => {
    applySelection(ws, opts?.persist ?? false)
  }, [applySelection])

  const clearPreference = useCallback(() => {
    if (!user?.id) return
    localStorage.removeItem(getPreferenceKey(user.id))
  }, [user])

  const refreshWorkspaces = useCallback(async () => {
    await workspaceService.syncFromSupabase()
    setWorkspaces(workspaceService.getAll())
  }, [])

  const value: WorkspaceContextValue = {
    workspace,
    workspaces,
    assignedWorkspaces,
    loading,
    pendingSelection,
    setWorkspace,
    clearPreference,
    reload: load,
  }

  const isPublicChamados = location.pathname.startsWith('/chamados-publico')

  if (pendingSelection && !loading && !isPublicChamados) {
    return (
      <WorkspaceContext.Provider value={value}>
        <WorkspaceGate
          workspaces={assignedWorkspaces}
          onSelect={(ws, persist) => applySelection(ws, persist)}
          canCreate={user?.is_super_admin ?? false}
          user={user}
          onCreated={refreshWorkspaces}
          onDeleted={refreshWorkspaces}
        />
      </WorkspaceContext.Provider>
    )
  }

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

// eslint-disable-next-line react/only-export-components
export function useWorkspace() {
  return useContext(WorkspaceContext)
}
