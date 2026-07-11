import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useRealtimePresence } from '../../../lib/useRealtimePresence'
import { usePresenceSound } from '../../../lib/usePresenceSound'
import { icons } from '../../../lib/icons'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '../../../lib/components/ui'

/** Format a relative time string from an ISO timestamp */
function formatOnlineSince(iso: string): string {
  const ts = new Date(iso).getTime()
  if (isNaN(ts)) return '—'
  const diff = Date.now() - ts
  if (diff < 60_000) return 'agora'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  const remainingMins = mins % 60
  if (hours < 24) return `${hours}h${remainingMins > 0 ? remainingMins + 'm' : ''}`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

/* ── Global tab ID shared across all apps ── */
function getGlobalTabId(): string {
  const key = 'labhub_global_tab_id'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
  }
  return id
}

const TAB_ID = getGlobalTabId()

/** Detect which app and page the user is currently viewing */
function getAppInfo(pathname: string): { app: string; page: string } {
  if (pathname === '/' || pathname === '') return { app: 'launcher', page: 'Início' }
  if (pathname.startsWith('/roadmap')) return { app: 'roadmap', page: 'Roadmap' }

  if (pathname.startsWith('/pcare')) {
    if (pathname === '/pcare') return { app: 'pcare', page: 'Dashboard' }
    if (pathname.includes('/pcs')) {
      if (pathname.includes('/edit')) return { app: 'pcare', page: 'Editando PC' }
      if (pathname.match(/\/pcare\/pcs\/[\w-]+$/)) return { app: 'pcare', page: 'Detalhes do PC' }
      return { app: 'pcare', page: 'Lista de PCs' }
    }
    if (pathname.includes('/parts/consolidado')) return { app: 'pcare', page: 'Consolidado' }
    if (pathname.includes('/parts')) return { app: 'pcare', page: 'Estoque' }
    if (pathname.includes('/maintenance')) return { app: 'pcare', page: 'Manutenção' }
    if (pathname.includes('/reports')) return { app: 'pcare', page: 'Relatórios' }
    if (pathname.includes('/checklists')) return { app: 'pcare', page: 'Checklists' }
    if (pathname.includes('/qr')) return { app: 'pcare', page: 'QR Code' }
    if (pathname.includes('/scanner')) return { app: 'pcare', page: 'Scanner' }
    if (pathname.includes('/settings')) return { app: 'pcare', page: 'Configurações' }
    return { app: 'pcare', page: 'PCare' }
  }

  if (pathname.startsWith('/stock') || pathname.startsWith('/general-stock')) {
    if (pathname === '/stock' || pathname === '/general-stock') return { app: 'stock', page: 'Dashboard' }
    if (pathname.includes('/items')) return { app: 'stock', page: 'Itens' }
    if (pathname.includes('/movements')) return { app: 'stock', page: 'Movimentações' }
    if (pathname.includes('/kits')) return { app: 'stock', page: 'Kits' }
    if (pathname.includes('/inventory')) return { app: 'stock', page: 'Inventário' }
    if (pathname.includes('/maintenance')) return { app: 'stock', page: 'Manutenção' }
    if (pathname.includes('/qr')) return { app: 'stock', page: 'QR Code' }
    if (pathname.includes('/entry-exit')) return { app: 'stock', page: 'Entrada/Saída' }
    return { app: 'stock', page: 'Estoque' }
  }

  if (pathname.startsWith('/reservalab')) {
    if (pathname === '/reservalab') return { app: 'reservalab', page: 'Reservas' }
    if (pathname.includes('/dashboard')) return { app: 'reservalab', page: 'Dashboard' }
    if (pathname.includes('/tablets')) return { app: 'reservalab', page: 'Tablets' }
    return { app: 'reservalab', page: 'ReservaLab' }
  }

  if (pathname.startsWith('/tv')) {
    if (pathname === '/tv') return { app: 'tv', page: 'Admin' }
    if (pathname.includes('/display')) return { app: 'tv', page: 'Display' }
    return { app: 'tv', page: 'TV' }
  }

  return { app: 'desconhecido', page: pathname }
}

const APP_COLORS: Record<string, string> = {
  pcare: '#06b6d4',    // cyan
  stock: '#10b981',    // emerald
  reservalab: '#6366f1', // indigo
  tv: '#a855f7',       // purple
  launcher: '#64748b', // slate
  roadmap: '#64748b',
}

const APP_LABELS: Record<string, string> = {
  pcare: 'PCare',
  stock: 'Estoque',
  reservalab: 'ReservaLab',
  tv: 'TV',
  launcher: 'Início',
  roadmap: 'Roadmap',
}

