import { useCallback, useEffect, useState } from 'react'
import type { ActionLog, ActionType } from '../types/actionLog'
import { actionLogService } from '../services/actionLogService'

export function useActionLog(pcId: string) {
  const [logs, setLogs] = useState<ActionLog[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const data = actionLogService.getByPC(pcId)
    setLogs(data)
    setLoading(false)
  }, [pcId])

  useEffect(() => { load() }, [load])

  const log = useCallback(
    (type: ActionType, description: string) => {
      const entry = actionLogService.log(pcId, type, description)
      setLogs((prev) => [entry, ...prev])
      return entry
    },
    [pcId],
  )

  return { logs, loading, log, reload: load }
}
