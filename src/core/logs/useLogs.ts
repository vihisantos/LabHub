import { useCallback, useEffect, useState } from 'react'
import type { AuditLog, AuditLogFormData } from './types'
import { logService } from './service'

export function useLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = logService.getAll()
    setLogs(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const log = useCallback((data: AuditLogFormData) => {
    const entry = logService.log(data)
    setLogs((prev) => [entry, ...prev])
    return entry
  }, [])

  const remove = useCallback((id: string) => {
    logService.remove(id)
    setLogs((prev) => prev.filter((l) => l.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    logService.clearAll()
    setLogs([])
  }, [])

  return { logs, loading, log, remove, clearAll, reload: load }
}

export function useEntityLogs(entity: string, entityId: string) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = logService.getByEntity(entity, entityId)
    setLogs(data)
    setLoading(false)
  }, [entity, entityId])

  useEffect(() => {
    load()
  }, [load])

  return { logs, loading, reload: load }
}
