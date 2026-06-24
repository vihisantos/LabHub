import { useCallback, useEffect, useState } from 'react'

export function useOnlineSync() {
  const [online, setOnline] = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date>(new Date())

  const triggerSync = useCallback(() => {
    setSyncing(true)
    setTimeout(() => {
      setSyncing(false)
      setLastSync(new Date())
    }, 400)
  }, [])

  useEffect(() => {
    function goOnline() {
      setOnline(true)
      triggerSync()
    }
    function goOffline() {
      setOnline(false)
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [triggerSync])

  return { online, syncing, lastSync, triggerSync }
}
