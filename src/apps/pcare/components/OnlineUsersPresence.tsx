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

/* ── Session-unique tab ID (persists until tab closes) ── */
function getTabId(): string {
  const key = 'labhub_pcare_tab_id'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
  }
  return id
}

const TAB_ID = getTabId()

/** Human-readable page name derived from the current path */
function getPageLabel(pathname: string): string {
  if (pathname === '/pcare') return 'Dashboard'
  if (pathname.startsWith('/pcare/pcs')) {
    if (pathname.includes('/edit')) return 'Editando PC'
    if (pathname.match(/\/pcare\/pcs\/[\w-]+$/)) return 'Detalhes do PC'
    return 'Lista de PCs'
  }
  if (pathname.startsWith('/pcare/parts/consolidado')) return 'Consolidado'
  if (pathname.startsWith('/pcare/parts')) return 'Estoque'
  if (pathname.startsWith('/pcare/maintenance')) return 'Manutenção'
  if (pathname.startsWith('/pcare/reports')) return 'Relatórios'
  if (pathname.startsWith('/pcare/checklists')) return 'Checklists'
  if (pathname.startsWith('/pcare/qr')) return 'QR Code'
  if (pathname.startsWith('/pcare/scanner')) return 'Scanner'
  if (pathname.startsWith('/pcare/settings')) return 'Configurações'
  return 'PCare'
}

export function OnlineUsersPresence() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [pulse, setPulse] = useState(false)
  const prevCountRef = useRef(0)

  const pageLabel = useMemo(() => getPageLabel(location.pathname), [location.pathname])

  const { onlineUsers } = useRealtimePresence('labhub-pcare-online', {
    key: TAB_ID,
    metadata: {
      app: 'pcare',
      page: pageLabel,
    },
  })

  /* Exclude self from the count of "other" users */
  const otherUsers = onlineUsers.filter((u) => u.key !== TAB_ID)

  /* ── Sound (shared with GlobalPresenceIndicator) ── */
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

  if (otherUsers.length === 0) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-colors ${
            pulse
              ? 'text-emerald-500 bg-emerald-500/15 animate-pulse'
              : 'text-fg-dim hover:bg-input hover:text-fg'
          }`}
          aria-label={`${otherUsers.length} pessoa(s) online`}
        >
          <icons.ui.userCheck size={14} className="text-emerald-500" />
          <span>{otherUsers.length > 1 ? `${otherUsers.length}` : ''}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-56 border border-line bg-card shadow-2xl shadow-black/20 !p-0"
      >
        <div className="border-b border-line px-4 py-3">
          <p className="text-xs font-semibold text-fg">Online agora</p>
          <p className="text-[10px] text-fg-muted mt-0.5">
            {otherUsers.length} {otherUsers.length === 1 ? 'pessoa' : 'pessoas'} no PCare
          </p>
        </div>
        <div className="max-h-48 overflow-y-auto px-3 py-2">
          {otherUsers.map((user) => (
            <div
              key={user.key}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] font-bold text-emerald-500">
                <icons.ui.user size={12} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-fg truncate">
                  {user.metadata?.page ?? 'PCare'}
                </p>
                <p className="text-[9px] text-fg-muted">
                  {user.metadata?.app ?? 'desconhecido'}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-2">
          <span className="text-[9px] text-fg-muted">
            {otherUsers.length === 1 ? 'Você está online' : `${otherUsers.length} pessoas online`}
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
