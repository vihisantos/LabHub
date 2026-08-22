import { useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useRealtimePresence } from '../../../lib/useRealtimePresence'

/* ── Global tab ID shared across all apps ── */
function getGlobalTabId(): string {
  const key = 'labhub_global_tab_id'
  try {
    if (typeof sessionStorage !== 'undefined') {
      let id = sessionStorage.getItem(key)
      if (!id) {
        id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
        sessionStorage.setItem(key, id)
      }
      return id
    }
  } catch {
    /* sessionStorage blocked (e.g. Safari private mode) — fall through to ephemeral ID */
  }
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const TAB_ID = getGlobalTabId()

/** Detect which app the user is currently in */
function getAppInfo(pathname: string): { app: string; page: string } {
  if (pathname === '/' || pathname === '') return { app: 'launcher', page: 'Início' }
  if (pathname.startsWith('/roadmap')) return { app: 'roadmap', page: 'Roadmap' }
  if (pathname.startsWith('/pc-care')) return { app: 'pc-care', page: 'PC Care' }
  if (pathname.startsWith('/stock') || pathname.startsWith('/general-stock')) return { app: 'stock', page: 'Estoque' }
  if (pathname.startsWith('/reservalab')) return { app: 'reservalab', page: 'ReservaLab' }
  if (pathname.startsWith('/tv')) return { app: 'tv', page: 'TV' }
  return { app: 'desconhecido', page: pathname }
}

/** Tracks online presence silently — logs only, no visual output, no sound */
export function GlobalPresenceIndicator() {
  const location = useLocation()
  const prevCountRef = useRef(0)

  const appInfo = useMemo(() => getAppInfo(location.pathname), [location.pathname])

  const { onlineUsers } = useRealtimePresence('labhub-global-online', {
    key: TAB_ID,
    metadata: appInfo,
  })

  const otherUsers = onlineUsers.filter((u) => u.key !== TAB_ID)

  useEffect(() => {
    if (otherUsers.length === prevCountRef.current) return
    const joined = otherUsers.length > prevCountRef.current
    prevCountRef.current = otherUsers.length

    if (joined) {
      console.log(`[Presence] Usuário entrou — ${otherUsers.length} online(s)`, otherUsers)
    } else {
      console.log(`[Presence] Usuário saiu — ${otherUsers.length} online(s)`, otherUsers)
    }
  }, [otherUsers])

  return null
}
