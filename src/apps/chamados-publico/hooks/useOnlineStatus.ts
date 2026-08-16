import { useEffect, useState } from 'react'

const PROBE_URL = '/favicon.svg'
const PROBE_TIMEOUT_MS = 5000
const PROBE_INTERVAL_MS = 20000

async function probeConnectivity(): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(PROBE_URL, { cache: 'no-store', signal: controller.signal })
    if (!res.ok) return false
    return (res.headers.get('content-type') || '').includes('image/svg+xml')
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

export function useOnlineStatus(): { online: boolean } {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    let cancelled = false
    let interval: ReturnType<typeof setInterval> | undefined

    async function check() {
      if (cancelled) return
      if (!navigator.onLine) {
        setOnline(false)
        return
      }
      const ok = await probeConnectivity()
      if (!cancelled) setOnline(ok)
    }

    function handleOnline() {
      setOnline(true)
      check()
    }

    function handleOffline() {
      setOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    check()
    interval = setInterval(check, PROBE_INTERVAL_MS)

    return () => {
      cancelled = true
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (interval) clearInterval(interval)
    }
  }, [])

  return { online }
}
