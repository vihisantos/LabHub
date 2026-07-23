import { useEffect, useState } from 'react'
import { useOnlineSync } from '../hooks/useOnlineSync'
import { icons } from '../../../lib/icons'
import { Popover, PopoverTrigger, PopoverContent } from '../../../lib/components/ui'

function formatRelativeTime(date: Date | null): string {
  if (!date) return 'Nunca sincronizado'
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 10) return 'Agora há pouco'
  if (diff < 60) return `${diff}s atrás`
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`
  return date.toLocaleDateString('pt-BR')
}

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function SyncStatusBadge() {
  const { online, syncing, syncError, lastSync, pendingChanges, triggerSync, syncLog } = useOnlineSync()
  const [open, setOpen] = useState(false)
  const [relativeTime, setRelativeTime] = useState(() => formatRelativeTime(lastSync))

  useEffect(() => {
    setRelativeTime(formatRelativeTime(lastSync))
    const id = setInterval(() => setRelativeTime(formatRelativeTime(lastSync)), 15_000)
    return () => clearInterval(id)
  }, [lastSync])

  type SyncState = 'offline' | 'syncing' | 'error' | 'pending' | 'synced'
  const state: SyncState = !online
    ? 'offline'
    : syncing
      ? 'syncing'
      : syncError
        ? 'error'
        : pendingChanges > 0
          ? 'pending'
          : 'synced'

  const badgeConfig = {
    offline: {
      icon: <icons.ui.wifiOff size={11} />,
      label: 'Offline',
      cls: 'bg-red-500/15 text-red-400 border-red-500/25',
      dot: 'bg-red-400',
    },
    syncing: {
      icon: <icons.ui.refresh size={11} className="animate-spin" />,
      label: 'Sincronizando',
      cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
      dot: null,
    },
    error: {
      icon: <icons.ui.alertCircle size={11} />,
      label: 'Erro no sync',
      cls: 'bg-red-500/15 text-red-400 border-red-500/25',
      dot: 'bg-red-400 animate-pulse',
    },
    pending: {
      icon: <icons.ui.cloud size={11} />,
      label: `${pendingChanges} pend.`,
      cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
      dot: 'bg-amber-400 animate-pulse',
    },
    synced: {
      icon: <icons.ui.cloudCheck size={11} />,
      label: 'Salvo',
      cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
      dot: 'bg-emerald-400',
    },
  }

  const cfg = badgeConfig[state]
  const recentLogs = [...syncLog].reverse().slice(0, 8)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id="sync-status-badge"
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all hover:opacity-80 ${cfg.cls}`}
        >
          {cfg.dot && <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />}
          {cfg.icon}
          <span className="hidden sm:inline">{cfg.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-72 border border-line bg-card shadow-2xl shadow-black/20 !p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-fg">Status do Sync</p>
            <p className="text-[10px] text-fg-muted mt-0.5">{relativeTime}</p>
          </div>
          <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.cls}`}>
            {cfg.icon}
            <span>
              {state === 'offline' && 'Offline'}
              {state === 'syncing' && 'Sincronizando...'}
              {state === 'error' && 'Erro'}
              {state === 'pending' && `${pendingChanges} pendente${pendingChanges > 1 ? 's' : ''}`}
              {state === 'synced' && 'Sincronizado'}
            </span>
          </div>
        </div>

        {syncError && (
          <div className="mx-3 mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[10px] text-red-400">
            <p className="font-medium mb-0.5">Último erro:</p>
            <p className="font-mono break-all">{syncError}</p>
          </div>
        )}

        <div className="px-3 pt-3 pb-2">
          <button
            type="button"
            id="sync-now-btn"
            onClick={() => { triggerSync(); setOpen(false) }}
            disabled={syncing || !online}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 py-2 text-xs font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            <icons.ui.refresh size={12} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
          </button>
        </div>

        {recentLogs.length > 0 && (
          <div className="border-t border-line px-4 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Log recente</p>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {recentLogs.map((entry, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        entry.status === 'ok' ? 'bg-emerald-400' :
                        entry.status === 'error' ? 'bg-red-400' : 'bg-amber-400'
                      }`}
                    />
                    <span className="text-[10px] text-fg-dim truncate">{entry.collection}</span>
                  </div>
                  <span className="text-[9px] text-fg-muted shrink-0">{formatTime(entry.at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {recentLogs.length === 0 && (
          <div className="px-4 pb-4 pt-2 text-center text-[10px] text-fg-muted">
            Nenhuma sincronização registrada ainda.
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
