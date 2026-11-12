import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import type { Workspace } from './types'
import { workspaceService } from './service'
import { workspaceStore } from './store'
import { WorkspaceGate } from '../../platform/WorkspaceGate/WorkspaceGate'
import { assignedWorkspaceIds, selectAssignedWorkspaces } from '../memberships/service'
import { broadcastWorkspaceContext, sessionWorkspaceContext } from './sessionContext'

interface WorkspaceContextValue {
  workspace: Workspace | null
  activeWorkspace: Workspace | null
  activeWorkspaceRevision: number | null
  activeWorkspaceLoading: boolean
  activeWorkspaceError: string | null
  switchingWorkspace: boolean
  workspaces: Workspace[]
  assignedWorkspaces: Workspace[]
  loading: boolean
  pendingSelection: boolean
  setWorkspace: (workspace: Workspace, opts?: { persist?: boolean; scopeOnly?: boolean }) => Promise<boolean>
  clearPreference: () => void
  reload: () => void
}

const STORAGE_KEY = 'labhub_active_workspace'

function getPreferenceKey(userId: string) {
  return `labhub_workspace_preference_${userId}`
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: null,
  activeWorkspace: null,
  activeWorkspaceRevision: null,
  activeWorkspaceLoading: true,
  activeWorkspaceError: null,
  switchingWorkspace: false,
  workspaces: [],
  assignedWorkspaces: [],
  loading: true,
  pendingSelection: false,
  setWorkspace: async () => false,
  clearPreference: () => {},
  reload: () => {},
})

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  const [workspace, setWorkspaceState] = useState<Workspace | null>(null)
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
  const [activeWorkspaceRevision, setActiveWorkspaceRevision] = useState<number | null>(null)
  const [activeWorkspaceLoading, setActiveWorkspaceLoading] = useState(true)
  const [activeWorkspaceError, setActiveWorkspaceError] = useState<string | null>(null)
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingSelection, setPendingSelection] = useState(false)

  // Controla se o usuário já escolheu um workspace nesta sessão. Impede que o
  // gate reapareça quando o `load` roda de novo por mudança de identidade do
  // auth (ex.: refresh de token, USER_UPDATED) depois da escolha inicial.
  const selectionRef = useRef<{ userId: string | null; done: boolean }>({
    userId: null,
    done: false,
  })
  const loadSequenceRef = useRef(0)
  const selectionSequenceRef = useRef(0)
  const selectionQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const activeRevisionRef = useRef<number | null>(null)
  const scopeOnlyRef = useRef(false)
  activeRevisionRef.current = activeWorkspaceRevision

  const assignedWorkspaces = useMemo(
    () => selectAssignedWorkspaces(workspaces, user),
    [workspaces, user],
  )

  const applySelection = useCallback(async (
    ws: Workspace,
    persist: boolean,
    options: { scopeOnly?: boolean } = {},
  ): Promise<boolean> => {
    if (options.scopeOnly) {
      scopeOnlyRef.current = true
      setWorkspaceState(ws)
      return true
    }
    if (!user?.id) {
      setActiveWorkspaceError('Entre novamente para confirmar o campus selecionado.')
      return false
    }

    const sequence = ++selectionSequenceRef.current
    setSwitchingWorkspace(true)
    setActiveWorkspaceLoading(true)
    setActiveWorkspaceError(null)
    const operation = selectionQueueRef.current.then(async () => {
      const confirmed = await sessionWorkspaceContext.select(ws.id)
      if (!confirmed || confirmed.workspace.id !== ws.id) {
        throw new Error('O servidor não confirmou o campus solicitado.')
      }
      return confirmed
    })
    selectionQueueRef.current = operation.catch(() => undefined)

    try {
      const confirmed = await operation
      if (confirmed.revision < (activeRevisionRef.current ?? 0)) {
        const latest = await sessionWorkspaceContext.get()
        const latestWorkspace = latest && workspaces.find((candidate) => candidate.id === latest.workspace.id)
        if (latest && latestWorkspace && latest.revision >= (activeRevisionRef.current ?? 0)) {
          activeRevisionRef.current = latest.revision
          setActiveWorkspace(latestWorkspace)
          setActiveWorkspaceRevision(latest.revision)
          if (!scopeOnlyRef.current) setWorkspaceState(latestWorkspace)
        }
        if (sequence === selectionSequenceRef.current) {
          setActiveWorkspaceError('Outra seleção mais recente foi confirmada em uma sessão compartilhada.')
        }
        return false
      }
      activeRevisionRef.current = confirmed.revision
      setActiveWorkspace(ws)
      setActiveWorkspaceRevision(confirmed.revision)
      broadcastWorkspaceContext(confirmed.revision)
      if (sequence === selectionSequenceRef.current) {
        scopeOnlyRef.current = false
        setWorkspaceState(ws)
        try {
          localStorage.setItem(STORAGE_KEY, ws.slug)
          if (persist) localStorage.setItem(getPreferenceKey(user.id), ws.id)
        } catch {
          /* Local preference is optional; server confirmation remains authoritative. */
        }
        selectionRef.current = { userId: user.id, done: true }
        setPendingSelection(false)
      }
      return true
    } catch (cause) {
      if (sequence === selectionSequenceRef.current) {
        setActiveWorkspaceError(cause instanceof Error ? cause.message : 'Não foi possível confirmar o campus.')
        try {
          const current = await sessionWorkspaceContext.get()
          const confirmedCurrent = current && workspaces.find((candidate) => candidate.id === current.workspace.id)
          if (current && confirmedCurrent) {
            activeRevisionRef.current = current.revision
            setActiveWorkspace(confirmedCurrent)
            setActiveWorkspaceRevision(current.revision)
            if (!scopeOnlyRef.current) setWorkspaceState(confirmedCurrent)
          }
        } catch {
          setActiveWorkspace(null)
          activeRevisionRef.current = null
          setActiveWorkspaceRevision(null)
        }
      }
      return false
    } finally {
      if (sequence === selectionSequenceRef.current) {
        setSwitchingWorkspace(false)
        setActiveWorkspaceLoading(false)
      }
    }
  }, [user, workspaces])

  const load = useCallback(async () => {
    const sequence = ++loadSequenceRef.current
    setLoading(true)
    setActiveWorkspaceLoading(true)
    setActiveWorkspaceError(null)
    await workspaceService.syncFromSupabase()
    if (sequence !== loadSequenceRef.current) return
    const all = workspaceService.getAll()
    setWorkspaces(all)

    const assigned = selectAssignedWorkspaces(all, user)

    if (user?.status === 'pending') {
      // Firewall Etapa 7: usuário ainda aguardando aprovação NUNCA chega ao
      // gate de seleção de workspace (a tela de espera é renderizada pelo
      // AuthGuard no App). workspace_ids vazio + filtro estrito já dariam o
      // estado seguro; aqui garantimos explicitamente, independente de dados.
      setWorkspaceState(null)
      setActiveWorkspace(null)
      activeRevisionRef.current = null
      setActiveWorkspaceRevision(null)
      setPendingSelection(false)
      setLoading(false)
      setActiveWorkspaceLoading(false)
      return
    }

    if (user && user.membershipsLoaded !== true) {
      // Memberships ainda não carregadas (ou falha): o gate permanece em
      // `loading` e nenhuma visibilidade é decidida (§3.2). A re-tentativa vem
      // pelo ciclo de auth (refreshProfile republica ao carregar).
      setWorkspaceState(null)
      setActiveWorkspace(null)
      activeRevisionRef.current = null
      setActiveWorkspaceRevision(null)
      setPendingSelection(false)
      return
    }

    if (user) {
      // Nova sessão (primeiro load ou troca de usuário) → volta a exigir seleção
      if (selectionRef.current.userId !== user.id) {
        selectionRef.current = { userId: user.id, done: false }
      }

      let prefId: string | null = null
      try {
        prefId = localStorage.getItem(getPreferenceKey(user.id))
      } catch {
        /* localStorage unavailable — no persisted preference */
      }
      const pref = prefId ? assigned.find((w) => w.id === prefId) : undefined
      let candidate: Workspace | undefined
      const preserveTemporaryScope = scopeOnlyRef.current && selectionRef.current.userId === user.id
      try {
        let confirmed = await sessionWorkspaceContext.get()
        if (sequence !== loadSequenceRef.current) return
        if (confirmed && confirmed.revision < (activeRevisionRef.current ?? 0)) {
          confirmed = await sessionWorkspaceContext.get()
          if (sequence !== loadSequenceRef.current) return
        }
        if (confirmed && confirmed.revision < (activeRevisionRef.current ?? 0)) {
          setLoading(false)
          setActiveWorkspaceLoading(false)
          return
        }
        if (confirmed) {
          candidate = all.find((w) => w.id === confirmed.workspace.id)
          const permitted = candidate && (user.is_super_admin || assigned.some((w) => w.id === candidate?.id))
          if (!candidate || !permitted) {
            setWorkspaceState(null)
            setActiveWorkspace(null)
            activeRevisionRef.current = null
            setActiveWorkspaceRevision(null)
            setActiveWorkspaceError('O campus confirmado pela sessão não está disponível nesta conta. Refaça a seleção do campus.')
            setPendingSelection(true)
            setLoading(false)
            setActiveWorkspaceLoading(false)
            return
          }
          if (!preserveTemporaryScope) scopeOnlyRef.current = false
          selectionRef.current = { userId: user.id, done: true }
          if (!preserveTemporaryScope) setWorkspaceState(candidate)
          setActiveWorkspace(confirmed.workspace.id === candidate.id ? candidate : null)
          activeRevisionRef.current = confirmed.revision
          setActiveWorkspaceRevision(confirmed.revision)
          setPendingSelection(false)
          try { localStorage.setItem(STORAGE_KEY, candidate.slug) } catch { /* visual preference only */ }
          setLoading(false)
          setActiveWorkspaceLoading(false)
          return
        }
        candidate = pref ?? (!user.is_super_admin && assigned.length === 1 ? assigned[0] : undefined)
        if (candidate) {
          const selected = await sessionWorkspaceContext.select(candidate.id)
          if (sequence !== loadSequenceRef.current) return
          if (!selected || selected.workspace.id !== candidate.id) throw new Error('O servidor não confirmou o campus inicial.')
          const confirmedWorkspace = all.find((w) => w.id === selected.workspace.id)
          if (!confirmedWorkspace) throw new Error('O campus confirmado não está disponível localmente.')
          if (!preserveTemporaryScope) scopeOnlyRef.current = false
          selectionRef.current = { userId: user.id, done: true }
          if (!preserveTemporaryScope) setWorkspaceState(confirmedWorkspace)
          setActiveWorkspace(confirmedWorkspace)
          activeRevisionRef.current = selected.revision
          setActiveWorkspaceRevision(selected.revision)
          setPendingSelection(false)
          try {
            localStorage.setItem(STORAGE_KEY, confirmedWorkspace.slug)
            if (!pref && !user.is_super_admin) localStorage.setItem(getPreferenceKey(user.id), confirmedWorkspace.id)
          } catch { /* Local preference is optional. */ }
          broadcastWorkspaceContext(selected.revision)
        } else if (user.is_super_admin || assigned.length > 1) {
          setWorkspaceState(null)
          setActiveWorkspace(null)
          activeRevisionRef.current = null
          setActiveWorkspaceRevision(null)
          setPendingSelection(true)
        } else {
          setWorkspaceState(null)
          setActiveWorkspace(null)
          activeRevisionRef.current = null
          setActiveWorkspaceRevision(null)
          setPendingSelection(false)
        }
        setActiveWorkspaceError(null)
      } catch (cause) {
        if (sequence !== loadSequenceRef.current) return
        // A local preference may still be shown as a visual suggestion, but it
        // never populates the authenticated context or enables protected work.
        candidate = pref ?? (!user.is_super_admin && assigned.length === 1 ? assigned[0] : undefined)
        if (!preserveTemporaryScope) setWorkspaceState(candidate ?? null)
        setActiveWorkspace(null)
        activeRevisionRef.current = null
        setActiveWorkspaceRevision(null)
        setActiveWorkspaceError(cause instanceof Error ? cause.message : 'Não foi possível confirmar o campus com o servidor.')
        setPendingSelection(!candidate && (user.is_super_admin || assigned.length > 1))
      }
    } else {
      setWorkspaceState(null)
      setActiveWorkspace(null)
      activeRevisionRef.current = null
      setActiveWorkspaceRevision(null)
      setPendingSelection(false)
      setActiveWorkspaceError(null)
    }

    setLoading(false)
    setActiveWorkspaceLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!user) return
    let alive = true
    const refreshFromServer = async () => {
      try {
        const confirmed = await sessionWorkspaceContext.get()
        if (!alive || !confirmed || confirmed.revision <= (activeRevisionRef.current ?? 0)) return
        const all = workspaceService.getAll()
        const candidate = all.find((w) => w.id === confirmed.workspace.id)
        if (!candidate) return
        setActiveWorkspace(candidate)
        activeRevisionRef.current = confirmed.revision
        setActiveWorkspaceRevision(confirmed.revision)
        if (!scopeOnlyRef.current) setWorkspaceState(candidate)
        setActiveWorkspaceError(null)
      } catch {
        // A failed cross-tab refresh never replaces an already confirmed state.
      }
    }
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel('labhub-workspace-context')
      channel.onmessage = (event) => {
        if (event.data?.type === 'changed') void refreshFromServer()
      }
    } catch { /* Focus refresh remains available where BroadcastChannel is absent. */ }
    window.addEventListener('focus', refreshFromServer)
    return () => {
      alive = false
      channel?.close()
      window.removeEventListener('focus', refreshFromServer)
    }
  }, [user])

  // Sync workspace store (used by storage layer for filtering) — mesma fonte (§3.2)
  useEffect(() => {
    workspaceStore.set(
      workspace,
      user?.is_super_admin || false,
      assignedWorkspaceIds(user),
    )
  }, [workspace, user])

  const setWorkspace = useCallback((ws: Workspace, opts?: { persist?: boolean; scopeOnly?: boolean }) => {
    return applySelection(ws, opts?.persist ?? false, { scopeOnly: opts?.scopeOnly })
  }, [applySelection])

  const clearPreference = useCallback(() => {
    if (!user?.id) return
    try {
      localStorage.removeItem(getPreferenceKey(user.id))
    } catch {
      /* localStorage unavailable — preference remains in storage but is ignored */
    }
  }, [user])

  const refreshWorkspaces = useCallback(async () => {
    await workspaceService.syncFromSupabase()
    const all = workspaceService.getAll()
    setWorkspaces(all)
    setWorkspaceState((prev) => (prev ? all.find((w) => w.id === prev.id) ?? prev : prev))
  }, [])

  const value: WorkspaceContextValue = {
    workspace,
    activeWorkspace,
    activeWorkspaceRevision,
    activeWorkspaceLoading,
    activeWorkspaceError,
    switchingWorkspace,
    workspaces,
    assignedWorkspaces,
    loading,
    pendingSelection,
    setWorkspace,
    clearPreference,
    reload: load,
  }

  const isPublicChamados = location.pathname.startsWith('/chamados-publico')
  // A área administrativa é GLOBAL (AdminGuard = is_super_admin): a fila de
  // aprovação (/admin/requests) não pode exigir a escolha prévia de uma
  // unidade — o workspace segue como contexto opcional dentro do /admin.
  const isAdminArea = location.pathname.startsWith('/admin')

  if (pendingSelection && !loading && !isPublicChamados && !isAdminArea) {
    return (
      <WorkspaceContext.Provider value={value}>
        <WorkspaceGate
          workspaces={assignedWorkspaces}
          selectionError={activeWorkspaceError}
          onSelect={(ws, persist) => { void applySelection(ws, persist) }}
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
