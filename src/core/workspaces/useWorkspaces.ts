import { useCallback, useEffect, useState } from 'react'
import type { Workspace, WorkspaceFormData } from './types'
import { workspaceService } from './service'

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    workspaceService.initDefault()
    const data = workspaceService.getAll()
    setWorkspaces(data.sort((a, b) => a.name.localeCompare(b.name)))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = useCallback((data: WorkspaceFormData) => {
    const workspace = workspaceService.create(data)
    setWorkspaces((prev) => [...prev, workspace].sort((a, b) => a.name.localeCompare(b.name)))
    return workspace
  }, [])

  const update = useCallback((id: string, data: Partial<Workspace>) => {
    const workspace = workspaceService.update(id, data)
    if (workspace) {
      setWorkspaces((prev) => prev.map((w) => (w.id === id ? workspace : w)).sort((a, b) => a.name.localeCompare(b.name)))
    }
    return workspace
  }, [])

  const remove = useCallback((id: string) => {
    const ok = workspaceService.remove(id)
    if (ok) {
      setWorkspaces((prev) => prev.filter((w) => w.id !== id))
    }
    return ok
  }, [])

  return { workspaces, loading, create, update, remove, reload: load }
}