export function GlobalPresenceIndicator() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [pulse, setPulse] = useState(false)
  const [tick, setTick] = useState(0)
  const prevCountRef = useRef(0)

  const appInfo = useMemo(() => getAppInfo(location.pathname), [location.pathname])

  const { onlineUsers } = useRealtimePresence('labhub-global-online', {
    key: TAB_ID,
    metadata: appInfo,
  })

  /* Exclude self */
  const otherUsers = onlineUsers.filter((u) => u.key !== TAB_ID)

    /* ── Sound (shared with OnlineUsersPresence) ── */
  const { muted, toggleMute, playBeep } = usePresenceSound()

  /* ── Pulse + beep when count changes (someone joined or left) ── */
  useEffect(() => {
    if (otherUsers.length === prevCountRef.current) return
    const joined = otherUsers.length > prevCountRef.current
    prevCountRef.current = otherUsers.length
    if (otherUsers.length > 0) {
      setPulse(true)
      playBeep(joined ? 'join' : 'leave')
      const timer = setTimeout(() => setPulse(false), 700)
      return () => clearTimeout(timer)
    }
  }, [otherUsers.length, playBeep])

  /* ── Tick every 15s to refresh relative times when popover is open ── */
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(timer)
  }, [open])

  /* Memoize formatted users so they only recompute on tick or when users change */
  const formattedUsers = useMemo(() => {
    const map = new Map<string, string>()
    for (const u of otherUsers) {
      map.set(u.key, formatOnlineSince(u.onlineAt))
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherUsers, tick])

  /* Group users by app (must be before any early return) */
  const byApp = useMemo(() => {
    const groups: Record<string, typeof otherUsers> = {}
    for (const user of otherUsers) {
      const app = user.metadata?.app ?? 'outros'
      if (!groups[app]) groups[app] = []
      groups[app].push(user)
    }
    return groups
  }, [otherUsers])

  if (otherUsers.length === 0) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`fixed bottom-4 right-4 z-[60] flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium shadow-lg shadow-black/10 backdrop-blur-lg transition-all active:scale-95 ${
            pulse
              ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-400 animate-pulse'
              : 'border-emerald-500/20 bg-card/90 text-emerald-500 hover:bg-card hover:shadow-emerald-500/10'
          }`}
          aria-label={`${otherUsers.length} pessoa(s) online`}
        >
          <icons.ui.userCheck size={15} />
          <span>{otherUsers.length}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-64 border border-line bg-card shadow-2xl shadow-black/20 !p-0"
      >
        <div className="border-b border-line px-4 py-3">
          <p className="text-xs font-semibold text-fg">Online agora</p>
          <p className="text-[10px] text-fg-muted mt-0.5">
            {otherUsers.length} {otherUsers.length === 1 ? 'pessoa' : 'pessoas'} no LabHub
          </p>
        </div>

        <div className="max-h-60 overflow-y-auto px-3 py-2">
          {Object.entries(byApp).map(([app, users]) => (
            <div key={app} className="mb-1 last:mb-0">
              <div className="flex items-center gap-1.5 px-2 py-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: APP_COLORS[app] ?? '#64748b' }}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                  {APP_LABELS[app] ?? app}
                </span>
                <span className="ml-auto text-[9px] text-fg-muted">{users.length}</span>
              </div>
              {users.map((user) => (
                <div
                  key={user.key}
                  className="flex items-center gap-2 rounded-lg px-3 py-1.5"
                  title={`Online desde ${new Date(user.onlineAt).toLocaleString('pt-BR')}`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[8px] font-bold text-emerald-500">
                    <icons.ui.user size={10} />
                  </span>
                  <span className="text-[11px] text-fg truncate min-w-0">
                    {user.metadata?.page ?? app}
                  </span>
                  <span className="ml-auto shrink-0 text-[9px] text-fg-muted tabular-nums">
                    {formattedUsers.get(user.key) ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-2">
          <span className="text-[9px] text-fg-muted">
            {otherUsers.length === 1 ? 'Mais alguém online' : 'Todas as pessoas online'}
          </span>
          <button
            type="button"
            onClick={toggleMute}
            className="flex h-5 w-5 items-center justify-center rounded text-fg-muted transition-colors hover:text-fg"
            aria-label={muted ? 'Ativar som' : 'Silenciar som'}
            title={muted ? 'Som desativado' : 'Som ativado'}
          >
            {muted ? (
              <icons.ui.volumeX size={12} />
            ) : (
              <icons.ui.volume2 size={12} />
            )}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
