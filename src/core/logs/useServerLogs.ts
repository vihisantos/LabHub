import { useCallback, useEffect, useState } from 'react'
import type { ServerAuditLog } from './serverAuditService'
import { serverAuditService } from './serverAuditService'
import { authService } from '../auth/service'

/** Atividade do usuário logado (home "Atividade Recente" = somente as minhas). */
export function useMyLogs(limit = 50) {
  const [logs, setLogs] = useState<ServerAuditLog[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const actorId = authService.getCurrentUser()?.id ?? ''
      const data = actorId ? await serverAuditService.getByActor(actorId, limit) : []
      setLogs(data)
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    void load()
  }, [load])

  return { logs, loading, reload: load }
}

export function useWorkspaceLogs(workspaceId: string | null, limit = 200) {
  const [logs, setLogs] = useState<ServerAuditLog[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = workspaceId
        ? await serverAuditService.getByWorkspace(workspaceId, limit)
        : await serverAuditService.getMy(limit)
      setLogs(data)
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [workspaceId, limit])

  useEffect(() => {
    void load()
  }, [load])

  return { logs, loading, reload: load }
}

export function useActorLogs(actorId: string, limit = 50) {
  const [logs, setLogs] = useState<ServerAuditLog[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = actorId ? await serverAuditService.getByActor(actorId, limit) : []
      setLogs(data)
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [actorId, limit])

  useEffect(() => {
    void load()
  }, [load])

  return { logs, loading, reload: load }
}