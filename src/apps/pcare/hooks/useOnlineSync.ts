import { useCallback, useEffect, useState } from 'react'
import { syncAll, getPendingChanges } from '../../../lib/sync'

export function useOnlineSync() {
  const [online, setOnline] = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date>(() => {
    try {
      const logs = JSON.parse(localStorage.getItem('labhub_sync_log') || '[]')
      if (logs.length > 0) return new Date(logs[logs.length - 1].at)
    } catch {}
    return new Date()
  })
  const [pendingChanges, setPendingChanges] = useState(getPendingChanges())

  const triggerSync = useCallback(async () => {
    if (syncing || !navigator.onLine) return
    setSyncing(true)
    try {
      await syncAll()
      setLastSync(new Date())
      setPendingChanges(getPendingChanges())
    } catch (e) {
      console.warn('[Sync] triggerSync failed:', e)
    } finally {
      setSyncing(false)
    }
  }, [syncing])

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

  return { online, syncing, lastSync, triggerSync, pendingChanges }
}
