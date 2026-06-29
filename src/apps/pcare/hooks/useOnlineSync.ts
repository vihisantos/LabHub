import { useCallback, useEffect, useState } from 'react'
import { syncAll, getPendingChanges, getSyncLog, getLastSyncedAt, type SyncLogEntry } from '../../../lib/sync'

export function useOnlineSync() {
  const [online, setOnline] = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(() => getLastSyncedAt())
  const [pendingChanges, setPendingChanges] = useState(getPendingChanges())
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>(() => getSyncLog())

  const refreshLog = useCallback(() => {
    setSyncLog(getSyncLog())
    setLastSync(getLastSyncedAt())
    setPendingChanges(getPendingChanges())
  }, [])

  const triggerSync = useCallback(async () => {
    if (syncing || !navigator.onLine) return
    setSyncing(true)
    setSyncError(null)
    try {
      const result = await syncAll()
      refreshLog()
      if (result.failed.length > 0) {
        setSyncError(`Falha ao sincronizar: ${result.failed.join(', ')}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido'
      setSyncError(msg)
      console.warn('[Sync] triggerSync failed:', e)
    } finally {
      setSyncing(false)
    }
  }, [syncing, refreshLog])

  useEffect(() => {
    function goOnline() {
      setOnline(true)
      triggerSync()
    }
    function goOffline() {
      setOnline(false)
    }
    function onStorage() {
      setPendingChanges(getPendingChanges())
    }

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    window.addEventListener('storage', onStorage)

    const interval = setInterval(() => {
      setPendingChanges(getPendingChanges())
    }, 3000)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('storage', onStorage)
      clearInterval(interval)
    }
  }, [triggerSync])

  return { online, syncing, syncError, lastSync, triggerSync, pendingChanges, syncLog, refreshLog }
}
